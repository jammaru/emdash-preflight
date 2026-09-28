import type { PolicyConfig } from "./schema.js";

export const DEFAULT_POLICY: PolicyConfig = {
  version: 1,
  mode: "observe",
  defaults: {},
  collections: {},
};

export function defaultPolicy(): PolicyConfig {
  return structuredClone(DEFAULT_POLICY);
}
