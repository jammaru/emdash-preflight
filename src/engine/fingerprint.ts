import type { PreflightIssue, RuleFinding, RuleContext } from "./types.js";

export function createFingerprint(
  ruleId: string,
  collection: string,
  contentId: string,
  path?: string,
): string {
  return [ruleId, collection, contentId, path ?? "_"].map(encodeURIComponent).join(":");
}

export function toIssue(finding: RuleFinding, context: RuleContext): PreflightIssue {
  return {
    ruleId: finding.ruleId,
    severity: finding.severity,
    message: finding.message,
    collection: context.collection,
    contentId: context.contentId,
    ...(finding.path ? { path: finding.path } : {}),
    ...(finding.details ? { details: finding.details } : {}),
    fingerprint: createFingerprint(
      finding.ruleId,
      context.collection,
      context.contentId,
      finding.path,
    ),
  };
}
