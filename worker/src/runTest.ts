import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";
import {
  AuthProfileError,
  type StorageState,
  ensureAuthenticatedSession,
  loadAuthProfile,
  pageTheScriptOpens,
  saveStorageState,
  stateChanged,
} from "./authProfiles.js";
import { applyEnvironment, retargetUrl, scriptBody } from "./playback.js";

async function accessibilityAudit(repoRoot: string): Promise<string> {
  const source = await readFile(path.join(repoRoot, "automation", "framework", "accessibility.py"), "utf8");
  const start = source.indexOf("_AUDIT_JS = \"\"\"");
  const end = source.indexOf("\"\"\"", start + 16);
  if (start < 0 || end < 0) throw new Error("Accessibility audit script is missing.");
  return source.slice(start + 16, end).replace(/\\\\/g, "\\");
}

export type RunOutcome = {
  success: boolean;
  status: string;
  pytest_return_code: number;
  config_path: string;
  title: string | null;
  test_file_location: string | null;
  test_case_location: string | null;
  validation_errors: string[] | null;
  error_message: string | null;
  duration_ms: number;
  screenshot_path: string | null;
  screenshot_error: string | null;
  cancelled?: boolean;
  timed_out?: boolean;
};

export type RunOptions = {
  browser: Browser;
  /**
   * Provides the test's context (e.g. a warm spare from BrowserPool). Defaults to
   * browser.newContext. The context belongs to this test only and is closed when it ends.
   */
  newContext?: (options: BrowserContextOptions) => Promise<BrowserContext>;
  isCancelled?: () => Promise<boolean>;
  environmentBaseUrl?: string | null;
  runId?: string | null;
  /** Whole test, including auth session setup. */
  testTimeoutMs: number;
  /** Default for each Playwright action and navigation. */
  stepTimeoutMs: number;
  /** Set by the caller to abort (e.g. shutdown). */
  signal?: AbortSignal;
};

export class TestNotStartedError extends Error {}

export async function runRecordedTest(repoRoot: string, configPath: string, options: RunOptions): Promise<RunOutcome> {
  const started = Date.now();
  const caseDir = path.resolve(repoRoot, path.dirname(configPath));
  if (!caseDir.startsWith(path.resolve(repoRoot) + path.sep)) {
    return outcome(configPath, false, "Test not started: the configuration path is outside the workspace.", 0);
  }
  const metaPath = path.join(caseDir, "testflow.meta.json");
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;
  } catch {
    meta = {};
  }
  const moduleName = String(meta.recordedModule || "test_recorded.py");
  const scriptPath = path.join(caseDir, moduleName);
  let source = "";
  try {
    source = await readFile(scriptPath, "utf8");
  } catch {
    const fallback = path.join(caseDir, "test_recorded.py");
    source = await readFile(fallback, "utf8");
  }
  const environmentBaseUrl = (options.environmentBaseUrl || "").trim();
  if (environmentBaseUrl) {
    source = applyEnvironment(source, environmentBaseUrl);
    const current = String(meta.resolvedStartUrl || environmentBaseUrl);
    try {
      meta = { ...meta, resolvedStartUrl: retargetUrl(current, environmentBaseUrl) };
    } catch {
      meta = { ...meta, resolvedStartUrl: environmentBaseUrl };
    }
  }
  const body = scriptBody(source);
  // Capability toggles saved on the test case. Off unless the tester enabled them.
  const accessibilityEnabled = meta.accessibilityEnabled === true;
  const networkCheckEnabled = meta.networkCheckEnabled === true;
  const auditJs = accessibilityEnabled ? await accessibilityAudit(repoRoot) : "";

  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let timedOut = false;
  let cancelled = false;
  const stop = async () => {
    if (context) await context.close().catch(() => undefined);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    void stop();
  }, options.testTimeoutMs);
  const cancelTimer = setInterval(() => {
    void options.isCancelled?.().then((value) => {
      if (value) {
        cancelled = true;
        void stop();
      }
    });
  }, 1000);
  const onAbort = () => {
    cancelled = true;
    void stop();
  };
  options.signal?.addEventListener("abort", onAbort);

  const networkFailures: { method: string; url: string; status: number; resourceType: string }[] = [];
  let success = false;
  let errorMessage: string | null = null;
  let shots: StepShots | null = null;
  let screenshotPath: string | null = null;
  let screenshotError: string | null = null;
  try {
    // Auth Profile session: restored, validated and renewed in memory (ADR-004).
    let storageState: StorageState | undefined;
    const profileId = String(meta.authProfileId || "").trim();
    if (profileId) {
      const projectId = path.basename(path.dirname(caseDir));
      try {
        const profile = await loadAuthProfile(repoRoot, projectId, profileId);
        const target = pageTheScriptOpens(source, String(meta.resolvedStartUrl || ""));
        const session = await ensureAuthenticatedSession(options.browser, profile, target, (message) =>
          console.log(`[auth] job=${options.runId || "-"} ${message}`)
        );
        if (stateChanged(profile.storageState, session.state)) await saveStorageState(repoRoot, profile, session.state);
        console.log(`[auth] job=${options.runId || "-"} outcome=${session.outcome}`);
        storageState = session.state;
      } catch (error) {
        if (error instanceof AuthProfileError) throw new TestNotStartedError(`Test not started: ${error.message}`);
        throw error;
      }
    }
    if (timedOut || cancelled) throw new Error("stopped");

    const contextOptions: BrowserContextOptions = {
      viewport: { width: 1280, height: 720 },
      ...(storageState ? { storageState: storageState as never } : {}),
    };
    context = await (options.newContext ? options.newContext(contextOptions) : options.browser.newContext(contextOptions));
    if (timedOut || cancelled) throw new Error("stopped");
    context.setDefaultTimeout(options.stepTimeoutMs);
    context.setDefaultNavigationTimeout(options.stepTimeoutMs);
    page = await context.newPage();
    const seenNetwork = new Set<string>();
    page.on("response", (response) => {
      if (!networkCheckEnabled) return;
      try {
        if (response.status() < 400) return;
        const method = response.request().method();
        const signature = `${method} ${response.url()} ${response.status()}`;
        if (seenNetwork.has(signature)) return;
        seenNetwork.add(signature);
        networkFailures.push({
          method,
          url: response.url(),
          status: response.status(),
          resourceType: response.request().resourceType(),
        });
      } catch {
        return;
      }
    });

    await seedStorage(page, meta);
    shots = await startStepShots(page, repoRoot, options.runId || "");
    const run = new Function(
      "page",
      "expect",
      "__shot",
      "__fail",
      `return (async () => {\n${withStepShots(body)}\n})();`
    ) as (
      page: Page,
      expect: (target: Page) => { toHaveTitle: (title: string | RegExp) => Promise<void> },
      shot: (step: number, label: string) => Promise<void>,
      fail: (step: number, message: string) => Promise<void>
    ) => Promise<void>;
    await run(page, expectTitle, shots.capture, shots.fail);
    const expected = String(meta.expectedResult || "").trim();
    if (expected) {
      const text = await page.locator("body").innerText({ timeout: 10000 });
      if (!text.toLowerCase().includes(expected.toLowerCase())) {
        throw new Error(`Expected text not found: ${expected}`);
      }
    }
    await assertStorage(page, meta);
    if (accessibilityEnabled) {
      const rawViolations = (await page.evaluate(auditJs)) as { rule?: string; message?: string; target?: string }[];
      const violations = uniqueViolations(rawViolations);
      if (violations.length > 0) throw new Error(formatViolations(violations));
    }
    if (networkCheckEnabled && networkFailures.length > 0) throw new Error(formatNetwork(networkFailures));
    if (timedOut || cancelled) throw new Error("stopped");
    success = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errorMessage = timedOut
      ? `Timed out after ${options.testTimeoutMs} ms.`
      : cancelled
        ? "Cancelled"
        : message.slice(0, 3000);
  } finally {
    clearTimeout(timer);
    clearInterval(cancelTimer);
    options.signal?.removeEventListener("abort", onAbort);
  }
  try {
    if (page && !timedOut && !cancelled) screenshotPath = await captureFinalScreenshot(page, repoRoot, options.runId || "");
  } catch (error) {
    screenshotError = error instanceof Error ? error.message : String(error);
    console.error(`Screenshot capture failed: ${screenshotError}`);
  } finally {
    if (shots) await shots.finish(Boolean(screenshotPath)).catch(() => undefined);
    await stop();
  }
  const result = outcome(configPath, success, errorMessage, Date.now() - started, screenshotPath, screenshotError);
  return { ...result, cancelled: cancelled && !success, timed_out: timedOut };
}

type StepShots = {
  capture: (step: number, label: string) => Promise<void>;
  fail: (step: number, message: string) => Promise<void>;
  finish: (includeFinal: boolean) => Promise<void>;
};

function withStepShots(body: string): string {
  return body
    .split("\n")
    .filter((line) => line.trim())
    .map((line, index) => {
      const step = index + 1;
      const label = JSON.stringify(line.trim().slice(0, 160));
      return `try {\n${line}\nawait __shot(${step}, ${label});\n} catch (error) {\nawait __shot(${step}, ${label});\nawait __fail(${step}, error instanceof Error ? error.message : String(error));\nthrow error;\n}`;
    })
    .join("\n");
}

async function startStepShots(page: Page, repoRoot: string, runId: string): Promise<StepShots> {
  const key = runId.replace(/[^A-Za-z0-9_-]/g, "");
  const shots: { file: string; label: string; failed?: boolean; error?: string }[] = [];
  const directory = key ? path.join(repoRoot, "results", key) : "";
  if (directory) await mkdir(directory, { recursive: true });
  return {
    async capture(step: number, label: string) {
      if (!directory || page.isClosed()) return;
      const file = `step-${String(step).padStart(2, "0")}.png`;
      try {
        await page.screenshot({ path: path.join(directory, file), fullPage: false });
        shots.push({ file, label: label.slice(0, 160) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Step screenshot failed: ${message}`);
      }
    },
    async fail(step: number, message: string) {
      const file = `step-${String(step).padStart(2, "0")}.png`;
      const entry = [...shots].reverse().find((shot) => shot.file === file);
      if (!entry) return;
      const text = message.trim().slice(0, 800);
      entry.failed = true;
      entry.error = text;
    },
    async finish(includeFinal: boolean) {
      if (!directory) return;
      if (includeFinal) shots.push({ file: "final-screenshot.png", label: "Final screenshot" });
      if (shots.length === 0) return;
      await writeFile(path.join(directory, "steps.json"), JSON.stringify(shots), "utf8");
    },
  };
}

export async function captureFinalScreenshot(page: Page, repoRoot: string, runId: string): Promise<string | null> {
  const key = runId.replace(/[^A-Za-z0-9_-]/g, "");
  if (!key) return null;
  if (page.isClosed()) return null;
  const relative = path.posix.join("results", key, "final-screenshot.png");
  const filePath = path.join(repoRoot, "results", key, "final-screenshot.png");
  await mkdir(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: false });
  return relative;
}

function expectTitle(target: Page) {
  return {
    async toHaveTitle(expected: string | RegExp) {
      const title = await target.title();
      const matches = expected instanceof RegExp ? expected.test(title) : title === expected;
      if (!matches) throw new Error(`Expected title ${String(expected)} but received ${title}`);
    },
  };
}

function outcome(
  configPath: string,
  success: boolean,
  error: string | null,
  duration: number,
  screenshotPath: string | null = null,
  screenshotError: string | null = null
): RunOutcome {
  return {
    success,
    status: success ? "Pass" : "Fail",
    pytest_return_code: success ? 0 : 1,
    config_path: configPath,
    title: null,
    test_file_location: null,
    test_case_location: null,
    validation_errors: null,
    error_message: error,
    duration_ms: duration,
    screenshot_path: screenshotPath,
    screenshot_error: screenshotError,
  };
}

function uniqueViolations(raw: { rule?: string; message?: string; target?: string }[]) {
  const unique: { rule: string; message: string; target: string }[] = [];
  const seen = new Set<string>();
  for (const item of raw || []) {
    const rule = item.rule || "accessibility";
    const target = item.target || "unknown element";
    const signature = `${rule}\n${target}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push({ rule, message: item.message || "", target });
  }
  return unique;
}

function formatViolations(violations: { rule: string; message: string; target: string }[]): string {
  const shown = violations.slice(0, 15);
  const lines = [`Accessibility check failed with ${violations.length} issue(s):`];
  shown.forEach((item, index) => lines.push(`${index + 1}. [${item.rule}] ${item.message} — ${item.target}`));
  if (violations.length > shown.length) lines.push(`...and ${violations.length - shown.length} more issue(s).`);
  return lines.join("\n");
}

function formatNetwork(failures: { method: string; url: string; status: number; resourceType: string }[]): string {
  const shown = failures.slice(0, 15);
  const lines = [`Network check failed with ${failures.length} failed request(s):`];
  shown.forEach((item, index) => {
    const suffix = item.resourceType ? ` [${item.resourceType}]` : "";
    lines.push(`${index + 1}. ${item.status} ${item.method} ${item.url}${suffix}`);
  });
  if (failures.length > shown.length) lines.push(`...and ${failures.length - shown.length} more failed request(s).`);
  return lines.join("\n");
}

async function seedStorage(page: Page, meta: Record<string, unknown>): Promise<void> {
  const seeds = Array.isArray(meta.storageSeeds) ? meta.storageSeeds : [];
  if (seeds.length === 0) return;
  const origin = String(meta.resolvedStartUrl || "");
  if (!origin) throw new Error("A resolved start URL is required before storage or cookie values can be seeded.");
  const cookies = seeds.filter((entry) => entry && entry.kind === "cookie");
  if (cookies.length > 0) {
    await page.context().addCookies(cookies.map((entry) => ({ name: String(entry.key), value: String(entry.value || ""), url: origin })));
  }
  const web = seeds.filter((entry) => entry && (entry.kind === "localStorage" || entry.kind === "sessionStorage"));
  if (web.length === 0) return;
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.evaluate((entries) => {
    for (const entry of entries) {
      const store = entry.kind === "sessionStorage" ? window.sessionStorage : window.localStorage;
      store.setItem(entry.key, entry.value || "");
    }
  }, web.map((entry) => ({ kind: String(entry.kind), key: String(entry.key), value: String(entry.value || "") })));
}

type StorageEntry = { kind: string; key: string; value: string };

/** Same rules as automation/framework/browser_storage.normalize_entries. */
export function storageEntries(raw: unknown): StorageEntry[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: StorageEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const kind = String(record.kind || "").trim();
    const key = String(record.key || "").trim();
    if (!["localStorage", "sessionStorage", "cookie"].includes(kind) || !key) continue;
    cleaned.push({ kind, key, value: String(record.value ?? "") });
  }
  return cleaned;
}

/** Check configured storage/cookie values after the recorded actions ran. */
async function assertStorage(page: Page, meta: Record<string, unknown>): Promise<void> {
  for (const entry of storageEntries(meta.storageAssertions)) {
    let actual: string | null = null;
    if (entry.kind === "cookie") {
      const cookie = (await page.context().cookies()).find((item) => item.name === entry.key);
      actual = cookie ? cookie.value : null;
    } else {
      actual = await page.evaluate(
        ([area, key]) => (area === "sessionStorage" ? window.sessionStorage : window.localStorage).getItem(key),
        [entry.kind, entry.key] as const
      );
    }
    const label = entry.kind === "cookie" ? `cookie "${entry.key}"` : `${entry.kind} key "${entry.key}"`;
    if (actual === null) throw new Error(`Expected ${label} to equal "${entry.value}", but it was not set.`);
    if (actual !== entry.value) throw new Error(`Expected ${label} to equal "${entry.value}", but received "${actual}".`);
  }
}
