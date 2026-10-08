import type { AuthProfileSummary, StorageKind, TestCaseSummary } from "@/lib/api";
import { versionLabel } from "@/lib/roman";

/** Expected result, falling back to the first legacy assertion value. */
export function resolveExpectedResult(data: TestCaseSummary): string {
  if (data.expectedResult) return data.expectedResult;
  const legacy = data.assertions?.find((item) => item.value?.trim());
  return legacy?.value ?? "";
}

/** "Draft", "Draft · II published" or "Published · III". */
export function testCaseStatusLabel(testCase: TestCaseSummary): string {
  if (testCase.isDraft && (testCase.publishedVersion ?? 0) === 0) return "Draft";
  if (testCase.isDraft) {
    return `Draft · ${versionLabel(testCase.publishedVersion ?? 0)} published`;
  }
  return `Published · ${versionLabel(testCase.publishedVersion ?? 0)}`;
}

/** Auth profile option label including its session health. */
export function authProfileLabel(profile: AuthProfileSummary): string {
  if (!profile.hasStorageState) return `${profile.name} (no session)`;
  if (profile.sessionStatus === "expired") return `${profile.name} (session expired)`;
  if (profile.sessionStatus === "expiring") return `${profile.name} (session expiring)`;
  return profile.name;
}

export function storageKindLabel(kind: StorageKind): string {
  if (kind === "cookie") return "Cookie";
  if (kind === "localStorage") return "Local Storage";
  return "Session Storage";
}

/** Resolves once the tab is visible, so polling loops pause while it is hidden. */
export function whenVisible(): Promise<void> {
  if (typeof document === "undefined" || !document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
  });
}

/* ------------------------------------------------------------------ */
/* Read-only step view derived from the Playwright script              */
/* ------------------------------------------------------------------ */

export type ScriptStep = {
  /** Human verb, e.g. "Navigate", "Click", "Fill", "Expect visible". */
  verb: string;
  /** Locator or URL the step targets, as written in the script. */
  target: string;
  /** Typed value / expected value, when present. */
  value?: string;
  /** Original source line (trimmed). */
  raw: string;
  line: number;
};

export type ScriptOutline = { act: ScriptStep[]; assert: ScriptStep[] };

const ACTION_VERBS: Record<string, string> = {
  goto: "Navigate",
  click: "Click",
  dblclick: "Double-click",
  fill: "Fill",
  type: "Type",
  pressSequentially: "Type",
  press: "Press key",
  check: "Check",
  uncheck: "Uncheck",
  selectOption: "Select",
  setInputFiles: "Upload",
  hover: "Hover",
  focus: "Focus",
  reload: "Reload",
  waitForTimeout: "Wait",
  waitForURL: "Wait for URL",
  waitForSelector: "Wait for",
  waitForLoadState: "Wait for load",
  scrollIntoViewIfNeeded: "Scroll",
  mouse: "Scroll",
};

const EXPECT_VERBS: Record<string, string> = {
  toBeVisible: "Visible",
  toBeHidden: "Hidden",
  toHaveText: "Text is",
  toContainText: "Text contains",
  toHaveURL: "URL is",
  toHaveUrl: "URL is",
  toHaveTitle: "Title is",
  toBeEnabled: "Enabled",
  toBeDisabled: "Disabled",
  toBeChecked: "Checked",
  toHaveCount: "Count is",
  toHaveValue: "Value is",
  toHaveAttribute: "Attribute",
};

/** Last string literal argument of a call expression, e.g. `.fill('#q', 'x')` → "x". */
function stringArgs(source: string): string[] {
  const args: string[] = [];
  const pattern = /(["'`])((?:\\.|(?!\1).)*)\1/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) args.push(match[2]);
  return args;
}

/** Locator chain between `page.` and the final action, e.g. `getByRole('button', { name: 'Apply' })`. */
function locatorOf(chain: string): string {
  return chain
    .replace(/^page\./, "")
    .replace(/\.(first|last)\(\)$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const camel = (name: string) => name.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());

/**
 * Parses a recorded Playwright script (Python sync API or JS/TS) into readable
 * Act and Assert steps. Best effort and read-only: unrecognised lines are
 * skipped, nothing is executed.
 */
export function parseScriptSteps(script: string): ScriptOutline {
  const outline: ScriptOutline = { act: [], assert: [] };
  script.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    const body = line.replace(/^await\s+/, "").replace(/;$/, "");
    if (!body.startsWith("page.") && !body.startsWith("expect(")) return;

    const expectMatch = body.match(/^expect\((.+)\)\.(not[._])?(\w+)\((.*)\)$/);
    if (expectMatch) {
      const [, subject, negated, matcher, args] = expectMatch;
      const key = camel(matcher.replace(/^not_/, ""));
      const verb = `${negated || matcher.startsWith("not_") ? "Not " : ""}${EXPECT_VERBS[key] ?? key}`;
      const value = stringArgs(args)[0];
      outline.assert.push({ verb, target: locatorOf(subject), value, raw: line, line: index + 1 });
      return;
    }

    const actionMatch = body.match(/^(page(?:\..+?)?)\.(\w+)\((.*)\)$/);
    if (!actionMatch) return;
    const [, chain, rawMethod, args] = actionMatch;
    const method = camel(rawMethod);
    const verb = ACTION_VERBS[method];
    if (!verb) return;
    const literals = stringArgs(args);
    if (method === "goto" || method === "waitForURL") {
      outline.act.push({ verb, target: literals[0] ?? args, raw: line, line: index + 1 });
      return;
    }
    if (method === "waitForTimeout") {
      outline.act.push({ verb, target: `${args.trim()} ms`, raw: line, line: index + 1 });
      return;
    }
    const target = chain === "page" ? (literals.length > 1 ? literals[0] : "") : locatorOf(chain);
    const value = chain === "page" ? (literals.length > 1 ? literals[1] : literals[0]) : literals[0];
    outline.act.push({ verb, target: target || "page", value, raw: line, line: index + 1 });
  });
  return outline;
}

/** "840ms", "4.2s", "1m 05s". */
export function formatDurationMs(ms?: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
}

/** How a run was started, from the history row. */
export function runTrigger(run: { scheduledFor?: string | null }): string {
  return run.scheduledFor ? "Scheduled" : "Manual";
}

/* ------------------------------------------------------------------ */
/* Display helpers for the detail page                                 */
/* ------------------------------------------------------------------ */

/** "just now", "5m ago", "2h ago", "3d ago", or a date for older values. */
export function formatRelative(value?: string | null, now: number = Date.now()): string {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "—";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(time).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const SECRET_FIELD = /pass(word|wd|code)?|pwd|secret|token|api[-_ ]?key|otp|\bpin\b|credential/i;

/** True when a step targets a secret field (password, token, PIN…); its value must be masked. */
export function isSecretField(...parts: (string | null | undefined)[]): boolean {
  return parts.some((part) => Boolean(part && SECRET_FIELD.test(part)));
}

/** Masks a value for display. */
export const MASKED_VALUE = "••••";
