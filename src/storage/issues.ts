import type { StorageCollection } from "emdash";

import type { PreflightIssue } from "../engine/types.js";

export interface StoredIssue extends PreflightIssue {
  issueKey: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface IssueFilters {
  collection?: string;
  contentId?: string;
  severity?: "info" | "warning" | "error";
  ruleId?: string;
  limit: number;
  cursor?: string;
}

type IssueStorage = StorageCollection<StoredIssue>;

function getIssueCollection(ctx: { storage: Record<string, unknown> }): IssueStorage {
  return ctx.storage.issues as IssueStorage;
}

export async function persistIssues(
  ctx: { storage: Record<string, unknown> },
  collection: string,
  contentId: string,
  issues: PreflightIssue[],
): Promise<void> {
  const storage = getIssueCollection(ctx);
  const previous = await storage.query({ where: { collection, contentId }, limit: 100 });
  const previousByKey = new Map(previous.items.map((item) => [item.data.issueKey, item]));
  const now = new Date().toISOString();
  const currentKeys = new Set(issues.map((issue) => issue.fingerprint));
  const writes = issues.map((issue) => {
    const existing = previousByKey.get(issue.fingerprint)?.data;
    const record: StoredIssue = {
      ...issue,
      issueKey: issue.fingerprint,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    };
    return { id: issue.fingerprint, data: record };
  });
  if (writes.length) await storage.putMany(writes);
  const resolved = previous.items
    .filter((item) => !currentKeys.has(item.data.issueKey))
    .map((item) => item.id);
  if (resolved.length) await storage.deleteMany(resolved);
}

function whereFor(filters: IssueFilters): Record<string, string> | undefined {
  if (filters.collection && filters.severity)
    return { collection: filters.collection, severity: filters.severity };
  if (filters.contentId && filters.ruleId)
    return { contentId: filters.contentId, ruleId: filters.ruleId };
  if (filters.contentId) return { contentId: filters.contentId };
  if (filters.collection) return { collection: filters.collection };
  if (filters.severity) return { severity: filters.severity };
  if (filters.ruleId) return { ruleId: filters.ruleId };
  return undefined;
}

export async function listIssues(ctx: { storage: Record<string, unknown> }, filters: IssueFilters) {
  const storage = getIssueCollection(ctx);
  const page = await storage.query({
    where: whereFor(filters),
    limit: filters.limit,
    ...(filters.cursor ? { cursor: filters.cursor } : {}),
  });
  const items = page.items
    .map(({ data }) => data)
    .filter(
      (issue) =>
        (!filters.collection || issue.collection === filters.collection) &&
        (!filters.contentId || issue.contentId === filters.contentId) &&
        (!filters.severity || issue.severity === filters.severity) &&
        (!filters.ruleId || issue.ruleId === filters.ruleId),
    )
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
  return { items, nextCursor: page.cursor, hasMore: page.hasMore };
}

export async function issueCounts(ctx: { storage: Record<string, unknown> }) {
  const storage = getIssueCollection(ctx);
  const [errors, warnings, info] = await Promise.all([
    storage.count({ severity: "error" }),
    storage.count({ severity: "warning" }),
    storage.count({ severity: "info" }),
  ]);
  return { errors, warnings, info };
}

export async function listIssuesForRule(
  ctx: { storage: Record<string, unknown> },
  ruleId: string,
  limit = 50,
) {
  const storage = getIssueCollection(ctx);
  const page = await storage.query({ where: { ruleId }, limit });
  return page.items.map((item) => item.data);
}
