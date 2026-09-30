import { readFile } from "node:fs/promises";
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
};

export async function runRecordedTest(
  repoRoot: string,
  configPath: string,
  options?: { isCancelled?: () => Promise<boolean>; environmentBaseUrl?: string | null }
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

  try {
    await seedStorage(page, meta);
    const run = new Function(
      "page",
      "expect",
      `return (async () => {\n${body}\n})();`
    ) as (page: Page, expect: (target: Page) => { toHaveTitle: (title: string | RegExp) => Promise<void> }) => Promise<void>;
    await run(page, expectTitle);
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
    return outcome(configPath, true, null, Date.now() - started);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return outcome(configPath, false, message.slice(0, 3000), Date.now() - started);
  } finally {
    clearInterval(cancelTimer);
    await browser.close().catch(() => undefined);
  }
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

function outcome(configPath: string, success: boolean, error: string | null, duration: number): RunOutcome {
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
