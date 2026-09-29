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

After installation, open **Preflight → Rules**. Select a collection and check, fill in the options shown, and save. Keep Observe mode while you review the reported issues. Enable Enforce from the Preflight dashboard when the policy is ready to gate publication. The **JSON** tab is available for bulk edits and shared default rules.

## 日本語での使い方

管理画面が日本語の場合、Preflightも日本語で表示されます。

1. プラグインを有効にし、まず**監視モード**のまま試します。このモードでは問題を記録しますが、公開と予約は止めません。
2. Preflightの**ルール**タブで対象コレクションとチェック内容を選びます。表示された項目を入力し、**チェックを保存**を選びます。JSONを直接編集する必要はありません。
3. 保存済みの記事を開き、編集画面の**Preflight**パネルで結果を確認します。記事を修正して保存したら、パネルを開き直して再チェックします。
4. ルールが意図どおりに働くと確認してから**公開ゲート**を有効にします。重要度が「エラー」の問題だけが公開と予約を止めます。

共通ルールやポリシー全体の一括編集には**JSON・詳細設定**タブを使えます。MCPツールはEmDash管理者が別途有効にした場合に利用できます。

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
