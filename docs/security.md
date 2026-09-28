# Security model

EmDash Preflight runs as a sandboxed plugin and asks only for capabilities used by its policy engine:

| Capability                      | Use                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `hooks.content-policy:register` | Inspect publish and schedule events and reject them when Enforce mode finds an error. |
| `content:read`                  | Check saved entries, references, and entry panels.                                    |
| `schema:read`                   | Provide collection and field information to policy tooling.                           |
| `media:read`                    | Read ready-media metadata, including alt text.                                        |
| `taxonomies:read`               | Read assigned taxonomy terms.                                                         |
| `bylines:read`                  | Read byline credits for an entry.                                                     |

The manifest has an empty `allowedHosts` list and requests no network capability. It does not request `content:write`, `content:publish`, media writes, user access, revision access, or AI access. Preflight cannot edit or publish site content.

Policy settings and stored issues remain inside the EmDash installation. The evaluator is deterministic and uses no LLM or external service. MCP tools are explicitly marked non-destructive and require separate administrator enablement in EmDash.

The publish path is bounded. Each check permits at most eight planned EmDash lookups; media and content references have an explicit two-target limit. Exceeding a bound or failing a lookup is represented as an incomplete check. Enforce mode fails closed for incomplete checks.

Report vulnerabilities through the [GitHub private vulnerability reporting form](https://github.com/jammaru/emdash-preflight/security/advisories/new).
