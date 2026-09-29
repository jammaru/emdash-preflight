# Development

## Prerequisites

- Node.js 22 or newer
- pnpm 10.26.0 as pinned in `package.json`
- EmDash plugin CLI 0.13.1 as pinned in `package.json`

## Setup and checks

```sh
pnpm install --frozen-lockfile
pnpm run format
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run validate
pnpm run build
pnpm exec emdash-plugin bundle --validate-only
```

`pnpm run test` first validates the registry manifest, then builds the plugin and runs tests through the official sandbox test host. Pure tests cover configuration and rule behavior; the plugin host tests cover hook decisions, storage, and routes across the compiled sandbox boundary.

## Local admin smoke test

Verified against EmDash's local Node/SQLite demo with the `sandbox-workerd` runner. The editor panel displayed a missing-byline issue in observe mode without claiming publication was blocked. In enforce mode, both Publish and Schedule were rejected and the entry stayed a draft. The demo policy was restored to observe mode after the check.

- [Observe dashboard](screenshots/preflight-dashboard-observe.png)
- [Enforce dashboard](screenshots/preflight-dashboard-enforce.png)
- [Editor panel in observe mode](screenshots/preflight-editor-panel-observe.png)
- [Editor panel in enforce mode](screenshots/preflight-editor-panel-enforce.png)
- [Blocked publish attempt](screenshots/preflight-publish-blocked.png)
- [Japanese dashboard](screenshots/preflight-dashboard-ja.png)
- [Japanese saved-entry panel](screenshots/preflight-editor-panel-ja.png)

## Repository layout

- `src/engine`: rule types, registry, stable issues, and result evaluation.
- `src/policy`: versioned config, defaults, parsing, and migrations.
- `src/rules`: the v0.1 field, media, byline, taxonomy, and reference rules.
- `src/emdash`: capability-gated resource adapters and lookup budget.
- `src/storage`: issue persistence and paginated queries.
- `tests`: unit and sandbox integration tests.

## Contribution rules

Keep runtime dependencies small, avoid Node.js built-ins, and keep the manifest trust contract in sync with runtime use. A rule must explain its bound, have deterministic output, and return machine-readable issues. Do not put full site scans in publish hooks. See [CONTRIBUTING.md](../CONTRIBUTING.md) before opening a change.
