import type { BlockResponse } from "@emdash-cms/blocks";
import type {
  ContentPolicyDecision,
  ContentPolicyEvent,
  ContentSchedulePolicyEvent,
  PluginContext,
  SandboxedPlugin,
} from "emdash/plugin";
import { z } from "zod";

import { evaluatePolicy, makeFailureResult } from "./engine/evaluate.js";
import { ruleRegistry } from "./engine/registry.js";
import { createRuleContext } from "./emdash/context.js";
import { parsePolicyConfig, type PolicyConfig } from "./policy/schema.js";
import { parseStoredPolicy } from "./policy/migrate.js";
import { issueCounts, listIssues, listIssuesForRule, persistIssues } from "./storage/issues.js";
import type { IssueFilters, StoredIssue } from "./storage/issues.js";
import type { PreflightResult } from "./engine/types.js";

const contentKeySchema = z
  .object({ collection: z.string().min(1).max(64), contentId: z.string().min(1).max(128) })
  .strict();
const listIssuesSchema = z
  .object({
    collection: z.string().min(1).max(64).optional(),
    contentId: z.string().min(1).max(128).optional(),
    severity: z.enum(["info", "warning", "error"]).optional(),
    ruleId: z.string().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().optional(),
  })
  .strict();
const explainRuleSchema = z.object({ ruleId: z.string().min(1).max(100) }).strict();
const auditBatchSchema = z
  .object({
    collection: z.string().min(1).max(64),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(25).default(25),
  })
  .strict();
const adminInteractionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("page_load"), page: z.string() }),
  z.object({
    type: z.literal("block_action"),
    action_id: z.string(),
    value: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("form_submit"),
    action_id: z.string(),
    values: z.record(z.string(), z.unknown()),
  }),
]);
const panelInteractionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("panel_load") }),
  z.object({
    type: z.literal("block_action"),
    action_id: z.string(),
    value: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("form_submit"),
    action_id: z.string(),
    values: z.record(z.string(), z.unknown()),
  }),
]);

type CheckResponse = {
  result: PreflightResult;
  policy: PolicyConfig | null;
};

async function loadPolicy(ctx: PluginContext): Promise<PolicyConfig> {
  return parseStoredPolicy(await ctx.settings.get<unknown>("policy"));
}

async function evaluateAndPersist(
  ctx: PluginContext,
  collection: string,
  contentId: string,
  content: Record<string, unknown>,
): Promise<CheckResponse> {
  let policy: PolicyConfig;
  try {
    policy = await loadPolicy(ctx);
  } catch (error) {
    ctx.log.error(
      "Preflight policy configuration is invalid.",
      error instanceof Error ? { message: error.message } : undefined,
    );
    return {
      policy: null,
      result: makeFailureResult({
        collection,
        contentId,
        code: "POLICY_INVALID",
        message:
          "Preflight could not load the policy configuration. Ask an administrator to review Preflight settings.",
      }),
    };
  }

  const result = await evaluatePolicy(
    createRuleContext(content, collection, contentId, ctx),
    policy,
  );
  if (result.complete) {
    try {
      await persistIssues(ctx, collection, contentId, result.issues);
    } catch (error) {
      ctx.log.error(
        "Preflight could not update its issue records.",
        error instanceof Error ? { message: error.message } : undefined,
      );
      return {
        policy,
        result: {
          ...result,
          complete: false,
          evaluationError: {
            code: "CHECK_INCOMPLETE",
            message: "Preflight evaluated the entry but could not update its issue records.",
          },
        },
      };
    }
  }
  return { policy, result };
}

function getEventContent(event: ContentPolicyEvent | ContentSchedulePolicyEvent): {
  collection: string;
  contentId: string;
  data: Record<string, unknown>;
} | null {
  const record = event.content;
  if (
    typeof record.id !== "string" ||
    !record.id ||
    typeof record.data !== "object" ||
    record.data === null ||
    Array.isArray(record.data)
  ) {
    return null;
  }
  return {
    collection: event.collection,
    contentId: record.id,
    data: record.data as Record<string, unknown>,
  };
}

async function publicationDecision(
  event: ContentPolicyEvent | ContentSchedulePolicyEvent,
  ctx: PluginContext,
): Promise<ContentPolicyDecision> {
  const content = getEventContent(event);
  if (!content) {
    ctx.log.error("Preflight received an invalid publication event.");
    return {
      cancel: true,
      reason:
        "Preflight could not inspect this entry. Ask an administrator to review the runtime log.",
    };
  }
  const { policy, result } = await evaluateAndPersist(
    ctx,
    content.collection,
    content.contentId,
    content.data,
  );
  if (!policy) {
    return {
      cancel: true,
      reason:
        "Preflight could not load its policy. Ask an administrator to review Preflight settings.",
    };
  }
  if (policy.mode === "observe") {
    if (!result.complete)
      ctx.log.error("Preflight check did not complete while in observe mode.", {
        collection: content.collection,
        contentId: content.contentId,
      });
    return;
  }
  if (!result.complete) {
    return {
      cancel: true,
      reason:
        "Preflight could not complete the policy check. Review the Preflight panel before publishing.",
    };
  }
  const errors = result.issues.filter((issue) => issue.severity === "error").length;
  if (errors > 0) {
    return {
      cancel: true,
      reason: `Preflight blocked publication: ${errors} policy error${errors === 1 ? "" : "s"}. Open the Preflight panel for details.`,
    };
  }
}

function policyText(policy: PolicyConfig): string {
  return JSON.stringify(policy, null, 2);
}

function renderIssue(issue: StoredIssue) {
  return {
    type: "section" as const,
    text: `${issue.severity.toUpperCase()} · ${issue.ruleId}\n${issue.message}\n${issue.collection}/${issue.contentId}${issue.path ? ` · ${issue.path}` : ""}`,
  };
}

function errorBlock(message: string): BlockResponse {
  return {
    blocks: [
      {
        type: "banner",
        title: "Preflight needs attention",
        description: message,
        variant: "error",
      },
    ],
  };
}

async function renderDashboard(ctx: PluginContext): Promise<BlockResponse> {
  let policy: PolicyConfig;
  try {
    policy = await loadPolicy(ctx);
  } catch {
    return errorBlock(
      "The saved policy is invalid. Correct the policy JSON below before relying on checks.",
    );
  }
  const [counts, recent] = await Promise.all([issueCounts(ctx), listIssues(ctx, { limit: 5 })]);
  const modeLabel = policy.mode.toUpperCase();
  const blocks: BlockResponse["blocks"] = [
    { type: "header", text: "EmDash Preflight" },
    {
      type: "banner",
      title: `Mode: ${modeLabel}`,
      description:
        policy.mode === "observe"
          ? "Policies are checked and issues are recorded. Publication continues while you review the results."
          : "Entries with error severity issues are blocked before publication or scheduling.",
      variant: policy.mode === "enforce" ? "alert" : "default",
    },
    {
      type: "stats",
      items: [
        { label: "Errors", value: counts.errors },
        { label: "Warnings", value: counts.warnings },
        { label: "Info", value: counts.info },
      ],
    },
    { type: "header", text: "Recent issues" },
  ];
  if (recent.items.length) blocks.push(...recent.items.map(renderIssue));
  else
    blocks.push({
      type: "empty",
      title: "No open issues",
      description: "Configure a collection policy below, then run a check or publish an entry.",
    });
  blocks.push(
    { type: "divider" },
    { type: "header", text: "Policy configuration" },
    {
      type: "section",
      text: "Policies are declarative JSON. The editor validates the policy version, rule IDs, and rule-specific options before saving.",
    },
    {
      type: "form",
      block_id: "policy-form",
      fields: [
        {
          type: "text_input",
          action_id: "policy_json",
          label: "Policy JSON",
          multiline: true,
          initial_value: policyText(policy),
        },
      ],
      submit: { label: "Validate and save", action_id: "save_policy" },
    },
    ...(policy.mode === "observe"
      ? [
          {
            type: "actions" as const,
            elements: [
              {
                type: "button" as const,
                action_id: "enable_enforce",
                label: "Enable enforcement",
                style: "primary" as const,
                confirm: {
                  title: "Enable enforcement?",
                  text: "Error severity Preflight issues will block publishing and scheduling.",
                  confirm: "Enable",
                  deny: "Cancel",
                },
              },
            ],
          },
        ]
      : [
          {
            type: "actions" as const,
            elements: [
              {
                type: "button" as const,
                action_id: "disable_enforce",
                label: "Return to observe mode",
                style: "secondary" as const,
              },
            ],
          },
        ]),
  );
  return { blocks };
}

async function runEntryCheck(
  ctx: PluginContext,
  collection: string,
  contentId: string,
): Promise<CheckResponse | null> {
  if (!ctx.content) return null;
  const entry = await ctx.content.get(collection, contentId);
  if (!entry) return null;
  return evaluateAndPersist(ctx, collection, contentId, entry.data);
}

const plugin: SandboxedPlugin = {
  hooks: {
    "content:beforePublish": publicationDecision,
    "content:beforeSchedule": publicationDecision,
  },
  routes: {
    "check-entry": {
      permission: "content:read",
      handler: async (routeCtx, ctx) => {
        const parsed = contentKeySchema.safeParse(routeCtx.input);
        if (!parsed.success) return { ok: false, error: { code: "INVALID_INPUT" } };
        const check = await runEntryCheck(ctx, parsed.data.collection, parsed.data.contentId);
        return check
          ? { ok: true, ...check.result }
          : {
              ok: false,
              error: {
                code: "CONTENT_NOT_FOUND",
                collection: parsed.data.collection,
                contentId: parsed.data.contentId,
              },
            };
      },
    },
    "issues/list": {
      permission: "plugins:read",
      handler: async (routeCtx, ctx) => {
        const parsed = listIssuesSchema.safeParse(routeCtx.input);
        if (!parsed.success) return { ok: false, error: { code: "INVALID_INPUT" } };
        const result = await listIssues(ctx, parsed.data as IssueFilters);
        return { ok: true, ...result };
      },
    },
    "rules/list": {
      permission: "schema:read",
      handler: async (_routeCtx, ctx) => ({
        ok: true,
        rules: Object.values(ruleRegistry).map(({ id, description }) => ({ id, description })),
        collections: (await ctx.schema?.listCollections()) ?? [],
      }),
    },
    "rules/explain": {
      permission: "plugins:read",
      handler: async (routeCtx, ctx) => {
        const parsed = explainRuleSchema.safeParse(routeCtx.input);
        if (!parsed.success || !(parsed.data.ruleId in ruleRegistry))
          return { ok: false, error: { code: "UNKNOWN_RULE" } };
        const ruleId = parsed.data.ruleId as keyof typeof ruleRegistry;
        const policy = await loadPolicy(ctx);
        const configured = {
          default: policy.defaults[ruleId] ?? null,
          collections: Object.fromEntries(
            Object.entries(policy.collections)
              .filter(([, entry]) => entry.rules[ruleId])
              .map(([collection, entry]) => [collection, entry.rules[ruleId]]),
          ),
        };
        const issues = await listIssuesForRule(ctx, ruleId);
        return {
          ok: true,
          ruleId,
          purpose: ruleRegistry[ruleId].description,
          configuration: configured,
          issues,
          whatMustChange: issues.map((issue) => ({
            collection: issue.collection,
            contentId: issue.contentId,
            path: issue.path ?? null,
            message: issue.message,
          })),
        };
      },
    },
    "audit/batch": {
      permission: "content:read",
      handler: async (routeCtx, ctx) => {
        const parsed = auditBatchSchema.safeParse(routeCtx.input);
        if (!parsed.success) return { ok: false, error: { code: "INVALID_INPUT" } };
        if (!ctx.content) return { ok: false, error: { code: "CONTENT_READ_UNAVAILABLE" } };
        const page = await ctx.content.list(parsed.data.collection, {
          where: { status: "published" },
          limit: parsed.data.limit,
          ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
        });
        const results: Array<{ contentId: string; result: PreflightResult }> = [];
        for (const entry of page.items.slice(0, parsed.data.limit)) {
          results.push({
            contentId: entry.id,
            result: (await evaluateAndPersist(ctx, parsed.data.collection, entry.id, entry.data))
              .result,
          });
        }
        return {
          ok: true,
          results,
          nextCursor: page.cursor ?? null,
          hasMore: page.hasMore,
          pageLimit: parsed.data.limit,
        };
      },
    },
    admin: {
      permission: "plugins:manage",
      handler: async (routeCtx, ctx) => {
        const parsed = adminInteractionSchema.safeParse(routeCtx.input);
        if (!parsed.success) return errorBlock("Preflight received an unsupported page action.");
        const interaction = parsed.data;
        if (interaction.type === "form_submit" && interaction.action_id === "save_policy") {
          const policyJson = interaction.values.policy_json;
          if (typeof policyJson !== "string") return errorBlock("Policy JSON must be text.");
          let decoded: unknown;
          try {
            decoded = JSON.parse(policyJson);
          } catch {
            return errorBlock("Policy JSON could not be parsed.");
          }
          const validated = parsePolicyConfig(decoded);
          if (!validated.success) {
            return errorBlock(
              validated.errors
                .slice(0, 3)
                .map((issue) => `${issue.path || "policy"}: ${issue.message}`)
                .join("\n"),
            );
          }
          await ctx.settings.set("policy", validated.data);
          return {
            ...(await renderDashboard(ctx)),
            toast: { message: "Policy validated and saved.", type: "success" },
          };
        }
        if (
          interaction.type === "block_action" &&
          (interaction.action_id === "enable_enforce" ||
            interaction.action_id === "disable_enforce")
        ) {
          const current = await loadPolicy(ctx);
          const next = {
            ...current,
            mode:
              interaction.action_id === "enable_enforce"
                ? ("enforce" as const)
                : ("observe" as const),
          };
          await ctx.settings.set("policy", next);
          return {
            ...(await renderDashboard(ctx)),
            toast: { message: `Preflight is now in ${next.mode} mode.`, type: "success" },
          };
        }
        return renderDashboard(ctx);
      },
    },
    "entry-panel": {
      permission: "content:read",
      handler: async (routeCtx, ctx) => {
        const parsed = panelInteractionSchema.safeParse(routeCtx.input);
        if (
          !parsed.success ||
          !routeCtx.ui ||
          routeCtx.ui.surface !== "content-editor-panel" ||
          !routeCtx.ui.entry
        ) {
          return errorBlock(
            "Open Preflight from a saved content entry to check its last saved state.",
          );
        }
        const { collection, id } = routeCtx.ui.entry;
        const check = await runEntryCheck(ctx, collection, id);
        if (!check) return errorBlock("The saved entry could not be read.");
        const { result, policy } = check;
        const blocks: BlockResponse["blocks"] = [
          { type: "header", text: "Preflight" },
          { type: "context", text: `Last saved state · ${collection}/${id}` },
        ];
        if (result.evaluationError)
          blocks.push({
            type: "banner",
            title: "Check incomplete",
            description: result.evaluationError.message,
            variant: "error",
          });
        else if (result.issues.length === 0)
          blocks.push({
            type: "banner",
            title: "All enabled policies passed",
            description: "The saved entry has no open Preflight issues.",
            variant: "default",
          });
        else
          blocks.push(
            ...result.issues.map((issue) => ({
              type: "section" as const,
              text: `${issue.severity.toUpperCase()} · ${issue.ruleId}\n${issue.message}${issue.path ? `\n${issue.path}` : ""}`,
            })),
          );
        if (policy?.mode === "enforce" && result.status === "fail" && result.complete)
          blocks.push({
            type: "context",
            text: "Publication is blocked while Preflight is in enforce mode.",
          });
        return { blocks };
      },
    },
  },
  mcp: {
    tools: {
      check_entry: {
        description: "Evaluate the configured Preflight policies for one saved EmDash entry.",
        route: "check-entry",
        input: contentKeySchema,
        destructive: false,
      },
      list_issues: {
        description:
          "List stored Preflight issues using optional collection, entry, severity, and rule filters.",
        route: "issues/list",
        input: listIssuesSchema,
        destructive: false,
      },
      explain_rule: {
        description:
          "Explain a Preflight rule, its active configuration, and the stored entries that currently fail it.",
        route: "rules/explain",
        input: explainRuleSchema,
        destructive: false,
      },
      audit_batch: {
        description:
          "Audit up to 25 published entries per invocation with a cursor; call again with nextCursor to continue.",
        route: "audit/batch",
        input: auditBatchSchema,
        destructive: false,
      },
    },
  },
};

export default plugin;
