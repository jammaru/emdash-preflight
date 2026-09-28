export type Severity = "info" | "warning" | "error";
export type ConfiguredSeverity = "off" | Severity;
export type PreflightStatus = "pass" | "warn" | "fail";

export interface PreflightIssue {
  ruleId: string;
  severity: Severity;
  message: string;
  collection: string;
  contentId: string;
  path?: string;
  details?: Record<string, unknown>;
  fingerprint: string;
}

export interface PreflightResult {
  status: PreflightStatus;
  issues: PreflightIssue[];
  evaluatedAt: string;
  policyVersion: number;
  complete: boolean;
  evaluationError?: {
    code: "CHECK_INCOMPLETE" | "POLICY_INVALID";
    message: string;
  };
}

export interface RuleContext {
  collection: string;
  contentId: string;
  content: Record<string, unknown>;
  getMedia?: (id: string) => Promise<{ alt?: string | null } | null>;
  getBylineCount?: () => Promise<number>;
  getTaxonomyTermCount?: (taxonomy: string) => Promise<number>;
  getReferencedStatus?: (collection: string, id: string) => Promise<string | null>;
  maxHostOperations: number;
  consumeHostOperation: () => boolean;
  logError?: (message: string, error: unknown) => void;
}

export interface RuleFinding {
  ruleId: string;
  severity: Severity;
  message: string;
  path?: string;
  details?: Record<string, unknown>;
}

export interface PreflightRule {
  id: string;
  description: string;
  evaluate(context: RuleContext, config: RuleOptions): Promise<RuleFinding[]>;
}

export interface RuleOptions {
  severity: ConfiguredSeverity;
  when?: { field: string; equals: unknown };
  require?: string;
  fields?: string[];
  taxonomy?: string;
  min?: number;
  field?: string;
  targetCollection?: string;
}

export const RULE_IDS = [
  "field.required_when",
  "media.alt.required",
  "byline.required",
  "taxonomy.min_terms",
  "reference.published",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export function isRuleId(value: string): value is RuleId {
  return (RULE_IDS as readonly string[]).includes(value);
}
