import { describe, expect, it } from "vitest";

import { defaultPolicy } from "../src/policy/defaults.js";
import { migratePolicy, parseStoredPolicy } from "../src/policy/migrate.js";
import { parsePolicyConfig } from "../src/policy/schema.js";

describe("policy configuration", () => {
  it("starts with version 1 and observe mode", () => {
    expect(defaultPolicy()).toEqual({ version: 1, mode: "observe", defaults: {}, collections: {} });
  });

  it("accepts valid declarative rules", () => {
    const parsed = parsePolicyConfig({
      version: 1,
      mode: "enforce",
      defaults: { "byline.required": { severity: "warning" } },
      collections: {
        posts: {
          rules: {
            "field.required_when": {
              severity: "error",
              when: { field: "sponsored", equals: true },
              require: "sponsorName",
            },
            "media.alt.required": { severity: "warning", fields: ["featuredImage"] },
            "taxonomy.min_terms": { severity: "info", taxonomy: "category", min: 1 },
            "reference.published": {
              severity: "error",
              field: "related",
              targetCollection: "posts",
            },
          },
        },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown IDs, malformed options, and unsupported versions", () => {
    const unknown = parsePolicyConfig({
      version: 1,
      mode: "observe",
      defaults: { "custom.javascript": { severity: "error", code: "run()" } },
      collections: {},
    });
    expect(unknown.success).toBe(false);
    if (!unknown.success) expect(unknown.errors[0]?.message).toContain("Unknown rule");

    const incomplete = parsePolicyConfig({
      version: 1,
      mode: "enforce",
      defaults: {},
      collections: { posts: { rules: { "media.alt.required": { severity: "error" } } } },
    });
    expect(incomplete.success).toBe(false);
    if (!incomplete.success) expect(incomplete.errors[0]?.message).toContain("fields");

    expect(() => migratePolicy({ version: 2 })).toThrow("Unsupported policy version");
  });

  it("parses stored JSON and uses defaults for absent settings", () => {
    expect(parseStoredPolicy(null)).toEqual(defaultPolicy());
    expect(
      parseStoredPolicy(
        JSON.stringify({ version: 1, mode: "observe", defaults: {}, collections: {} }),
      ),
    ).toEqual(defaultPolicy());
    expect(() => parseStoredPolicy("not-json")).toThrow("not valid JSON");
  });
});
