import { z } from "zod";

import { isRuleId, RULE_IDS, type RuleId, type RuleOptions } from "../engine/types.js";

const settingsSchema = z
  .object({
    severity: z.enum(["off", "info", "warning", "error"]),
    when: z
      .object({ field: z.string().min(1), equals: z.unknown() })
      .strict()
      .optional(),
    require: z.string().min(1).optional(),
    fields: z.array(z.string().min(1)).max(2).optional(),
    taxonomy: z.string().min(1).optional(),
    min: z.number().int().min(0).max(100).optional(),
    field: z.string().min(1).optional(),
    targetCollection: z.string().min(1).optional(),
  })
  .strict();

const rawPolicySchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["observe", "enforce"]),
    defaults: z.record(z.string(), z.unknown()).default({}),
    collections: z
      .record(
        z.string().min(1),
        z.object({ rules: z.record(z.string(), z.unknown()).default({}) }).strict(),
      )
      .default({}),
  })
  .strict();

export interface CollectionPolicy {
  rules: Partial<Record<RuleId, RuleOptions>>;
}

export interface PolicyConfig {
  version: 1;
  mode: "observe" | "enforce";
  defaults: Partial<Record<RuleId, RuleOptions>>;
  collections: Record<string, CollectionPolicy>;
}

export type PolicyParseResult =
  | { success: true; data: PolicyConfig }
  | { success: false; errors: Array<{ path: string; message: string }> };

function validateRuleMap(
  input: Record<string, unknown>,
  basePath: string,
  errors: Array<{ path: string; message: string }>,
): Partial<Record<RuleId, RuleOptions>> {
  const rules: Partial<Record<RuleId, RuleOptions>> = {};
  for (const [id, value] of Object.entries(input)) {
    const path = `${basePath}.${id}`;
    if (!isRuleId(id)) {
      errors.push({ path, message: `Unknown rule. Supported rules: ${RULE_IDS.join(", ")}.` });
      continue;
    }
    const parsed = settingsSchema.safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          path: `${path}${issue.path.length ? `.${issue.path.join(".")}` : ""}`,
          message: issue.message,
        });
      }
      continue;
    }
    const config = parsed.data;
    const missing: string[] = [];
    if (config.severity !== "off") {
      if (id === "field.required_when" && (!config.when || !config.require))
        missing.push("when and require");
      if (id === "media.alt.required" && (!config.fields || config.fields.length === 0))
        missing.push("fields");
      if (id === "taxonomy.min_terms" && (!config.taxonomy || config.min === undefined))
        missing.push("taxonomy and min");
      if (id === "reference.published" && (!config.field || !config.targetCollection))
        missing.push("field and targetCollection");
    }
    if (missing.length) {
      errors.push({ path, message: `Active rule requires ${missing.join(" and ")}.` });
      continue;
    }
    rules[id] = config as RuleOptions;
  }
  return rules;
}

export function parsePolicyConfig(input: unknown): PolicyParseResult {
  const parsed = rawPolicySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const errors: Array<{ path: string; message: string }> = [];
  const defaults = validateRuleMap(parsed.data.defaults, "defaults", errors);
  const collections: Record<string, CollectionPolicy> = {};
  for (const [collection, settings] of Object.entries(parsed.data.collections)) {
    collections[collection] = {
      rules: validateRuleMap(settings.rules, `collections.${collection}.rules`, errors),
    };
  }
  if (errors.length) return { success: false, errors };
  return { success: true, data: { version: 1, mode: parsed.data.mode, defaults, collections } };
}

export const PolicyConfigSchema = z.custom<PolicyConfig>(
  (value) => parsePolicyConfig(value).success,
  {
    message: "Invalid Preflight policy configuration.",
  },
);
