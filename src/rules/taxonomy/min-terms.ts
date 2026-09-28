import type { PreflightRule } from "../../engine/types.js";
import { configuredSeverity } from "../shared.js";

export const taxonomyMinTermsRule: PreflightRule = {
  id: "taxonomy.min_terms",
  description: "Require a minimum number of terms from a configured taxonomy.",
  evaluate: async (context, options) => {
    const severity = configuredSeverity(options);
    if (!severity || !options.taxonomy || options.min === undefined) return [];
    if (!context.getTaxonomyTermCount) throw new Error("Taxonomy lookup is unavailable.");
    const actual = await context.getTaxonomyTermCount(options.taxonomy);
    return actual >= options.min
      ? []
      : [
          {
            ruleId: "taxonomy.min_terms",
            severity,
            message: `Assign at least ${options.min} ${options.taxonomy} term${options.min === 1 ? "" : "s"} before publication.`,
            path: options.taxonomy,
            details: { taxonomy: options.taxonomy, expectedMinimum: options.min, actual },
          },
        ];
  },
};
