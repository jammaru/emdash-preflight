import { afterEach, describe, expect, it } from "vitest";

import {
  createPluginRuntimeTestHost,
  createPluginTestHost,
  type PluginRuntimeTestHost,
  type PluginTestHost,
} from "@emdash-cms/plugin-test";

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
          text: "Publication is blocked while Preflight is in enforce mode.",
        }),
      ]),
    });

    await runtimeHost.fixtures.plugin.setting("policy", { ...observePolicy, mode: "enforce" });
    const enforcePanel = await runtimeHost.admin.loadEditorPanel("preflight", "posts", entry.id);
    expect(enforcePanel).toMatchObject({
      blocks: expect.arrayContaining([
        expect.objectContaining({
          type: "context",
          text: "Publication is blocked while Preflight is in enforce mode.",
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
