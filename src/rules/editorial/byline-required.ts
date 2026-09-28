import type { PreflightRule } from "../../engine/types.js";
import { configuredSeverity } from "../shared.js";

export const bylineRequiredRule: PreflightRule = {
  id: "byline.required",
  description: "Require at least one public byline credit on the entry.",
  evaluate: async (context, options) => {
    const severity = configuredSeverity(options);
    if (!severity) return [];
    if (!context.getBylineCount) throw new Error("Byline lookup is unavailable.");
    const count = await context.getBylineCount();
    return count > 0
      ? []
      : [
          {
            ruleId: "byline.required",
            severity,
            message: "This entry needs at least one byline before publication.",
          },
        ];
  },
};
