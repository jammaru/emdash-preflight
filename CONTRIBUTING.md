# Contributing

Thanks for helping improve EmDash Preflight.

## Before a change

- Read `AGENTS.md` and `skills/creating-plugins/SKILL.md`.
- Keep the product focused on deterministic EmDash publication policy.
- Do not add network, write, publish, user-directory, or AI capabilities without an explicitly reviewed trust-contract change.
- Keep all publication checks bounded; broad scans belong in cursor-based audit routes.

## Adding a rule

1. Add the rule ID and type in `src/engine/types.ts`.
2. Register the rule in `src/engine/registry.ts`.
3. Add its rule-specific policy validation and migration behavior.
4. Keep EmDash resource lookups behind `src/emdash/context.ts` and its operation budget.
5. Add pass, fail, disabled, severity, and edge-case coverage.
6. Document the options and output in `docs/rules.md`.

## Before submitting

```sh
pnpm run format
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run validate
pnpm run build
pnpm exec emdash-plugin bundle --validate-only
```

Never publish a release from an unvalidated build. Use conventional, focused pull requests and include the user-visible effect in the description.
