import type { PreflightRule } from "../../engine/types.js";
import { configuredSeverity, getPathValue } from "../shared.js";

function mediaIds(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(mediaIds);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const id = record.id ?? record.mediaId ?? record.media_id;
  return typeof id === "string" && id.trim() ? [id.trim()] : [];
}

export const mediaAltRequiredRule: PreflightRule = {
  id: "media.alt.required",
  description: "Require non-empty alt text on media referenced by configured fields.",
  evaluate: async (context, options) => {
    const severity = configuredSeverity(options);
    if (!severity || !options.fields?.length) return [];
    const findings = [];
    const seen = new Set<string>();
    let examined = 0;
    for (const field of options.fields) {
      for (const id of mediaIds(getPathValue(context.content, field))) {
        if (seen.has(id)) continue;
        seen.add(id);
        if (examined >= 2) {
          throw new Error("Media reference limit exceeded (2). The check is incomplete.");
        }
        examined += 1;
        if (!context.getMedia) throw new Error("Media lookup is unavailable.");
        const media = await context.getMedia(id);
        if (!media || typeof media.alt !== "string" || media.alt.trim() === "") {
          findings.push({
            ruleId: "media.alt.required",
            severity,
            path: field,
            message: media
              ? "Referenced media is missing alt text."
              : "Referenced media could not be found.",
            details: { mediaId: id },
          });
        }
      }
    }
    return findings;
  },
};
