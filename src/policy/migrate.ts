import { parsePolicyConfig, type PolicyConfig } from "./schema.js";
import { defaultPolicy } from "./defaults.js";

export function migratePolicy(input: unknown): PolicyConfig {
  if (typeof input !== "object" || input === null || !("version" in input)) {
    throw new Error("Policy configuration has no version.");
  }
  const source = input as Record<string, unknown>;
  if (source.version !== 1)
    throw new Error(`Unsupported policy version: ${String(source.version)}.`);
  const parsed = parsePolicyConfig(source);
  if (!parsed.success)
    throw new Error(parsed.errors.map((error) => `${error.path}: ${error.message}`).join("; "));
  return parsed.data;
}

export function parseStoredPolicy(value: unknown): PolicyConfig {
  if (value === null || value === undefined) return defaultPolicy();
  if (typeof value === "string") {
    let decoded: unknown;
    try {
      decoded = JSON.parse(value);
    } catch {
      throw new Error("Stored policy is not valid JSON.");
    }
    return migratePolicy(decoded);
  }
  return migratePolicy(value);
}
