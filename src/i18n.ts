import type { PreflightIssue, Severity } from "./engine/types.js";

export type UiLanguage = "en" | "ja";

const messages = {
  en: {
    dashboardTitle: "EmDash Preflight",
    modeObserve: "Mode: OBSERVE",
    modeEnforce: "Mode: ENFORCE",
    observeDescription:
      "Checks are recorded for review. Publishing and scheduling continue while you try the rules.",
    enforceDescription:
      "Entries with error severity issues are blocked before publishing or scheduling.",
    gettingStarted: "Getting started",
    stepOne: "1. Start in Observe mode. It records issues without blocking publishing.",
    stepTwo:
      "2. In Rules, choose a collection and check, complete the shown options, then save the check.",
    stepThree:
      "3. Open a saved entry and use its Preflight panel to check it. Fix the entry in the editor, save it, then choose Check saved entry again.",
    stepFour:
      "4. Enable Enforce only after the rules look right. Only issues with error severity block publishing and scheduling.",
    stepFive:
      "5. To let agents run checks before publishing, enable this plugin's MCP tools in Plugins. Agents can then call preflight__check_entry.",
    loadExample: "Load starter policy",
    exampleLoaded:
      "Starter policy loaded into the editor. Review the collection and rule, then validate and save it.",
    availableRules: "Available checks",
    fieldRequiredDescription: "Require a field when another field has a specified value.",
    mediaAltDescription: "Require alt text on referenced media.",
    bylineDescription: "Require at least one byline credit.",
    taxonomyDescription: "Require a minimum number of taxonomy terms.",
    referenceDescription: "Require referenced content to be published.",
    errors: "Errors",
    warnings: "Warnings",
    info: "Info",
    recentIssues: "Recent issues",
    noIssues: "No open issues",
    noIssuesDescription:
      "Add and save a check in Rules, then inspect a saved entry in its Preflight panel.",
    policyConfiguration: "Policy configuration",
    policyDescription:
      "Policies are JSON rules scoped to collections. The starter policy is a safe example in Observe mode; change the collection or rule to match your site.",
    policyJson: "Policy JSON",
    savePolicy: "Validate and save",
    enableEnforce: "Enable enforcement",
    enableEnforceTitle: "Enable enforcement?",
    enableEnforceDescription:
      "Issues marked error will block publishing and scheduling. Review your rules before continuing.",
    enable: "Enable",
    cancel: "Cancel",
    returnToObserve: "Return to observe mode",
    policySaved: "Policy validated and saved.",
    modeChanged: "Preflight is now in {mode} mode.",
    unsupportedAction: "Preflight received an unsupported page action.",
    policyJsonMustBeText: "Policy JSON must be text.",
    policyJsonParseError:
      "Policy JSON could not be parsed. Check its brackets and quotation marks.",
    policySaveError: "The policy could not be saved:",
    policyInvalid:
      "The saved policy is invalid. Correct the policy JSON below before relying on checks.",
    needsAttention: "Preflight needs attention",
    entryPanelTitle: "Preflight",
    openFromSavedEntry:
      "Open Preflight from a saved content entry. The panel checks the last saved version, not unsaved edits.",
    entryReadError: "The saved entry could not be read.",
    savedEntry: "Last saved state",
    checkIncomplete: "Check incomplete",
    incompleteEnforceDescription:
      "Not every enabled check finished. Enforce mode blocks publishing when a check is incomplete. Resolve the check or ask an administrator, then check again.",
    incompleteObserveDescription:
      "Not every enabled check finished. Observe mode allows publishing, but this is not a passing result. Resolve the check or ask an administrator, then check again.",
    publishBlocked: "Preflight will block publishing",
    issuesFound: "Found {count} Preflight issue(s)",
    observeIssuesDescription:
      "Observe mode records findings and allows publishing. Fix these issues, save the entry, then check again for an updated result.",
    warningOnlyDescription:
      "No error-severity issue was found. Warnings and information do not block publishing in Enforce mode. Save any changes and check again.",
    allPassed: "All enabled policies passed",
    allPassedObserveDescription:
      "No configured issues were found. Observe mode records findings but does not block publishing.",
    allPassedEnforceDescription:
      "No policy errors were found. Preflight will allow publishing. Save any edits before publishing.",
    blockedInEnforce:
      "Fix the error issues below, save the entry, then check it again. Publishing stays blocked until the errors are resolved.",
    recheckSavedEntry: "Check saved entry again",
    genericIssue: "This check did not pass. Review the rule settings and the saved entry.",
    invalidCheck:
      "Preflight could not inspect this entry. Ask an administrator to review the runtime log.",
    policyLoadError:
      "Preflight could not load the policy. Ask an administrator to review Preflight settings.",
    incompletePublish:
      "Preflight could not complete every check. Review the Preflight panel before publishing.",
    blockedPublish:
      "Preflight blocked publishing: {count} policy error(s). Open the Preflight panel for details.",
    blockedSchedule:
      "Preflight blocked scheduling: {count} policy error(s). Open the Preflight panel for details.",
    severityError: "Error",
    severityWarning: "Warning",
    severityInfo: "Info",
    unknownRule: "Unknown rule. Supported rules: {rules}.",
    requiredOptions: "This active rule requires: {options}.",
    invalidValue: "The value or format is invalid.",
  },
  ja: {
    dashboardTitle: "公開前チェック（EmDash Preflight）",
    modeObserve: "モード：監視（OBSERVE）",
    modeEnforce: "モード：公開ゲート（ENFORCE）",
    observeDescription:
      "問題を記録して確認します。ルールを試している間、記事の公開と予約は止まりません。",
    enforceDescription: "重大度が「エラー」の問題がある記事は、公開・予約できません。",
    gettingStarted: "使い方",
    stepOne: "1. まず監視モードで始めます。問題を記録しますが、公開は止めません。",
    stepTwo:
      "2. ルールタブで対象コレクションとチェック内容を選び、必要な項目を入力して保存します。",
    stepThree:
      "3. 保存済みの記事を開き、編集画面のPreflightパネルで確認します。記事を直して保存したら「保存済みの記事を再チェック」を選びます。",
    stepFour:
      "4. ルールが意図どおりだと確認してから公開ゲートを有効にします。「エラー」の問題だけが公開・予約を止めます。",
    stepFive:
      "5. Agentにも公開前チェックを使わせるには、プラグイン画面でこのプラグインのMCPツールを有効にします。Agentは preflight__check_entry を呼び出せます。",
    loadExample: "サンプル設定を読み込む",
    exampleLoaded:
      "サンプルを入力欄に読み込みました。対象コレクションとルールを確認し、検証して保存してください。",
    availableRules: "利用できるチェック",
    fieldRequiredDescription: "ある項目が指定値のとき、別の項目を必須にします。",
    mediaAltDescription: "記事から参照するメディアに代替テキスト（alt）を求めます。",
    bylineDescription: "記事に著者クレジットを1件以上求めます。",
    taxonomyDescription: "指定した分類から、最低限の用語数を求めます。",
    referenceDescription: "参照先の記事が公開済みであることを求めます。",
    errors: "エラー",
    warnings: "警告",
    info: "情報",
    recentIssues: "最近の問題",
    noIssues: "未解決の問題はありません",
    noIssuesDescription:
      "ルールタブでチェックを追加して保存し、記事編集画面のPreflightパネルで記事を確認してください。",
    policyConfiguration: "ルール設定",
    policyDescription:
      "ルールはコレクションごとのJSON設定です。サンプルは監視モードで読み込まれるため、保存しても公開は止まりません。サイトに合わせて対象コレクションやルールを調整してください。",
    policyJson: "ルール設定（JSON）",
    savePolicy: "検証して保存",
    enableEnforce: "公開ゲートを有効にする",
    enableEnforceTitle: "公開ゲートを有効にしますか？",
    enableEnforceDescription:
      "「エラー」の問題がある記事は公開・予約できなくなります。先にルールを確認してください。",
    enable: "有効にする",
    cancel: "キャンセル",
    returnToObserve: "監視モードに戻す",
    policySaved: "ルール設定を検証して保存しました。",
    modeChanged: "Preflightを{mode}モードに変更しました。",
    unsupportedAction: "Preflightで対応していない操作です。",
    policyJsonMustBeText: "ルール設定はテキスト形式で入力してください。",
    policyJsonParseError: "JSONを読み取れません。括弧や引用符の位置を確認してください。",
    policySaveError: "ルール設定を保存できませんでした：",
    policyInvalid:
      "保存済みのルール設定に誤りがあります。チェックを有効にする前に、下のJSONを修正してください。",
    needsAttention: "Preflightの確認が必要です",
    entryPanelTitle: "公開前チェック（Preflight）",
    openFromSavedEntry:
      "保存済みの記事からPreflightを開いてください。このパネルは未保存の編集内容ではなく、最後に保存した記事をチェックします。",
    entryReadError: "保存済みの記事を読み取れませんでした。",
    savedEntry: "保存済みの記事をチェック",
    checkIncomplete: "チェック未完了",
    incompleteEnforceDescription:
      "有効なチェックをすべて完了できませんでした。公開ゲート有効中は、チェック未完了でも公開できません。設定や実行ログを確認し、もう一度チェックしてください。",
    incompleteObserveDescription:
      "有効なチェックをすべて完了できませんでした。監視モードでは公開は止まりませんが、合格とは判断できません。設定や実行ログを確認してください。",
    publishBlocked: "Preflightが公開を止めます",
    issuesFound: "Preflightの問題が{count}件見つかりました",
    observeIssuesDescription:
      "監視モードでは問題を記録しますが、公開は止めません。記事を修正して保存した後、再チェックしてください。",
    warningOnlyDescription:
      "公開を止める「エラー」はありません。公開ゲート有効中も警告と情報は公開を止めません。修正して保存したら再チェックしてください。",
    allPassed: "有効なルールをすべて通過しました",
    allPassedObserveDescription:
      "有効なルールに問題はありません。監視モードではチェック結果を記録しますが、公開は止めません。",
    allPassedEnforceDescription:
      "公開を止めるルール違反はありません。保存済みの編集内容を公開できます。",
    blockedInEnforce:
      "下のエラーを修正して記事を保存し、もう一度チェックしてください。エラーが解消するまで公開は止まります。",
    recheckSavedEntry: "保存済みの記事を再チェック",
    genericIssue: "このチェックに通りませんでした。ルール設定と保存済みの記事を確認してください。",
    invalidCheck: "記事をチェックできませんでした。管理者に実行ログの確認を依頼してください。",
    policyLoadError:
      "ルール設定を読み込めませんでした。管理者にPreflight設定の確認を依頼してください。",
    incompletePublish:
      "すべてのチェックを完了できないため、公開できません。Preflightパネルを確認してください。",
    blockedPublish:
      "公開前チェックでエラーが{count}件見つかりました。Preflightパネルで内容を確認してください。",
    blockedSchedule:
      "予約前チェックでエラーが{count}件見つかりました。Preflightパネルで内容を確認してください。",
    severityError: "エラー",
    severityWarning: "警告",
    severityInfo: "情報",
    unknownRule: "未対応のルールです。使用できるルール：{rules}。",
    requiredOptions: "このルールには次の設定が必要です：{options}。",
    invalidValue: "値または形式が正しくありません。",
  },
} as const;

export type UiMessages = { [Key in keyof (typeof messages)["en"]]: string };

export function getUiLanguage(locale: unknown): UiLanguage {
  if (typeof locale !== "string") return "en";
  const primary = locale.trim().replaceAll("_", "-").split("-", 1)[0]?.toLowerCase();
  return primary === "ja" ? "ja" : "en";
}

export function getUiMessages(locale: unknown): UiMessages {
  return messages[getUiLanguage(locale)];
}

export function severityLabel(severity: Severity, locale: unknown): string {
  const copy = getUiMessages(locale);
  if (severity === "error") return copy.severityError;
  if (severity === "warning") return copy.severityWarning;
  return copy.severityInfo;
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function getRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

export function localizeIssueMessage(issue: PreflightIssue, locale: unknown): string {
  if (getUiLanguage(locale) !== "ja") return issue.message;
  const details = issue.details ?? {};
  switch (issue.ruleId) {
    case "field.required_when": {
      const when = getRecord(details, "when");
      const field = getString(details, "requiredField") ?? issue.path;
      const condition = getString(when, "field");
      return field && condition
        ? `「${field}」は「${condition}」が条件に一致する場合に必須です。`
        : messages.ja.genericIssue;
    }
    case "media.alt.required":
      return issue.message.includes("could not be found")
        ? "参照しているメディアが見つかりませんでした。"
        : "参照しているメディアに代替テキスト（alt）がありません。";
    case "byline.required":
      return "公開する前に著者クレジットを1件以上追加してください。";
    case "taxonomy.min_terms": {
      const taxonomy = getString(details, "taxonomy") ?? issue.path;
      const minimum = getNumber(details, "expectedMinimum");
      return taxonomy && minimum !== undefined
        ? `公開する前に「${taxonomy}」の用語を最低${minimum}件割り当ててください。`
        : messages.ja.genericIssue;
    }
    case "reference.published":
      return details.targetStatus === null || issue.message.includes("does not exist")
        ? "参照先の記事が見つかりませんでした。"
        : "公開する前に、参照先の記事を公開してください。";
    default:
      return messages.ja.genericIssue;
  }
}

const optionNames: Record<string, string> = {
  when: "when",
  require: "require（必須にする項目）",
  fields: "fields（対象項目）",
  taxonomy: "taxonomy（分類名）",
  min: "min（最低用語数）",
  field: "field（参照項目）",
  targetCollection: "targetCollection（参照先コレクション）",
};

export function localizePolicyError(path: string, message: string, locale: unknown): string {
  if (getUiLanguage(locale) !== "ja") return `${path || "policy"}: ${message}`;
  const label = path || "policy";
  if (message.startsWith("Unknown rule.")) {
    return `${label}: ${messages.ja.unknownRule.replace("{rules}", "field.required_when、media.alt.required、byline.required、taxonomy.min_terms、reference.published")}`;
  }
  const required = message.match(/^Active rule requires (.+)\.$/);
  if (required) {
    const options = required[1]!
      .split(" and ")
      .map((option) => optionNames[option] ?? option)
      .join("、");
    return `${label}: ${messages.ja.requiredOptions.replace("{options}", options)}`;
  }
  return `${label}: ${messages.ja.invalidValue}`;
}

export function localizeHookReason(
  key:
    | "invalidCheck"
    | "policyLoadError"
    | "incompletePublish"
    | "blockedPublish"
    | "blockedSchedule",
  locale: unknown,
  count?: number,
): string {
  const template = getUiMessages(locale)[key];
  return count === undefined ? template : template.replace("{count}", String(count));
}
