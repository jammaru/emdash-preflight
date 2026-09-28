import { createFingerprint, toIssue } from "./fingerprint.js";
import { ruleRegistry } from "./registry.js";
import type { PreflightIssue, PreflightResult, RuleContext, RuleId } from "./types.js";
import type { PolicyConfig } from "../policy/schema.js";

export async function evaluatePolicy(
  context: RuleContext,
  policy: PolicyConfig,
  options: { evaluatedAt?: string } = {},
): Promise<PreflightResult> {
  const issues: PreflightIssue[] = [];
  let complete = true;
  const collectionRules = policy.collections[context.collection]?.rules ?? {};

  for (const ruleId of Object.keys(ruleRegistry) as RuleId[]) {
    const defaults = policy.defaults[ruleId];
    const specific = collectionRules[ruleId];
    if (!defaults && !specific) continue;
    const merged = { ...defaults, ...specific };
    if (!merged.severity || merged.severity === "off") continue;
    try {
      const findings = await ruleRegistry[ruleId].evaluate(
        context,
        merged as NonNullable<typeof defaults>,
      );
      issues.push(...findings.map((finding) => toIssue(finding, context)));
    } catch (error) {
      complete = false;
      context.logError?.(`Rule ${ruleId} could not be evaluated.`, error);
    }
  }

  issues.sort(
    (left, right) =>
      left.ruleId.localeCompare(right.ruleId) ||
      (left.path ?? "").localeCompare(right.path ?? "") ||
      left.fingerprint.localeCompare(right.fingerprint),
  );
  const status = issues.some((issue) => issue.severity === "error")
    ? "fail"
    : issues.some((issue) => issue.severity === "warning")
      ? "warn"
      : "pass";
  return {
    status,
    issues,
    evaluatedAt: options.evaluatedAt ?? new Date().toISOString(),
    policyVersion: policy.version,
    complete,
    ...(!complete
      ? {
          evaluationError: {
            code: "CHECK_INCOMPLETE" as const,
            message:
              "Preflight could not complete every enabled check. Review the runtime log before relying on this result.",
          },
        }
      : {}),
  };
}

export function makeFailureResult(input: {
  collection: string;
  contentId: string;
  code: "CHECK_INCOMPLETE" | "POLICY_INVALID";
  message: string;
  policyVersion?: number;
}): PreflightResult {
  return {
    status: "pass",
    issues: [],
    evaluatedAt: new Date().toISOString(),
    policyVersion: input.policyVersion ?? 1,
    complete: false,
    evaluationError: { code: input.code, message: input.message },
  };
}

export function fingerprintFor(
  ruleId: string,
  collection: string,
  contentId: string,
  path?: string,
): string {
  return createFingerprint(ruleId, collection, contentId, path);
}
