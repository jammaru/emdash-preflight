import { bylineRequiredRule } from "../rules/editorial/byline-required.js";
import { requiredWhenRule } from "../rules/fields/required-when.js";
import { mediaAltRequiredRule } from "../rules/media/alt-required.js";
import { referencePublishedRule } from "../rules/references/published.js";
import { taxonomyMinTermsRule } from "../rules/taxonomy/min-terms.js";
import type { PreflightRule, RuleId } from "./types.js";

export const ruleRegistry: Record<RuleId, PreflightRule> = {
  "field.required_when": requiredWhenRule,
  "media.alt.required": mediaAltRequiredRule,
  "byline.required": bylineRequiredRule,
  "taxonomy.min_terms": taxonomyMinTermsRule,
  "reference.published": referencePublishedRule,
};
