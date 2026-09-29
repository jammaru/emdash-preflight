# EmDash Preflight

**The publish gate for EmDash.**

Preflight applies deterministic publishing policies before content goes live, whether the publish came from a human, API, MCP agent, plugin, scheduler, or system process. The same engine checks manual publishes and scheduled publishes when they become due.

No AI API. No external service. No content writes.

## What it does

- Checks content at EmDash's `content:beforePublish` and `content:beforeSchedule` boundaries.
- Starts in **Observe** mode. Issues are recorded without blocking publication.
- In **Enforce** mode, error severity issues block publishing and scheduling. Warnings remain informational.
- Uses the same deterministic rules for policy hooks, the saved-entry panel, private routes, and read-only MCP tools.
- Stores stable, machine-readable issues so editors and agents can identify, fix, and recheck them.

Preflight detects problems. Editors and agents use EmDash's normal tools to make changes.

## Install

Install **EmDash Preflight** from the EmDash Plugin Registry as `@jammaru.com/preflight`, review the requested capabilities, and enable its MCP tools separately if agents need them. The plugin requires EmDash `>=0.39.0`.

After installation, leave Preflight in Observe mode while you configure policies and review the reported issues. Enable Enforce from the Preflight dashboard when the policy is ready to gate publication.

## 日本語での使い方

EmDash管理画面の言語が日本語の場合、Preflightのダッシュボードと記事編集パネルも日本語で表示されます。対応していない言語では英語で表示します。

1. プラグインを有効にしたら、まず **監視（Observe）モード** のまま試します。このモードでは問題を記録しますが、公開や予約は止めません。
2. ダッシュボードの **サンプル設定を読み込む** を選びます。最初のコレクション用に著者クレジットのチェックが入力されます。内容を確認し、**検証して保存** を選びます。サンプルは読み込んだだけでは保存されません。
3. 保存済みの記事を開き、編集画面の **Preflight** パネルを確認します。問題を直して記事を保存した後、パネルを開き直すと再チェックします。
4. ルールが意図どおりだと確認してから **公開ゲート（Enforce）** を有効にします。重大度が `error` の問題だけが公開と予約を止めます。

記事の修正はEmDashの通常の編集画面で行います。Preflightは問題の検出と公開判定を担当し、記事の内容は変更しません。

## Policy example

Policies are declarative JSON stored in `ctx.settings`. This example checks sponsored posts, image alt text, bylines, categories, and a published content reference:

```json
{
  "version": 1,
  "mode": "observe",
  "defaults": {},
  "collections": {
    "posts": {
      "rules": {
        "field.required_when": {
          "severity": "error",
          "when": { "field": "sponsored", "equals": true },
          "require": "sponsorName"
        },
        "media.alt.required": {
          "severity": "warning",
          "fields": ["featuredImage"]
        },
        "byline.required": { "severity": "error" },
        "taxonomy.min_terms": {
          "severity": "warning",
          "taxonomy": "category",
          "min": 1
        },
        "reference.published": {
          "severity": "error",
          "field": "featuredArticle",
          "targetCollection": "posts"
        }
      }
    }
  }
}
```

Rule severity can be `off`, `info`, `warning`, or `error`. Active rule options are validated when the policy is saved. Media alt checks and reference checks inspect no more than two configured references per entry; the whole check is limited to eight planned EmDash lookups. If a rule cannot finish within its bounds, Preflight marks the result incomplete and blocks in Enforce mode.

See [docs/rules.md](docs/rules.md) for rule details and [docs/architecture.md](docs/architecture.md) for the evaluation flow.

## MCP tools

Preflight exposes four non-destructive tools after an EmDash administrator enables the plugin's MCP surface:

- `preflight__check_entry` evaluates a saved entry.
- `preflight__list_issues` lists stored issues with collection, entry, severity, and rule filters.
- `preflight__explain_rule` returns a rule's purpose, active configuration, and current findings.
- `preflight__audit_batch` checks up to 25 published entries per call using a cursor; pass `nextCursor` to continue.

Agents should fix issues through standard EmDash content tools, then call `check_entry` again.

## Permissions and security

Preflight requests these EmDash capabilities:

- `hooks.content-policy:register` to inspect and reject publish or schedule actions.
- `content:read`, `schema:read`, `media:read`, `taxonomies:read`, and `bylines:read` for policy evaluation and saved-entry checks.

Preflight has no outbound network permission, no allowed hosts, no content or media write permission, no publication authority, and no user-directory access. It does not send content to an AI provider or external service. Its only persistent data is policy configuration and a small indexed issue collection owned by the plugin.

Read [SECURITY.md](SECURITY.md) for the complete trust contract.

## Development

Requires Node.js 22 or newer and pnpm. The repository pins `@emdash-cms/plugin-cli` to `0.13.1` because the Registry is experimental.

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

The plugin test host runs compiled sandbox code through EmDash's Worker Loader and bridge. See [docs/development.md](docs/development.md) for the repository workflow.

## License

MIT. See [LICENSE](LICENSE).
