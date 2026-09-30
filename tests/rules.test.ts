import { describe, expect, it } from "vitest";

import { evaluatePolicy } from "../src/engine/evaluate.js";
import type { RuleContext, RuleOptions } from "../src/engine/types.js";
import type { PolicyConfig } from "../src/policy/schema.js";
import { bylineRequiredRule } from "../src/rules/editorial/byline-required.js";
import { requiredWhenRule } from "../src/rules/fields/required-when.js";
import { mediaAltRequiredRule } from "../src/rules/media/alt-required.js";
import { referencePublishedRule } from "../src/rules/references/published.js";
import { taxonomyMinTermsRule } from "../src/rules/taxonomy/min-terms.js";

function makeContext(content: Record<string, unknown> = {}): RuleContext {
  let count = 0;
  return {
    collection: "posts",
    contentId: "post-1",
    content,
    maxHostOperations: 8,
    consumeHostOperation: () => ++count <= 8,
  };
}

describe("field.required_when", () => {
  const options: RuleOptions = {
    severity: "error",
    when: { field: "sponsored", equals: true },
    require: "sponsor.name",
  };
  it("passes when the condition does not match or the required value is present", async () => {
    await expect(
      requiredWhenRule.evaluate(makeContext({ sponsored: false }), options),
    ).resolves.toEqual([]);
    await expect(
      requiredWhenRule.evaluate(
        makeContext({ sponsored: true, sponsor: { name: "Example" } }),
        options,
      ),
    ).resolves.toEqual([]);
  });
  it("matches boolean conditions when persisted values are represented as 1 or 0", async () => {
    await expect(
      requiredWhenRule.evaluate(makeContext({ sponsored: 1 }), options),
    ).resolves.toMatchObject([{ path: "sponsor.name" }]);
    await expect(
      requiredWhenRule.evaluate(makeContext({ sponsored: 0 }), options),
    ).resolves.toEqual([]);
  });
  it("reports a missing nested value with the configured severity", async () => {
    await expect(
      requiredWhenRule.evaluate(makeContext({ sponsored: true, sponsor: { name: " " } }), options),
    ).resolves.toMatchObject([
      { ruleId: "field.required_when", severity: "error", path: "sponsor.name" },
    ]);
  });
  it("skips disabled rules", async () => {
    await expect(
      requiredWhenRule.evaluate(makeContext({ sponsored: true }), { ...options, severity: "off" }),
    ).resolves.toEqual([]);
  });
});

describe("media.alt.required", () => {
  const options: RuleOptions = { severity: "warning", fields: ["featuredImage"] };
  it("passes for absent media and non-empty alt text", async () => {
    await expect(mediaAltRequiredRule.evaluate(makeContext({}), options)).resolves.toEqual([]);
    const context = makeContext({ featuredImage: "media-1" });
    context.getMedia = async () => ({ alt: "A mountain" });
    await expect(mediaAltRequiredRule.evaluate(context, options)).resolves.toEqual([]);
  });
  it("reports blank alt text or missing media", async () => {
    const context = makeContext({ featuredImage: ["media-1", "media-2"] });
    context.getMedia = async (id) => (id === "media-1" ? { alt: " " } : null);
    await expect(mediaAltRequiredRule.evaluate(context, options)).resolves.toMatchObject([
      {
        ruleId: "media.alt.required",
        path: "featuredImage",
        severity: "warning",
        details: { mediaId: "media-1" },
      },
      { ruleId: "media.alt.required", path: "featuredImage", details: { mediaId: "media-2" } },
    ]);
  });
  it("marks too many references as an incomplete evaluation", async () => {
    const context = makeContext({ featuredImage: ["one", "two", "three"] });
    context.getMedia = async () => ({ alt: "ok" });
    await expect(mediaAltRequiredRule.evaluate(context, options)).rejects.toThrow(
      "reference limit exceeded",
    );
  });
});

describe("byline.required", () => {
  it("passes with a credit and reports a missing credit", async () => {
    const context = makeContext();
    context.getBylineCount = async () => 1;
    await expect(bylineRequiredRule.evaluate(context, { severity: "error" })).resolves.toEqual([]);
    context.getBylineCount = async () => 0;
    await expect(
      bylineRequiredRule.evaluate(context, { severity: "error" }),
    ).resolves.toMatchObject([{ ruleId: "byline.required", severity: "error" }]);
  });
});

describe("taxonomy.min_terms", () => {
  const options: RuleOptions = { severity: "warning", taxonomy: "category", min: 1 };
  it("passes at the minimum and reports the observed count", async () => {
    const context = makeContext();
    context.getTaxonomyTermCount = async () => 1;
    await expect(taxonomyMinTermsRule.evaluate(context, options)).resolves.toEqual([]);
    context.getTaxonomyTermCount = async () => 0;
    await expect(taxonomyMinTermsRule.evaluate(context, options)).resolves.toMatchObject([
      { details: { actual: 0, expectedMinimum: 1 } },
    ]);
  });
});

describe("reference.published", () => {
  const options: RuleOptions = { severity: "error", field: "related", targetCollection: "posts" };
  it("passes published references and reports unpublished targets", async () => {
    const context = makeContext({ related: ["published", { id: "draft" }] });
    context.getReferencedStatus = async (_collection, id) =>
      id === "published" ? "published" : id === "draft" ? "draft" : null;
    await expect(referencePublishedRule.evaluate(context, options)).resolves.toMatchObject([
      { path: "related", details: { targetId: "draft", targetStatus: "draft" } },
    ]);
    context.content.related = ["missing"];
    await expect(referencePublishedRule.evaluate(context, options)).resolves.toMatchObject([
      { path: "related", details: { targetId: "missing", targetStatus: null } },
    ]);
  });
  it("rejects an overlarge reference list instead of skipping checks", async () => {
    const context = makeContext({ related: ["one", "two", "three"] });
    await expect(referencePublishedRule.evaluate(context, options)).rejects.toThrow(
      "Reference limit exceeded",
    );
  });
});

describe("rule engine", () => {
  const policy: PolicyConfig = {
    version: 1,
    mode: "enforce",
    defaults: {},
    collections: {
      posts: {
        rules: {
          "field.required_when": {
            severity: "error",
            when: { field: "sponsored", equals: true },
            require: "sponsor",
          },
        },
      },
    },
  };
  it("returns stable sorted fingerprints for the same inputs", async () => {
    const context = makeContext({ sponsored: true });
    const first = await evaluatePolicy(context, policy, {
      evaluatedAt: "2026-09-29T00:00:00.000Z",
    });
    const second = await evaluatePolicy(context, policy, {
      evaluatedAt: "2026-09-29T00:00:00.000Z",
    });
    expect(first).toEqual(second);
    expect(first.status).toBe("fail");
    expect(first.issues[0]?.fingerprint).toBe("field.required_when:posts:post-1:sponsor");
  });
  it("marks a host lookup failure as incomplete", async () => {
    const lookupPolicy: PolicyConfig = {
      ...policy,
      collections: { posts: { rules: { "byline.required": { severity: "error" } } } },
    };
    const result = await evaluatePolicy(makeContext(), lookupPolicy);
    expect(result.complete).toBe(false);
    expect(result.evaluationError?.code).toBe("CHECK_INCOMPLETE");
  });
});
