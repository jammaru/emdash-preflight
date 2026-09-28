import type { PreflightRule } from "../../engine/types.js";
import { configuredSeverity, getPathValue, isEmptyValue } from "../shared.js";

export const requiredWhenRule: PreflightRule = {
  id: "field.required_when",
  description: "Require one field when another field matches a configured value.",
  evaluate: async (context, options) => {
    const severity = configuredSeverity(options);
    if (!severity || !options.when || !options.require) return [];
    if (!Object.is(getPathValue(context.content, options.when.field), options.when.equals))
      return [];
    if (!isEmptyValue(getPathValue(context.content, options.require))) return [];
    return [
      {
        ruleId: "field.required_when",
        severity,
        path: options.require,
        message: `${options.require} is required when ${options.when.field} matches the configured value.`,
        details: { when: options.when, requiredField: options.require },
      },
    ];
  },
};
