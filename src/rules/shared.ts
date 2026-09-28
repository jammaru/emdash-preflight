import type { Severity, RuleOptions, RuleContext } from "../engine/types.js";

export function configuredSeverity(options: RuleOptions): Severity | undefined {
  return options.severity === "off" ? undefined : options.severity;
}

export function getPathValue(record: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => {
    if (typeof value !== "object" || value === null) return undefined;
    return (value as Record<string, unknown>)[part];
  }, record);
}

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export async function counted<T>(context: RuleContext, operation: () => Promise<T>): Promise<T> {
  if (!context.consumeHostOperation()) {
    throw new Error(`Preflight host-operation budget exceeded (${context.maxHostOperations}).`);
  }
  return operation();
}

export function isBudgetError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.startsWith("Preflight host-operation budget exceeded")
  );
}
