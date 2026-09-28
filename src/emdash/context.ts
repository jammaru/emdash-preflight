import type { PluginContext } from "emdash/plugin";

import type { RuleContext } from "../engine/types.js";

export const MAX_HOST_OPERATIONS = 8;

export function createRuleContext(
  content: Record<string, unknown>,
  collection: string,
  contentId: string,
  ctx: PluginContext,
): RuleContext {
  let hostOperations = 0;
  const consumeHostOperation = (): boolean => {
    if (hostOperations >= MAX_HOST_OPERATIONS) return false;
    hostOperations += 1;
    return true;
  };

  return {
    content,
    collection,
    contentId,
    maxHostOperations: MAX_HOST_OPERATIONS,
    consumeHostOperation,
    getMedia: async (id) => {
      if (!consumeHostOperation()) throw new Error("Preflight host-operation budget exceeded (8).");
      if (!ctx.media) throw new Error("Media read capability is unavailable.");
      return ctx.media.get(id);
    },
    getBylineCount: async () => {
      if (!consumeHostOperation()) throw new Error("Preflight host-operation budget exceeded (8).");
      if (!ctx.bylines) throw new Error("Byline read capability is unavailable.");
      const entries = await ctx.bylines.getEntriesBylines(collection, [contentId]);
      return entries[0]?.bylines.length ?? 0;
    },
    getTaxonomyTermCount: async (taxonomy) => {
      if (!consumeHostOperation()) throw new Error("Preflight host-operation budget exceeded (8).");
      if (!ctx.taxonomies) throw new Error("Taxonomy read capability is unavailable.");
      const terms = await ctx.taxonomies.getEntryTerms(collection, contentId, { taxonomy });
      return terms.length;
    },
    getReferencedStatus: async (targetCollection, id) => {
      if (!consumeHostOperation()) throw new Error("Preflight host-operation budget exceeded (8).");
      if (!ctx.content) throw new Error("Content read capability is unavailable.");
      const item = await ctx.content.get(targetCollection, id);
      return item?.status ?? null;
    },
    logError: (message, error) =>
      ctx.log.error(
        message,
        error instanceof Error ? { name: error.name, message: error.message } : undefined,
      ),
  };
}
