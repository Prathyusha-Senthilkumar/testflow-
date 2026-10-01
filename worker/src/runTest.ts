import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
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
};

export async function runRecordedTest(
  repoRoot: string,
  configPath: string,
  options?: { isCancelled?: () => Promise<boolean>; environmentBaseUrl?: string | null; runId?: string | null }
): Promise<RunOutcome> {
  const started = Date.now();
  const caseDir = path.resolve(repoRoot, path.dirname(configPath));
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
  const environmentBaseUrl = (options?.environmentBaseUrl || "").trim();
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
  const projectId = path.basename(path.dirname(caseDir));
  const profileId = String(meta.authProfileId || "").trim();
  const storageState = profileId
    ? path.join(repoRoot, "automation", "auth-profiles", projectId, profileId, "storage_state.json")
    : undefined;
  if (profileId && !(await exists(storageState))) {
    return outcome(configPath, false, "Authenticated session file is missing for this auth profile.", 0);
  }
  const auditJs = await accessibilityAudit(repoRoot);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    storageState: await exists(storageState) ? storageState : undefined,
  });
  const page = await context.newPage();
  const cancelTimer = setInterval(() => {
    void options?.isCancelled?.().then((cancelled) => {
      if (cancelled) void browser.close();
    });
  }, 1000);
  const networkFailures: { method: string; url: string; status: number; resourceType: string }[] = [];
  const seenNetwork = new Set<string>();
  page.on("response", (response) => {
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

  let success = false;
  let errorMessage: string | null = null;
  let shots: StepShots | null = null;
  try {
    await seedStorage(page, meta);
    shots = await startStepShots(page, repoRoot, options?.runId || "");
    const run = new Function(
      "page",
      "expect",
      "__shot",
      `return (async () => {\n${withStepShots(body)}\n})();`
    ) as (
      page: Page,
      expect: (target: Page) => { toHaveTitle: (title: string | RegExp) => Promise<void> },
      shot: (step: number, label: string) => Promise<void>
    ) => Promise<void>;
    await run(page, expectTitle, shots.capture);
    const expected = String(meta.expectedResult || "").trim();
    if (expected) {
      const text = await page.locator("body").innerText({ timeout: 10000 });
      if (!text.toLowerCase().includes(expected.toLowerCase())) {
        throw new Error(`Expected text not found: ${expected}`);
      }
    }
    const rawViolations = (await page.evaluate(auditJs)) as { rule?: string; message?: string; target?: string }[];
    const violations = uniqueViolations(rawViolations);
    if (violations.length > 0) throw new Error(formatViolations(violations));
    if (networkFailures.length > 0) throw new Error(formatNetwork(networkFailures));
    success = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errorMessage = message.slice(0, 3000);
  }
  let screenshotPath: string | null = null;
  let screenshotError: string | null = null;
  try {
    screenshotPath = await captureFinalScreenshot(page, repoRoot, options?.runId || "");
  } catch (error) {
    screenshotError = error instanceof Error ? error.message : String(error);
    console.error(`Screenshot capture failed: ${screenshotError}`);
  } finally {
    if (shots) await shots.finish(Boolean(screenshotPath)).catch(() => undefined);
    clearInterval(cancelTimer);
    await browser.close().catch(() => undefined);
  }
  return outcome(configPath, success, errorMessage, Date.now() - started, screenshotPath, screenshotError);
}

type StepShots = {
  capture: (step: number, label: string) => Promise<void>;
  finish: (includeFinal: boolean) => Promise<void>;
};

function withStepShots(body: string): string {
  return body
    .split("\n")
    .filter((line) => line.trim())
    .map((line, index) => {
      const step = index + 1;
      const label = JSON.stringify(line.trim().slice(0, 160));
      return `try {\n${line}\nawait __shot(${step}, ${label});\n} catch (error) {\nawait __shot(${step}, ${label});\nthrow error;\n}`;
    })
    .join("\n");
}

async function startStepShots(page: Page, repoRoot: string, runId: string): Promise<StepShots> {
  const key = runId.replace(/[^A-Za-z0-9_-]/g, "");
  const shots: { file: string; label: string }[] = [];
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

async function exists(filePath: string | undefined): Promise<boolean> {
  if (!filePath) return false;
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
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
