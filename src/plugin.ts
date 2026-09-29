import type { BlockResponse } from "@emdash-cms/blocks";
import type {
  ContentPolicyDecision,
  ContentPolicyEvent,
  ContentSchedulePolicyEvent,
  PluginContext,
  SandboxedPlugin,
} from "emdash/plugin";
import { z } from "zod";

import { renderDashboard } from "./admin/dashboard.js";
import {
  draftForRule,
  draftFromValues,
  policyUiCopy,
  removeRule,
  ruleDraftError,
  upsertRule,
} from "./admin/policy-ui.js";
import { evaluatePolicy, makeFailureResult } from "./engine/evaluate.js";
import { ruleRegistry } from "./engine/registry.js";
import { isRuleId } from "./engine/types.js";
import { createRuleContext } from "./emdash/context.js";
import { parsePolicyConfig, type PolicyConfig } from "./policy/schema.js";
import { parseStoredPolicy } from "./policy/migrate.js";
import { listIssues, listIssuesForRule, persistIssues } from "./storage/issues.js";
import type { IssueFilters } from "./storage/issues.js";
import type { PreflightResult } from "./engine/types.js";
import {
  getUiLanguage,
  getUiMessages,
  localizeHookReason,
  localizeIssueMessage,
  localizePolicyError,
  severityLabel,
} from "./i18n.js";

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
const ruleFormKeysSchema = z.object({
  collection: z.string().min(1),
  rule_id: z.enum([
    "field.required_when",
    "media.alt.required",
    "byline.required",
    "taxonomy.min_terms",
    "reference.published",
  ]),
  severity: z.enum(["off", "info", "warning", "error"]),
});
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
  locale?: string;
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
    ...(typeof record.locale === "string" ? { locale: record.locale } : {}),
  };
}

async function publicationDecision(
  event: ContentPolicyEvent | ContentSchedulePolicyEvent,
  ctx: PluginContext,
): Promise<ContentPolicyDecision> {
  const content = getEventContent(event);
  const locale = content?.locale ?? ctx.site.locale;
  if (!content) {
    ctx.log.error("Preflight received an invalid publication event.");
    return {
      cancel: true,
      reason: localizeHookReason("invalidCheck", locale),
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
      reason: localizeHookReason("policyLoadError", locale),
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
      reason: localizeHookReason("incompletePublish", locale),
    };
  }
  const errors = result.issues.filter((issue) => issue.severity === "error").length;
  if (errors > 0) {
    return {
      cancel: true,
      reason: localizeHookReason(
        "scheduledAt" in event ? "blockedSchedule" : "blockedPublish",
        locale,
        errors,
      ),
    };
  }
}

function errorBlock(message: string, locale: string): BlockResponse {
  const copy = getUiMessages(locale);
  return {
    blocks: [
      {
        type: "banner",
        title: copy.needsAttention,
        description: message,
        variant: "error",
      },
    ],
  };
}

function examplePolicyText(collection: string): string {
  return JSON.stringify(
    {
      version: 1,
      mode: "observe",
      defaults: {},
      collections: {
        [collection]: { rules: { "byline.required": { severity: "error" } } },
      },
    },
    null,
    2,
  );
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
        const locale = routeCtx.ui?.locale ?? ctx.site.locale;
        const copy = getUiMessages(locale);
        const parsed = adminInteractionSchema.safeParse(routeCtx.input);
        if (!parsed.success) return errorBlock(copy.unsupportedAction, locale);
        const interaction = parsed.data;
        if (interaction.type === "form_submit" && interaction.action_id === "save_rule") {
          const current = await loadPolicy(ctx);
          const collections = (await ctx.schema?.listCollections()) ?? [];
          const fallback = draftForRule(current, collections[0]?.slug ?? "", "byline.required");
          const draft = draftFromValues(interaction.values, fallback);
          const ui = policyUiCopy(locale);
          if (!ruleFormKeysSchema.safeParse(interaction.values).success)
            return renderDashboard(ctx, locale, { draft, error: ui.invalid });
          if (!draft.collection || !collections.some((item) => item.slug === draft.collection)) {
            return renderDashboard(ctx, locale, {
              draft,
              error: !draft.collection ? ui.collectionRequired : ui.collectionUnavailable,
            });
          }
          if (
            draft.ruleId === "reference.published" &&
            draft.severity !== "off" &&
            !collections.some((item) => item.slug === draft.targetCollection)
          )
            return renderDashboard(ctx, locale, { draft, error: ui.invalidReference });
          const next = upsertRule(current, draft);
          if (!next)
            return renderDashboard(ctx, locale, { draft, error: ruleDraftError(draft, locale) });
          await ctx.settings.set("policy", next);
          return {
            ...(await renderDashboard(ctx, locale, { draft })),
            toast: { message: ui.saved, type: "success" },
          };
        }
        if (
          interaction.type === "block_action" &&
          (interaction.action_id === "edit_rule" || interaction.action_id === "remove_rule")
        ) {
          const value = interaction.value;
          if (!value || typeof value !== "object" || Array.isArray(value))
            return errorBlock(copy.unsupportedAction, locale);
          const { collection, ruleId } = value as Record<string, unknown>;
          if (typeof collection !== "string" || typeof ruleId !== "string" || !isRuleId(ruleId))
            return errorBlock(copy.unsupportedAction, locale);
          const current = await loadPolicy(ctx);
          if (!current.collections[collection]?.rules[ruleId]) return renderDashboard(ctx, locale);
          if (interaction.action_id === "edit_rule")
            return renderDashboard(ctx, locale, {
              draft: draftForRule(current, collection, ruleId),
            });
          await ctx.settings.set("policy", removeRule(current, collection, ruleId));
          return {
            ...(await renderDashboard(ctx, locale)),
            toast: { message: policyUiCopy(locale).removed, type: "success" },
          };
        }
        if (interaction.type === "form_submit" && interaction.action_id === "save_policy") {
          const policyJson = interaction.values.policy_json;
          if (typeof policyJson !== "string")
            return renderDashboard(ctx, locale, { error: copy.policyJsonMustBeText });
          let decoded: unknown;
          try {
            decoded = JSON.parse(policyJson);
          } catch {
            return renderDashboard(ctx, locale, {
              policyInput: policyJson,
              error: copy.policyJsonParseError,
            });
          }
          const validated = parsePolicyConfig(decoded);
          if (!validated.success) {
            return renderDashboard(ctx, locale, {
              policyInput: policyJson,
              error: `${copy.policySaveError}\n${validated.errors
                .slice(0, 3)
                .map((issue) => localizePolicyError(issue.path, issue.message, locale))
                .join("\n")}`,
            });
          }
          await ctx.settings.set("policy", validated.data);
          return {
            ...(await renderDashboard(ctx, locale)),
            toast: { message: copy.policySaved, type: "success" },
          };
        }
        if (interaction.type === "block_action" && interaction.action_id === "load_example") {
          const collections = await ctx.schema?.listCollections();
          const collection = collections?.[0]?.slug ?? "posts";
          return {
            ...(await renderDashboard(ctx, locale, { policyInput: examplePolicyText(collection) })),
            toast: { message: copy.exampleLoaded, type: "success" },
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
          const modeName =
            getUiLanguage(locale) === "ja"
              ? next.mode === "observe"
                ? "監視"
                : "公開ゲート"
              : next.mode;
          return {
            ...(await renderDashboard(ctx, locale)),
            toast: {
              message: copy.modeChanged.replace("{mode}", modeName),
              type: "success",
            },
          };
        }
        return renderDashboard(ctx, locale);
      },
    },
    "entry-panel": {
      permission: "content:read",
      handler: async (routeCtx, ctx) => {
        const locale = routeCtx.ui?.locale ?? ctx.site.locale;
        const copy = getUiMessages(locale);
        const parsed = panelInteractionSchema.safeParse(routeCtx.input);
        if (
          !parsed.success ||
          !routeCtx.ui ||
          routeCtx.ui.surface !== "content-editor-panel" ||
          !routeCtx.ui.entry
        ) {
          return errorBlock(copy.openFromSavedEntry, locale);
        }
        const { collection, id } = routeCtx.ui.entry;
        const check = await runEntryCheck(ctx, collection, id);
        if (!check) return errorBlock(copy.entryReadError, locale);
        const { result, policy } = check;
        const blocks: BlockResponse["blocks"] = [
          { type: "header", text: copy.entryPanelTitle },
          { type: "context", text: `${copy.savedEntry} · ${collection}/${id}` },
        ];
        if (result.evaluationError)
          blocks.push({
            type: "banner",
            title: copy.checkIncomplete,
            description:
              result.evaluationError.code === "POLICY_INVALID"
                ? copy.policyInvalid
                : copy.checkIncompleteDescription,
            variant: "error",
          });
        else if (result.issues.length === 0)
          blocks.push({
            type: "banner",
            title: copy.allPassed,
            description: copy.allPassedDescription,
            variant: "default",
          });
        else
          blocks.push(
            ...result.issues.map((issue) => ({
              type: "section" as const,
              text: `${severityLabel(issue.severity, locale)} · ${issue.ruleId}\n${localizeIssueMessage(issue, locale)}${issue.path ? `\n${issue.path}` : ""}`,
            })),
          );
        if (policy?.mode === "enforce" && result.status === "fail" && result.complete)
          blocks.push({
            type: "context",
            text: copy.blockedInEnforce,
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
