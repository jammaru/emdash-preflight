import type { PreflightRule } from "../../engine/types.js";
import { configuredSeverity, getPathValue } from "../shared.js";

function referenceIds(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(referenceIds);
  if (typeof value !== "object" || value === null) return [];
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? [id.trim()] : [];
}

export const referencePublishedRule: PreflightRule = {
  id: "reference.published",
  description: "Require configured content references to point to published entries.",
  evaluate: async (context, options) => {
    const severity = configuredSeverity(options);
    if (!severity || !options.field || !options.targetCollection) return [];
    const ids = [...new Set(referenceIds(getPathValue(context.content, options.field)))];
    if (ids.length > 2) throw new Error("Reference limit exceeded (2). The check is incomplete.");
    if (!context.getReferencedStatus && ids.length)
      throw new Error("Reference lookup is unavailable.");
    const findings = [];
    for (const id of ids) {
      const status = await context.getReferencedStatus?.(options.targetCollection, id);
      if (status === "published") continue;
      findings.push({
        ruleId: "reference.published",
        severity,
        path: options.field,
        message:
          status === null
            ? "Referenced content does not exist."
            : "Referenced content must be published before this entry can go live.",
        details: { targetCollection: options.targetCollection, targetId: id, targetStatus: status },
      });
    }
    return findings;
  },
};
