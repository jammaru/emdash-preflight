import type { BlockResponse } from "@emdash-cms/blocks";
import type { PluginContext } from "emdash/plugin";

import { getUiMessages, localizeIssueMessage, severityLabel } from "../i18n.js";
import { parseStoredPolicy } from "../policy/migrate.js";
import type { PolicyConfig } from "../policy/schema.js";
import { issueCounts, listIssues } from "../storage/issues.js";
import type { StoredIssue } from "../storage/issues.js";
import { policyUiCopy, renderPolicyJson, renderPolicyRules, type RuleDraft } from "./policy-ui.js";

function renderIssue(issue: StoredIssue, locale: string) {
  return {
    type: "section" as const,
    text: `${severityLabel(issue.severity, locale)} · ${issue.ruleId}\n${localizeIssueMessage(issue, locale)}\n${issue.collection}/${issue.contentId}${issue.path ? ` · ${issue.path}` : ""}`,
  };
}

export async function renderDashboard(
  ctx: PluginContext,
  locale: string,
  options: { policyInput?: string; draft?: RuleDraft; error?: string } = {},
): Promise<BlockResponse> {
  const copy = getUiMessages(locale);
  const ui = policyUiCopy(locale);
  let policy: PolicyConfig;
  let policyInput = options.policyInput;
  let error = options.error;
  try {
    policy = parseStoredPolicy(await ctx.settings.get<unknown>("policy"));
  } catch {
    const raw = await ctx.settings.get<unknown>("policy");
    policy = { version: 1, mode: "observe", defaults: {}, collections: {} };
    policyInput ??= JSON.stringify(raw, null, 2);
    error = copy.policyInvalid;
  }
  const [counts, recent, rules] = await Promise.all([
    issueCounts(ctx),
    listIssues(ctx, { limit: 5 }),
    renderPolicyRules(ctx, policy, locale, options.draft),
  ]);
  const overview: BlockResponse["blocks"] = [
    {
      type: "stats",
      items: [
        { label: copy.errors, value: counts.errors },
        { label: copy.warnings, value: counts.warnings },
        { label: copy.info, value: counts.info },
      ],
    },
    { type: "header", text: copy.recentIssues },
    ...(recent.items.length
      ? recent.items.map((issue) => renderIssue(issue, locale))
      : [{ type: "empty" as const, title: copy.noIssues, description: copy.noIssuesDescription }]),
    { type: "divider" },
    { type: "header", text: copy.gettingStarted },
    { type: "section", text: copy.stepOne },
    { type: "section", text: copy.stepTwo },
    { type: "section", text: copy.stepThree },
    { type: "section", text: copy.stepFour },
    { type: "section", text: copy.stepFive },
  ];
  const blocks: BlockResponse["blocks"] = [
    { type: "header", text: copy.dashboardTitle },
    {
      type: "banner",
      title: policy.mode === "observe" ? copy.modeObserve : copy.modeEnforce,
      description: policy.mode === "observe" ? copy.observeDescription : copy.enforceDescription,
      variant: policy.mode === "enforce" ? "alert" : "default",
    },
    ...(error
      ? [
          {
            type: "banner" as const,
            title: copy.needsAttention,
            description: error,
            variant: "error" as const,
          },
        ]
      : []),
    {
      type: "tab",
      default_tab: policyInput !== undefined ? 2 : 0,
      panels: [
        { label: ui.rules, blocks: rules },
        { label: ui.overview, blocks: overview },
        { label: ui.json, blocks: renderPolicyJson(policy, locale, policyInput) },
      ],
    },
    {
      type: "actions",
      elements:
        policy.mode === "observe"
          ? [
              {
                type: "button",
                action_id: "enable_enforce",
                label: copy.enableEnforce,
                style: "primary",
                confirm: {
                  title: copy.enableEnforceTitle,
                  text: copy.enableEnforceDescription,
                  confirm: copy.enable,
                  deny: copy.cancel,
                },
              },
            ]
          : [
              {
                type: "button",
                action_id: "disable_enforce",
                label: copy.returnToObserve,
                style: "secondary",
              },
            ],
    },
  ];
  return { blocks };
}
