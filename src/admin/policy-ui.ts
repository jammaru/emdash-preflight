import type { Block, FormField } from "@emdash-cms/blocks";
import type { PluginContext } from "emdash/plugin";

import { RULE_IDS, isRuleId, type RuleId, type RuleOptions } from "../engine/types.js";
import { getUiLanguage, getUiMessages } from "../i18n.js";
import { parsePolicyConfig, type PolicyConfig } from "../policy/schema.js";

const labels = {
  en: {
    rules: "Rules",
    overview: "Overview",
    json: "JSON",
    configured: "Configured checks",
    noRules: "No checks configured yet",
    noRulesDescription: "Choose a collection and a check below to add your first rule.",
    collection: "Collection",
    check: "Check",
    severity: "Severity",
    edit: "Edit",
    remove: "Remove",
    removeTitle: "Remove this check?",
    removeText:
      "The check will stop running for this collection. This change is saved immediately.",
    addTitle: "Add or update a check",
    addDescription:
      "Choose a collection, select what to check, then fill in only the options shown for that check.",
    save: "Save check",
    saved: "Check saved.",
    removed: "Check removed.",
    invalid: "Review the highlighted rule options and try again:",
    invalidCondition: "Enter both field names and a valid JSON value for the condition.",
    invalidMedia: "Enter at least one media field name.",
    invalidTaxonomy: "Enter a taxonomy name and a whole number from 0 to 100.",
    invalidReference: "Enter the reference field and target collection.",
    collectionRequired: "Choose a collection.",
    collectionUnavailable: "This collection is not available on the site.",
    conditionField: "When this field",
    conditionValue: 'Equals this JSON value (for example true or "featured")',
    requiredField: "Require this field",
    mediaFieldOne: "Media field",
    mediaFieldTwo: "Second media field (optional)",
    taxonomy: "Taxonomy name",
    minimum: "Minimum number of terms",
    referenceField: "Reference field",
    targetCollection: "Referenced collection",
    off: "Off",
    info: "Info",
    warning: "Warning",
    error: "Error · blocks in Enforce mode",
    ruleGuide: "What each check does",
    agentToolTitle: "Let agents run the check before publishing",
    agentToolDescription:
      "Enable this plugin's MCP tools in Plugins. Agent tools will then show preflight__check_entry, which checks the latest saved entry and reports whether Preflight will block it.",
    fieldRule:
      "Conditional required field · require a field when another field has a chosen value.",
    mediaRule: "Media alt text · check alt text on one or two media fields.",
    bylineRule: "Byline · require at least one author credit.",
    taxonomyRule: "Taxonomy terms · require a minimum number of assigned terms.",
    referenceRule: "Published reference · require linked content to be published.",
    fieldName: "Conditional required field",
    mediaName: "Media alt text",
    bylineName: "Byline credit",
    taxonomyName: "Taxonomy terms",
    referenceName: "Published reference",
    jsonDescription:
      "Advanced editor for defaults, bulk changes, and complete policy import. The guided form above covers collection rules.",
    jsonSaved: "Policy validated and saved.",
    jsonLabel: "Complete policy JSON",
    jsonSave: "Validate and save JSON",
    currentJson: "Saved policy",
    modeHint:
      "Observe records issues without blocking publishing. Error rules block publishing only in Enforce mode.",
  },
  ja: {
    rules: "ルール",
    overview: "概要",
    json: "JSON・詳細設定",
    configured: "設定済みのチェック",
    noRules: "チェックはまだありません",
    noRulesDescription:
      "下のフォームでコレクションとチェック内容を選び、最初のルールを追加してください。",
    collection: "対象コレクション",
    check: "チェック内容",
    severity: "重要度",
    edit: "編集",
    remove: "削除",
    removeTitle: "このチェックを削除しますか？",
    removeText: "このコレクションではチェックが実行されなくなります。変更はすぐに保存されます。",
    addTitle: "チェックを追加・更新",
    addDescription: "コレクションとチェック内容を選ぶと、必要な項目だけが表示されます。",
    save: "チェックを保存",
    saved: "チェックを保存しました。",
    removed: "チェックを削除しました。",
    invalid: "設定内容を確認してください：",
    invalidCondition:
      "条件に使うフィールド、必須にするフィールド、JSON形式の一致値を入力してください。",
    invalidMedia: "メディアのフィールドを1つ以上入力してください。",
    invalidTaxonomy: "分類名と0〜100の整数を入力してください。",
    invalidReference: "参照先のフィールドとコレクションを選んでください。",
    collectionRequired: "コレクションを選んでください。",
    collectionUnavailable: "サイトに存在しないコレクションです。",
    conditionField: "条件に使うフィールド",
    conditionValue: '一致する値（JSON形式。例：true、"featured"）',
    requiredField: "必須にするフィールド",
    mediaFieldOne: "メディアのフィールド",
    mediaFieldTwo: "2つ目のメディアフィールド（任意）",
    taxonomy: "分類名",
    minimum: "必要な用語の最小数",
    referenceField: "参照先を入れるフィールド",
    targetCollection: "参照先のコレクション",
    off: "無効",
    info: "情報",
    warning: "警告",
    error: "エラー・公開ゲートで停止",
    ruleGuide: "チェック内容の説明",
    agentToolTitle: "Agentにも公開前チェックを使わせる",
    agentToolDescription:
      "プラグイン画面でこのプラグインのMCPツールを有効にしてください。Agentのツール一覧に preflight__check_entry が表示され、保存済みの記事を公開前にチェックできます。",
    fieldRule: "条件付き必須項目：別の項目が指定値のとき、項目を必須にします。",
    mediaRule: "メディアの代替テキスト：1〜2個のメディア項目のaltを確認します。",
    bylineRule: "著者クレジット：著者を1人以上求めます。",
    taxonomyRule: "分類の用語：割り当てられた用語の最小数を確認します。",
    referenceRule: "公開済みの参照先：リンク先の記事が公開済みか確認します。",
    fieldName: "条件付き必須項目",
    mediaName: "メディアの代替テキスト",
    bylineName: "著者クレジット",
    taxonomyName: "分類の用語数",
    referenceName: "公開済みの参照先",
    jsonDescription:
      "共通ルールや一括変更、ポリシー全体の読み込みに使う詳細編集です。コレクション別ルールは上のフォームから設定できます。",
    jsonSaved: "ルール設定を検証して保存しました。",
    jsonLabel: "ポリシー全体のJSON",
    jsonSave: "JSONを検証して保存",
    currentJson: "保存済みのポリシー",
    modeHint:
      "監視モードは問題を記録するだけです。エラーのルールが公開を止めるのは公開ゲートが有効なときだけです。",
  },
} as const;

export function policyUiCopy(locale: string) {
  return labels[getUiLanguage(locale)];
}

function ruleName(ruleId: RuleId, locale: string): string {
  const copy = policyUiCopy(locale);
  return {
    "field.required_when": copy.fieldName,
    "media.alt.required": copy.mediaName,
    "byline.required": copy.bylineName,
    "taxonomy.min_terms": copy.taxonomyName,
    "reference.published": copy.referenceName,
  }[ruleId];
}

export interface RuleDraft {
  collection: string;
  ruleId: RuleId;
  severity: RuleOptions["severity"];
  whenField: string;
  whenEquals: string;
  require: string;
  mediaFieldOne: string;
  mediaFieldTwo: string;
  taxonomy: string;
  min: number;
  field: string;
  targetCollection: string;
}

export function draftForRule(policy: PolicyConfig, collection: string, ruleId: RuleId): RuleDraft {
  const rule = policy.collections[collection]?.rules[ruleId];
  return {
    collection,
    ruleId,
    severity: rule?.severity ?? "error",
    whenField: rule?.when?.field ?? "",
    whenEquals: rule?.when ? JSON.stringify(rule.when.equals) : "true",
    require: rule?.require ?? "",
    mediaFieldOne: rule?.fields?.[0] ?? "",
    mediaFieldTwo: rule?.fields?.[1] ?? "",
    taxonomy: rule?.taxonomy ?? "",
    min: rule?.min ?? 1,
    field: rule?.field ?? "",
    targetCollection: rule?.targetCollection ?? "",
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function draftFromValues(values: Record<string, unknown>, fallback: RuleDraft): RuleDraft {
  const id = stringValue(values.rule_id);
  const severity = stringValue(values.severity);
  return {
    collection: stringValue(values.collection) || fallback.collection,
    ruleId: isRuleId(id) ? id : fallback.ruleId,
    severity: ["off", "info", "warning", "error"].includes(severity)
      ? (severity as RuleOptions["severity"])
      : fallback.severity,
    whenField: stringValue(values.when_field),
    whenEquals: stringValue(values.when_equals),
    require: stringValue(values.require),
    mediaFieldOne: stringValue(values.media_field_one),
    mediaFieldTwo: stringValue(values.media_field_two),
    taxonomy: stringValue(values.taxonomy),
    min: typeof values.min === "number" ? values.min : Number(values.min),
    field: stringValue(values.field),
    targetCollection: stringValue(values.target_collection),
  };
}

export function ruleFromDraft(draft: RuleDraft): RuleOptions | null {
  const rule: RuleOptions = { severity: draft.severity };
  if (draft.severity === "off") return rule;
  if (draft.ruleId === "field.required_when") {
    if (!draft.whenField || !draft.require || !draft.whenEquals) return null;
    try {
      rule.when = { field: draft.whenField, equals: JSON.parse(draft.whenEquals) as unknown };
    } catch {
      return null;
    }
    rule.require = draft.require;
  } else if (draft.ruleId === "media.alt.required") {
    rule.fields = [draft.mediaFieldOne, draft.mediaFieldTwo].filter(Boolean);
    if (!rule.fields.length) return null;
  } else if (draft.ruleId === "taxonomy.min_terms") {
    if (!draft.taxonomy || !Number.isInteger(draft.min) || draft.min < 0 || draft.min > 100)
      return null;
    rule.taxonomy = draft.taxonomy;
    rule.min = draft.min;
  } else if (draft.ruleId === "reference.published") {
    if (!draft.field || !draft.targetCollection) return null;
    rule.field = draft.field;
    rule.targetCollection = draft.targetCollection;
  }
  return rule;
}

export function ruleDraftError(draft: RuleDraft, locale: string): string {
  const copy = policyUiCopy(locale);
  if (draft.ruleId === "field.required_when") return copy.invalidCondition;
  if (draft.ruleId === "media.alt.required") return copy.invalidMedia;
  if (draft.ruleId === "taxonomy.min_terms") return copy.invalidTaxonomy;
  if (draft.ruleId === "reference.published") return copy.invalidReference;
  return copy.invalid;
}

export function upsertRule(policy: PolicyConfig, draft: RuleDraft): PolicyConfig | null {
  const rule = ruleFromDraft(draft);
  if (!rule) return null;
  const next: PolicyConfig = {
    ...policy,
    collections: {
      ...policy.collections,
      [draft.collection]: {
        rules: { ...policy.collections[draft.collection]?.rules, [draft.ruleId]: rule },
      },
    },
  };
  const parsed = parsePolicyConfig(next);
  return parsed.success ? parsed.data : null;
}

export function removeRule(policy: PolicyConfig, collection: string, ruleId: RuleId): PolicyConfig {
  const rules = { ...policy.collections[collection]?.rules };
  delete rules[ruleId];
  const collections = { ...policy.collections };
  if (Object.keys(rules).length) collections[collection] = { rules };
  else delete collections[collection];
  return { ...policy, collections };
}

export async function renderPolicyRules(
  ctx: PluginContext,
  policy: PolicyConfig,
  locale: string,
  draft?: RuleDraft,
): Promise<Block[]> {
  const copy = policyUiCopy(locale);
  const available = (await ctx.schema?.listCollections()) ?? [];
  const collectionOptions = [
    ...new Set([...available.map((item) => item.slug), ...Object.keys(policy.collections)]),
  ]
    .sort()
    .map((slug) => ({
      label: available.find((item) => item.slug === slug)?.label ?? slug,
      value: slug,
    }));
  const selected =
    draft ?? draftForRule(policy, collectionOptions[0]?.value ?? "", "byline.required");
  const rows = Object.entries(policy.collections).flatMap(([collection, entry]) =>
    RULE_IDS.flatMap((ruleId) => {
      const rule = entry.rules[ruleId];
      return rule
        ? [
            {
              collection,
              check: ruleName(ruleId, locale),
              severity: rule.severity,
              edit: {
                type: "button" as const,
                action_id: "edit_rule",
                label: copy.edit,
                value: { collection, ruleId },
                style: "secondary" as const,
              },
              remove: {
                type: "button" as const,
                action_id: "remove_rule",
                label: copy.remove,
                value: { collection, ruleId },
                style: "danger" as const,
                confirm: {
                  title: copy.removeTitle,
                  text: copy.removeText,
                  confirm: copy.remove,
                  deny: getUiLanguage(locale) === "ja" ? "キャンセル" : "Cancel",
                  style: "danger" as const,
                },
              },
            },
          ]
        : [];
    }),
  );
  const field = (
    action_id: string,
    label: string,
    initial_value: string,
    ruleId: RuleId,
    placeholder?: string,
  ): FormField => ({
    type: "text_input",
    action_id,
    label,
    initial_value,
    ...(placeholder ? { placeholder } : {}),
    condition: { field: "rule_id", eq: ruleId },
  });
  const fields: FormField[] = [
    {
      type: "select",
      action_id: "collection",
      label: copy.collection,
      options: collectionOptions,
      initial_value: selected.collection,
    },
    {
      type: "select",
      action_id: "rule_id",
      label: copy.check,
      options: RULE_IDS.map((value) => ({ label: ruleName(value, locale), value })),
      initial_value: selected.ruleId,
    },
    {
      type: "select",
      action_id: "severity",
      label: copy.severity,
      options: [
        { label: copy.error, value: "error" },
        { label: copy.warning, value: "warning" },
        { label: copy.info, value: "info" },
        { label: copy.off, value: "off" },
      ],
      initial_value: selected.severity,
    },
    field(
      "when_field",
      copy.conditionField,
      selected.whenField,
      "field.required_when",
      "sponsored",
    ),
    field("when_equals", copy.conditionValue, selected.whenEquals, "field.required_when"),
    field("require", copy.requiredField, selected.require, "field.required_when", "sponsorName"),
    field(
      "media_field_one",
      copy.mediaFieldOne,
      selected.mediaFieldOne,
      "media.alt.required",
      "featuredImage",
    ),
    field("media_field_two", copy.mediaFieldTwo, selected.mediaFieldTwo, "media.alt.required"),
    field("taxonomy", copy.taxonomy, selected.taxonomy, "taxonomy.min_terms", "category"),
    {
      type: "number_input",
      action_id: "min",
      label: copy.minimum,
      initial_value: selected.min,
      min: 0,
      max: 100,
      condition: { field: "rule_id", eq: "taxonomy.min_terms" },
    },
    field("field", copy.referenceField, selected.field, "reference.published", "featuredArticle"),
    {
      type: "select",
      action_id: "target_collection",
      label: copy.targetCollection,
      options: collectionOptions,
      initial_value: selected.targetCollection || collectionOptions[0]?.value,
      condition: { field: "rule_id", eq: "reference.published" },
    },
  ];
  return [
    {
      type: "banner",
      title: copy.agentToolTitle,
      description: copy.agentToolDescription,
      variant: "default",
    },
    { type: "header", text: copy.configured },
    rows.length
      ? {
          type: "table",
          columns: [
            { key: "collection", label: copy.collection },
            { key: "check", label: copy.check },
            { key: "severity", label: copy.severity, format: "badge" },
            { key: "edit", label: "", format: "element" },
            { key: "remove", label: "", format: "element" },
          ],
          rows,
          page_action_id: "rules_page",
        }
      : { type: "empty", title: copy.noRules, description: copy.noRulesDescription, size: "sm" },
    { type: "divider" },
    { type: "header", text: copy.addTitle },
    { type: "section", text: copy.addDescription },
    ...(available.length
      ? [
          {
            type: "form" as const,
            block_id: "rule-form",
            fields,
            submit: { label: copy.save, action_id: "save_rule" },
          },
        ]
      : [
          {
            type: "section" as const,
            text:
              getUiLanguage(locale) === "ja"
                ? "チェックを追加する前にEmDashでコンテンツのコレクションを作成してください。"
                : "Create a content collection in EmDash before adding a check.",
          },
        ]),
    { type: "context", text: copy.modeHint },
    {
      type: "accordion",
      label: copy.ruleGuide,
      blocks: [
        { type: "section", text: copy.fieldRule },
        { type: "section", text: copy.mediaRule },
        { type: "section", text: copy.bylineRule },
        { type: "section", text: copy.taxonomyRule },
        { type: "section", text: copy.referenceRule },
      ],
    },
  ];
}

export function renderPolicyJson(policy: PolicyConfig, locale: string, input?: string): Block[] {
  const copy = policyUiCopy(locale);
  return [
    { type: "section", text: copy.jsonDescription },
    {
      type: "accordion",
      label: copy.currentJson,
      blocks: [{ type: "code", code: JSON.stringify(policy, null, 2), language: "jsonc" }],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "load_example",
          label: getUiMessages(locale).loadExample,
          style: "secondary",
        },
      ],
    },
    {
      type: "form",
      block_id: "policy-form",
      fields: [
        {
          type: "text_input",
          action_id: "policy_json",
          label: copy.jsonLabel,
          multiline: true,
          initial_value: input ?? JSON.stringify(policy, null, 2),
        },
      ],
      submit: { label: copy.jsonSave, action_id: "save_policy" },
    },
  ];
}
