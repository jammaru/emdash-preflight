import { afterEach, describe, expect, it } from "vitest";

import {
  createPluginRuntimeTestHost,
  createPluginTestHost,
  type PluginRuntimeTestHost,
  type PluginTestHost,
} from "@emdash-cms/plugin-test";

import type { PreflightIssue } from "../src/engine/types.js";
import {
  getUiLanguage,
  getUiMessages,
  localizeIssueMessage,
  localizePolicyError,
  severityLabel,
} from "../src/i18n.js";

let host: PluginTestHost | undefined;
let runtimeHost: PluginRuntimeTestHost | undefined;

afterEach(async () => {
  await host?.dispose();
  host = undefined;
  await runtimeHost?.dispose();
  runtimeHost = undefined;
});

const policy = {
  version: 1,
  mode: "observe",
  defaults: {},
  collections: {
    posts: {
      rules: {
        "field.required_when": {
          severity: "error",
          when: { field: "sponsored", equals: true },
          require: "sponsorName",
        },
      },
    },
  },
};

async function savePolicy(mode: "observe" | "enforce") {
  if (!host) throw new Error("Test host is not initialized.");
  const value = { ...policy, mode };
  return host.invokeRoute("admin", {
    type: "form_submit",
    action_id: "save_policy",
    values: { policy_json: JSON.stringify(value) },
  });
}

describe("compiled sandbox plugin", () => {
  it("keeps its declared capabilities read-only and network-free", async () => {
    host = await createPluginTestHost();
    expect(host.manifest.capabilities).toHaveLength(6);
    expect(host.manifest.capabilities).toEqual(
      expect.arrayContaining([
        "hooks.content-policy:register",
        "content:read",
        "schema:read",
        "media:read",
        "taxonomies:read",
        "bylines:read",
      ]),
    );
    expect(host.manifest.allowedHosts).toEqual([]);
  });

  it("records issues but allows publication in observe mode", async () => {
    host = await createPluginTestHost();
    await savePolicy("observe");
    await expect(
      host.invokeHook("content:beforePublish", {
        collection: "posts",
        content: { id: "post-1", data: { sponsored: true, sponsorName: "" } },
        origin: { source: "api" },
      }),
    ).resolves.toBeUndefined();
    const issues = await host.storage("issues").list();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.data).toMatchObject({
      ruleId: "field.required_when",
      severity: "error",
      collection: "posts",
      contentId: "post-1",
    });
    await expect(
      host.invokeRoute("issues/list", { collection: "posts", limit: 10 }),
    ).resolves.toMatchObject({
      ok: true,
      items: [expect.objectContaining({ ruleId: "field.required_when", contentId: "post-1" })],
    });
  });

  it("blocks publish and schedule in enforce mode", async () => {
    host = await createPluginTestHost();
    await savePolicy("enforce");
    const event = {
      collection: "posts",
      content: { id: "post-2", data: { sponsored: true } },
      origin: { source: "mcp" },
    };
    await expect(host.invokeHook("content:beforePublish", event)).resolves.toMatchObject({
      cancel: true,
      reason: expect.stringContaining("1 policy error"),
    });
    await expect(
      host.invokeHook("content:beforeSchedule", {
        ...event,
        scheduledAt: "2026-10-01T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({ cancel: true });
  });

  it("localizes publication rejection text using the content locale", async () => {
    host = await createPluginTestHost();
    await savePolicy("enforce");
    await expect(
      host.invokeHook("content:beforePublish", {
        collection: "posts",
        content: {
          id: "post-ja",
          locale: "ja-JP",
          data: { sponsored: true },
        },
        origin: { source: "visual-editor" },
      }),
    ).resolves.toMatchObject({
      cancel: true,
      reason: expect.stringContaining("公開前チェックでエラーが1件見つかりました"),
    });
  });

  it("applies enforce policy to every publication origin", async () => {
    host = await createPluginTestHost();
    await savePolicy("enforce");
    const origins = ["api", "mcp", "visual-editor", "plugin", "scheduler", "system"] as const;

    for (const source of origins) {
      await expect(
        host.invokeHook("content:beforePublish", {
          collection: "posts",
          content: { id: `post-${source}`, data: { sponsored: true } },
          origin: { source },
        }),
      ).resolves.toMatchObject({ cancel: true });
    }
  });

  it("clears resolved issue records on a completed recheck", async () => {
    host = await createPluginTestHost();
    await savePolicy("observe");
    await host.invokeHook("content:beforePublish", {
      collection: "posts",
      content: { id: "post-3", data: { sponsored: true } },
      origin: { source: "visual-editor" },
    });
    await host.invokeHook("content:beforePublish", {
      collection: "posts",
      content: { id: "post-3", data: { sponsored: false } },
      origin: { source: "system" },
    });
    await expect(host.storage("issues").list()).resolves.toHaveLength(0);
  });

  it("validates and saves policy JSON through the private Block Kit route", async () => {
    host = await createPluginTestHost();
    const response = await savePolicy("enforce");
    expect(response).toMatchObject({ toast: { type: "success" } });
    const page = await host.invokeRoute("admin", { type: "page_load", page: "/dashboard" });
    expect(page).toMatchObject({
      blocks: expect.arrayContaining([
        expect.objectContaining({ type: "header", text: "EmDash Preflight" }),
      ]),
    });
  });

  it("renders the panel against the saved entry through the EmDash runtime", async () => {
    runtimeHost = await createPluginRuntimeTestHost();
    await runtimeHost.fixtures.collection({ slug: "posts", label: "Posts" });
    const entry = await runtimeHost.fixtures.content("posts", {
      data: {},
      status: "draft",
    });

    const panel = await runtimeHost.admin.loadEditorPanel("preflight", "posts", entry.id);

    expect(panel).toMatchObject({
      blocks: expect.arrayContaining([
        expect.objectContaining({ type: "header", text: "Preflight" }),
        expect.objectContaining({
          type: "banner",
          title: "All enabled policies passed",
        }),
      ]),
    });

    const published = await Promise.all(
      Array.from({ length: 3 }, () =>
        runtimeHost!.fixtures.content("posts", { data: {}, status: "published" }),
      ),
    );
    const firstPage = await runtimeHost.transport.invokeRoute("audit/batch", {
      collection: "posts",
      limit: 2,
    });
    expect(firstPage).toMatchObject({
      ok: true,
      hasMore: true,
      pageLimit: 2,
      results: [{ contentId: expect.any(String) }, { contentId: expect.any(String) }],
    });
    if (!firstPage || typeof firstPage !== "object" || !("nextCursor" in firstPage))
      throw new Error("The first audit page did not return a cursor.");
    const secondPage = await runtimeHost.transport.invokeRoute("audit/batch", {
      collection: "posts",
      cursor: typeof firstPage.nextCursor === "string" ? firstPage.nextCursor : undefined,
      limit: 2,
    });
    expect(secondPage).toMatchObject({
      ok: true,
      hasMore: false,
      pageLimit: 2,
      results: [{ contentId: expect.any(String) }],
    });
    expect(published).toHaveLength(3);
  });

  it("shows guided Japanese rules and loads an unsaved starter policy", async () => {
    host = await createPluginTestHost();
    await host.createCollection({ slug: "posts", label: "Posts" });
    const japaneseUi = { surface: "admin-page", locale: "ja", direction: "ltr" } as const;
    const dashboard = await host.invokeRoute(
      "admin",
      { type: "page_load", page: "/dashboard" },
      { ui: japaneseUi },
    );
    const rendered = JSON.stringify(dashboard);
    expect(rendered).toContain('"action_id":"save_rule"');
    expect(rendered).toContain('"label":"ルール"');
    expect(rendered).toContain(getUiMessages("ja").gettingStarted);

    const loaded = await host.invokeRoute(
      "admin",
      { type: "block_action", action_id: "load_example" },
      { ui: japaneseUi },
    );
    expect(loaded).toMatchObject({ toast: { type: "success" } });
    expect(JSON.stringify(loaded)).toContain('"byline.required"');

    const englishDashboard = await host.invokeRoute(
      "admin",
      { type: "page_load", page: "/dashboard" },
      { ui: { surface: "admin-page", locale: "en-US", direction: "ltr" } },
    );
    expect(JSON.stringify(englishDashboard)).toContain(getUiMessages("en").stepOne);
  });

  it("adds, edits, and removes a collection rule through the validated admin page", async () => {
    runtimeHost = await createPluginRuntimeTestHost();
    await runtimeHost.fixtures.collection({ slug: "posts", label: "Posts" });

    const page = await runtimeHost.admin.loadPage("/dashboard");
    expect(page.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ type: "tab" })]));

    const invalid = await runtimeHost.admin.submit("/dashboard", "save_rule", {
      collection: "posts",
      rule_id: "taxonomy.min_terms",
      severity: "warning",
      taxonomy: "category",
      min: -1,
    });
    expect(invalid.blocks).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "banner", variant: "error" })]),
    );
    expect(await runtimeHost.inspect.setting("policy")).toBeNull();

    const saved = await runtimeHost.admin.submit("/dashboard", "save_rule", {
      collection: "posts",
      rule_id: "taxonomy.min_terms",
      severity: "warning",
      taxonomy: "category",
      min: 2,
    });
    expect(saved.toast).toMatchObject({ type: "success" });
    expect(await runtimeHost.inspect.setting("policy")).toMatchObject({
      collections: {
        posts: {
          rules: { "taxonomy.min_terms": { severity: "warning", taxonomy: "category", min: 2 } },
        },
      },
    });

    const edited = await runtimeHost.admin.act("/dashboard", "edit_rule", {
      value: { collection: "posts", ruleId: "taxonomy.min_terms" },
    });
    expect(JSON.stringify(edited)).toContain('"initial_value":2');

    const removed = await runtimeHost.admin.act("/dashboard", "remove_rule", {
      value: { collection: "posts", ruleId: "taxonomy.min_terms" },
    });
    expect(removed.toast).toMatchObject({ type: "success" });
    expect(await runtimeHost.inspect.setting("policy")).toMatchObject({ collections: {} });
  });

  it("localizes all rule issues, policy errors, and enforcement guidance for Japanese admins", async () => {
    expect(getUiLanguage("ja-JP")).toBe("ja");
    expect(getUiLanguage("en-US")).toBe("en");
    expect(severityLabel("error", "ja")).toBe("エラー");
    expect(getUiMessages("ja").blockedInEnforce).toContain("公開ゲートが有効なため");

    const sharedIssue = {
      severity: "error" as const,
      collection: "posts",
      contentId: "post-ja",
      fingerprint: "issue-ja",
    };
    const issues: PreflightIssue[] = [
      {
        ...sharedIssue,
        ruleId: "field.required_when",
        path: "sponsorName",
        message: "sponsorName is required when sponsored matches the configured value.",
        details: { requiredField: "sponsorName", when: { field: "sponsored", equals: true } },
      },
      {
        ...sharedIssue,
        ruleId: "media.alt.required",
        path: "featuredImage",
        message: "Referenced media is missing alt text.",
      },
      {
        ...sharedIssue,
        ruleId: "media.alt.required",
        path: "featuredImage",
        message: "Referenced media could not be found.",
      },
      {
        ...sharedIssue,
        ruleId: "byline.required",
        message: "This entry needs at least one byline before publication.",
      },
      {
        ...sharedIssue,
        ruleId: "taxonomy.min_terms",
        path: "category",
        message: "Assign at least 2 category terms before publication.",
        details: { expectedMinimum: 2, actual: 0 },
      },
      {
        ...sharedIssue,
        ruleId: "reference.published",
        path: "featuredArticle",
        message: "Referenced content does not exist.",
        details: { targetStatus: null },
      },
      {
        ...sharedIssue,
        ruleId: "reference.published",
        path: "featuredArticle",
        message: "Referenced content must be published before this entry can go live.",
        details: { targetStatus: "draft" },
      },
    ];
    expect(issues.map((issue) => localizeIssueMessage(issue, "ja-JP"))).toEqual([
      "「sponsorName」は「sponsored」が条件に一致する場合に必須です。",
      "参照しているメディアに代替テキスト（alt）がありません。",
      "参照しているメディアが見つかりませんでした。",
      "公開する前に著者クレジットを1件以上追加してください。",
      "公開する前に「category」の用語を最低2件割り当ててください。",
      "参照先の記事が見つかりませんでした。",
      "公開する前に、参照先の記事を公開してください。",
    ]);
    expect(localizeIssueMessage(issues[0]!, "en-US")).toBe(issues[0]!.message);
    expect(
      localizePolicyError(
        "collections.posts.rules.reference.published",
        "Active rule requires field and targetCollection.",
        "ja",
      ),
    ).toContain("field（参照項目）、targetCollection（参照先コレクション）");
  });

  it("only describes failing entries as blocked when enforcement is enabled", async () => {
    runtimeHost = await createPluginRuntimeTestHost();
    await runtimeHost.fixtures.collection({ slug: "posts", label: "Posts" });
    const entry = await runtimeHost.fixtures.content("posts", {
      data: {},
      status: "draft",
    });
    const observePolicy = {
      version: 1,
      mode: "observe",
      defaults: {},
      collections: {
        posts: { rules: { "byline.required": { severity: "error" } } },
      },
    } as const;
    await runtimeHost.fixtures.plugin.setting("policy", observePolicy);

    const observePanel = await runtimeHost.admin.loadEditorPanel("preflight", "posts", entry.id);
    expect(observePanel).toMatchObject({
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "section",
          text: expect.stringContaining("This entry needs at least one byline before publication."),
        }),
      ]),
    });
    expect(observePanel).not.toMatchObject({
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "context",
          text: expect.stringContaining(
            "Publishing is blocked while Preflight is in Enforce mode.",
          ),
        }),
      ]),
    });

    await runtimeHost.fixtures.plugin.setting("policy", { ...observePolicy, mode: "enforce" });
    const enforcePanel = await runtimeHost.admin.loadEditorPanel("preflight", "posts", entry.id);
    expect(enforcePanel).toMatchObject({
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "context",
          text: expect.stringContaining(
            "Publishing is blocked while Preflight is in Enforce mode.",
          ),
        }),
      ]),
    });
  });

  it("rechecks scheduled content when its publish time arrives", async () => {
    runtimeHost = await createPluginRuntimeTestHost();
    await runtimeHost.fixtures.collection({
      slug: "posts",
      label: "Posts",
      fields: [
        { slug: "sponsored", label: "Sponsored", type: "boolean" },
        { slug: "sponsor_name", label: "Sponsor name", type: "text" },
      ],
    });
    await runtimeHost.fixtures.plugin.setting("policy", {
      version: 1,
      mode: "enforce",
      defaults: {},
      collections: {
        posts: {
          rules: {
            "field.required_when": {
              severity: "error",
              when: { field: "sponsored", equals: true },
              require: "sponsor_name",
            },
          },
        },
      },
    });
    const entry = await runtimeHost.fixtures.content("posts", {
      slug: "preflight-scheduled",
      data: { sponsored: false },
      status: "draft",
    });
    const scheduled = await runtimeHost.actions.content.schedule(
      "posts",
      entry.id,
      "2026-10-01T00:00:00.000Z",
    );
    if (!scheduled.success) throw new Error(JSON.stringify(scheduled));
    await expect(
      runtimeHost.actions.content.update("posts", entry.id, { data: { sponsored: true } }),
    ).resolves.toMatchObject({ success: true });

    runtimeHost.scheduled.setTime("2026-10-01T00:00:01.000Z");
    const run = await runtimeHost.scheduled.run();

    expect(run.published).toEqual([]);
    await expect(runtimeHost.inspect.scheduledPolicyRejections()).resolves.toHaveLength(1);
  });
});
