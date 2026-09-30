import { z } from "../zod-mini.js";

import { isRuleId, RULE_IDS, type RuleId, type RuleOptions } from "../engine/types.js";

const nonEmptyString = z.string().check(z.minLength(1));

const settingsSchema = z.strictObject({
  severity: z.enum(["off", "info", "warning", "error"]),
  when: z.optional(z.strictObject({ field: nonEmptyString, equals: z.unknown() })),
  require: z.optional(nonEmptyString),
  fields: z.optional(z.array(nonEmptyString).check(z.maxLength(2))),
  taxonomy: z.optional(nonEmptyString),
  min: z.optional(z.number().check(z.int(), z.gte(0), z.lte(100))),
  field: z.optional(nonEmptyString),
  targetCollection: z.optional(nonEmptyString),
});

const rawPolicySchema = z.strictObject({
  version: z.literal(1),
  mode: z.enum(["observe", "enforce"]),
  defaults: z._default(z.record(z.string(), z.unknown()), {}),
  collections: z._default(
    z.record(
      nonEmptyString,
      z.strictObject({
        rules: z._default(z.record(z.string(), z.unknown()), {}),
      }),
    ),
    {},
  ),
});

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
