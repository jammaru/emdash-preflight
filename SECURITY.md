# Security policy

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/jammaru/emdash-preflight/security/advisories/new). Include the affected version, impact, and steps to reproduce. Please do not open a public issue for an unpatched vulnerability.

## Security boundaries

Preflight is a sandboxed plugin with no outbound network, content-write, media-write, publication, or user-directory capability. Its policy hooks can reject publication and scheduling. Its MCP tools are read-only. The full capability contract is documented in [docs/security.md](docs/security.md).
