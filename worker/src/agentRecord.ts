import type { Browser, BrowserContext, Page } from "playwright";
import type { Redis } from "ioredis";
import { AuthProfileError, ensureAuthenticatedSession, loadAuthProfile } from "./authProfiles.js";
import { revealLocator } from "./reveal.js";
import { REDIS_FULL_MESSAGE, isRedisOom, noteRedisOom, redisWriteDelayMs } from "./redisOom.js";

const JOB_PREFIX = "testflow:agent:job:";
export const AGENT_QUEUE = "testflow:agent:queue";
const JOB_TTL_SECONDS = 60 * 60 * 48;
const MAX_STEPS = 40;
const MAX_MS = 60_000;
const MAX_PARALLEL = 3;

type Control = { role: string; name: string; path?: string };
type Step = { action: string; target: string; value: string };
type DiaryLine = { action: string; role: string; name: string; value: string; url: string };

type AgentPageLink = { name: string; path: string; controls?: Control[] };

type PlannedCase = {
  id: string;
  name?: string;
  path?: string;
  startUrl?: string;
  steps?: Step[];
  phase?: string;
  expected?: string;
  diary?: DiaryLine[];
  error?: string | null;
};

type AgentJob = {
  id: string;
  phase: string;
  projectId?: string;
  startUrl?: string;
  authProfileId?: string | null;
  pages?: AgentPageLink[];
  cases?: PlannedCase[];
  steps?: Step[];
  diary?: DiaryLine[];
  error?: string | null;
};

export async function consumeAgentQueue(
  redis: Redis,
  openBrowser: () => Promise<Browser>,
  stopping: () => boolean,
  repoRoot: string
): Promise<void> {
  const blocking = redis.duplicate();
  try {
    while (!stopping()) {
      const paused = redisWriteDelayMs();
      if (paused > 0) {
        await sleep(Math.min(paused, 5_000));
        continue;
      }
      let item: [string, string] | null;
      try {
        item = await blocking.brpop(AGENT_QUEUE, 5);
      } catch (error) {
        if (stopping()) break;
        if (isRedisOom(error)) {
          const waitMs = noteRedisOom();
          console.error(`event=redis_full action=agent_claim wait_ms=${waitMs}`);
          continue;
        }
        console.error("event=agent_claim_failed");
        await sleep(1000);
        continue;
      }
      if (!item) continue;
      const jobId = item[1];
      let job: AgentJob | null = null;
      try {
        job = await readJob(redis, jobId);
        if (job?.phase === "discovering") await discoverJob(redis, jobId, await openBrowser(), repoRoot);
        else await recordJob(redis, jobId, await openBrowser(), repoRoot);
      } catch (error) {
        if (isRedisOom(error)) {
          const waitMs = noteRedisOom();
          console.error(`event=redis_full action=agent_job job=${jobId} wait_ms=${waitMs}`);
          await rememberAgentFailure(redis, jobId, stopping);
          continue;
        }
        const detail = error instanceof Error ? error.message.split("\n")[0].slice(0, 180) : "Recording failed.";
        console.error(`event=agent_job_failed job=${jobId} phase=${job?.phase || ""} error=${detail}`);
        const message = error instanceof AuthProfileError
          ? error.message
          : job?.phase === "discovering"
            ? `Could not open the app to find a page. ${detail}`
            : detail;
        try {
          await writePhase(redis, jobId, "failed", message);
        } catch (writeError) {
          if (!isRedisOom(writeError)) throw writeError;
          const waitMs = noteRedisOom();
          console.error(`event=redis_full action=agent_job job=${jobId} wait_ms=${waitMs}`);
          await rememberAgentFailure(redis, jobId, stopping);
        }
      }
    }
  } finally {
    blocking.disconnect();
  }
}

async function discoverJob(redis: Redis, jobId: string, browser: Browser, repoRoot: string): Promise<void> {
  const job = await readJob(redis, jobId);
  if (!job || job.phase !== "discovering" || !job.startUrl) return;
  const context = await openContext(browser, repoRoot, job);
  try {
    const page = await context.newPage();
    await page.goto(job.startUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const pages = await discoverScreens(page, job.startUrl);
    await writePages(redis, jobId, pages);
  } finally {
    await context.close();
  }
}

async function discoverScreens(page: Page, startUrl: string): Promise<AgentPageLink[]> {
  const landing = await collectPages(page);
  const current = new URL(page.url()).pathname;
  const withControls = await attachControls(page, landing, current);
  const hops = landing.filter((item) => item.path.startsWith("/") && item.path.replace(/\/$/, "") !== current.replace(/\/$/, "")).slice(0, 6);
  for (const link of hops) {
    try {
      await page.goto(absoluteUrl(startUrl, link.path), { waitUntil: "domcontentloaded", timeout: 15_000 });
    } catch {
      continue;
    }
    const here = await collectPages(page);
    const openedPath = here[0]?.path || new URL(page.url()).pathname;
    const snapped = await attachControls(page, here, openedPath);
    const opened = snapped.find((item) => item.path === openedPath);
    if (!opened) continue;
    const existing = withControls.find((known) => known.path === opened.path);
    if (existing) existing.controls = opened.controls;
    else withControls.push({ name: opened.name, path: opened.path, controls: opened.controls });
  }
  return withControls.slice(0, 40);
}

async function attachControls(page: Page, pages: AgentPageLink[], path: string): Promise<AgentPageLink[]> {
  let controls: Control[] = [];
  try {
    controls = (await listControls(page))
      .filter((control) => !/password|token|secret/i.test(control.name))
      .slice(0, 12);
  } catch {
    controls = [];
  }
  return pages.map((item) => (item.path.replace(/\/$/, "") === path.replace(/\/$/, "") ? { ...item, controls } : item));
}

async function collectPages(page: Page): Promise<AgentPageLink[]> {
  // A string, not a function: tsx injects a Node-only __name helper into nested
  // functions, and that helper does not exist inside the page.
  return page.evaluate<AgentPageLink[]>(`(() => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim().slice(0, 80);
    const pathOf = (url) => {
      const path = String(url.pathname || "/") + String(url.search || "");
      return /token|password|secret/i.test(path) ? "" : path;
    };
    const currentPath = pathOf(new URL(location.href));
    const headingNode = document.querySelector("h1");
    const heading = clean((headingNode && headingNode.textContent) || document.title || "Home");
    const found = [];
    if (currentPath) found.push({ name: heading || "Home", path: currentPath, visible: true });
    const seen = new Set(found.map((item) => item.name + "|" + item.path));
    for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
      const name = clean(anchor.textContent || anchor.getAttribute("aria-label") || "");
      if (!name) continue;
      let url;
      try {
        url = new URL(anchor.href, location.href);
      } catch (error) {
        continue;
      }
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) continue;
      const path = pathOf(url);
      if (!path) continue;
      const key = name + "|" + path;
      if (seen.has(key)) continue;
      seen.add(key);
      const style = getComputedStyle(anchor);
      const box = anchor.getBoundingClientRect();
      const visible = style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
      found.push({ name, path, visible });
    }
    found.sort((left, right) => Number(right.visible) - Number(left.visible));
    return found.slice(0, 40).map((item) => ({ name: item.name, path: item.path }));
  })()`);
}

async function writePages(redis: Redis, jobId: string, pages: AgentPageLink[]): Promise<void> {
  const job = await readJob(redis, jobId);
  if (!job) return;
  const next = {
    ...job,
    pages,
    phase: pages.length ? "discovered" : "needs_choice",
    error: pages.length ? null : "No pages were found. Open the app and check that this environment reaches it.",
  };
  await redis.set(JOB_PREFIX + jobId, JSON.stringify(next), "EX", JOB_TTL_SECONDS);
}

async function recordJob(redis: Redis, jobId: string, browser: Browser, repoRoot: string): Promise<void> {
  const job = await readJob(redis, jobId);
  if (!job || job.phase !== "recording") return;
  if ((job.cases || []).length > 0) {
    await recordCases(redis, job, browser, repoRoot);
    return;
  }
  if (!job.startUrl) return;
  const context = await openContext(browser, repoRoot, job);
  const started = Date.now();
  const diary: DiaryLine[] = [];
  let lastKey = "";
  let repeats = 0;
  try {
    const page = await context.newPage();
    await page.goto(job.startUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    for (const step of (job.steps || []).slice(0, MAX_STEPS)) {
      if (Date.now() - started > MAX_MS) break;
      const key = `${step.action}:${step.target}`;
      repeats = key === lastKey ? repeats + 1 : 1;
      lastKey = key;
      if (repeats > 3) {
        await writePhase(redis, jobId, "failed", "The same step repeated.", diary);
        return;
      }
      if (/password|token|secret/i.test(step.target)) {
        await writePhase(redis, jobId, "failed", "Use an auth profile. The agent does not type passwords.", diary);
        return;
      }
      const resolved = openDiscoveredPage(step, job.pages || [], new URL(page.url()).pathname);
      if (resolved.action === "goto") {
        const destination = (resolved.value || resolved.target || "").trim();
        if (!destination.startsWith("/") && !/^https?:\/\//i.test(destination)) continue;
        await page.goto(absoluteUrl(job.startUrl, destination), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        diary.push({ action: "goto", role: "", name: "", value: "", url: page.url() });
        continue;
      }
      let controls = await listControls(page);
      let hit = pick(resolved, controls);
      if (!hit) {
        await revealLocator(page, page.getByText(resolved.target, { exact: false }));
        controls = await listControls(page);
        hit = pick(resolved, controls);
      }
      if (!hit) {
        await writePhase(redis, jobId, "needs_choice", `No single match for "${resolved.target}".`, diary);
        return;
      }
      const locator = page.getByRole(hit.role as "button", { name: hit.name, exact: true });
      if (resolved.action === "fill" || resolved.action === "press") {
        await locator.fill(resolved.value || "");
        if (resolved.action === "press") await locator.press("Enter");
      } else {
        await locator.click();
      }
      diary.push({ action: resolved.action, role: hit.role, name: hit.name, value: resolved.value || "", url: page.url() });
    }
    await writePhase(redis, jobId, "recorded", null, diary);
  } finally {
    await context.close();
  }
}

async function recordCases(redis: Redis, job: AgentJob, browser: Browser, repoRoot: string): Promise<void> {
  const cases = (job.cases || []).filter((item) => item.startUrl).slice(0, 10);
  let cursor = 0;
  const runNext = async (): Promise<void> => {
    const index = cursor;
    cursor += 1;
    if (index >= cases.length) return;
    await recordCase(redis, job, cases[index], browser, repoRoot);
    await runNext();
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, cases.length) }, () => runNext()));
  const latest = await readJob(redis, job.id);
  const recorded = (latest?.cases || []).some((item) => item.phase === "recorded");
  await writePhase(
    redis,
    job.id,
    recorded ? "recorded" : "failed",
    recorded ? null : "Every test case failed while recording."
  );
}

let caseWrites: Promise<void> = Promise.resolve();

async function recordCase(
  redis: Redis,
  job: AgentJob,
  planned: PlannedCase,
  browser: Browser,
  repoRoot: string
): Promise<void> {
  const scoped = { ...job, startUrl: planned.startUrl };
  const context = await openContext(browser, repoRoot, scoped);
  try {
    const page = await context.newPage();
    const outcome = await playSteps(page, planned.startUrl || "", planned.steps || [], job.pages || [], planned.expected || "");
    await updateCase(redis, job.id, planned.id, {
      phase: outcome.phase,
      error: outcome.error,
      diary: outcome.diary,
      expected: outcome.expected,
    });
  } catch (error) {
    if (isRedisOom(error)) throw error;
    const detail = error instanceof Error ? error.message.split("\n")[0].slice(0, 180) : "This test case could not be recorded.";
    const message = error instanceof AuthProfileError ? error.message : detail;
    await updateCase(redis, job.id, planned.id, { phase: "failed", error: message, diary: [] });
  } finally {
    await context.close();
  }
}

async function playSteps(
  page: Page,
  startUrl: string,
  steps: Step[],
  knownPages: AgentPageLink[] = [],
  plannedExpected = ""
): Promise<{ phase: string; error: string | null; diary: DiaryLine[]; expected: string }> {
  const started = Date.now();
  const diary: DiaryLine[] = [];
  let expected = plannedExpected;
  let seen = knownPages;
  let lastKey = "";
  let repeats = 0;
  const fail = (error: string) => ({ phase: "failed", error, diary, expected });
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  seen = mergePages(seen, await collectPages(page));
  for (const raw of steps.slice(0, MAX_STEPS)) {
    if (Date.now() - started > MAX_MS) break;
    let step = openDiscoveredPage(raw, seen, new URL(page.url()).pathname);
    const key = `${step.action}:${step.target}`;
    repeats = key === lastKey ? repeats + 1 : 1;
    lastKey = key;
    if (repeats > 3) return fail("The same step repeated.");
    if (/password|token|secret/i.test(step.target)) return fail("Use an auth profile. The agent does not type passwords.");
    if ((step.action === "fill" || step.action === "press") && (isPlaceholder(step.value) || !step.value.trim())) {
      const sample = await searchText(page, seen, knownPages);
      seen = sample.seen;
      if (!sample.name) return fail("Nothing on this page can be used as the search text.");
      step = { ...step, value: sample.name };
      expected = sample.name;
    }
    if (step.action === "goto") {
      const destination = (step.value || step.target || "").trim();
      if (!destination.startsWith("/") && !/^https?:\/\//i.test(destination)) continue;
      await page.goto(absoluteUrl(startUrl, destination), { waitUntil: "domcontentloaded", timeout: 20_000 });
      diary.push({ action: "goto", role: "", name: "", value: "", url: page.url() });
      seen = mergePages(seen, await collectPages(page));
      continue;
    }
    let controls = await listControls(page);
    let bound = bindControl(step, controls);
    if (bound.error) {
      await revealLocator(page, page.getByText(step.target, { exact: false }));
      controls = await listControls(page);
      seen = mergePages(seen, await collectPages(page));
      bound = bindControl(step, controls);
    }
    if (bound.error) return fail(bound.error);
    step = bound.step;
    const locator = page.getByRole((bound.role || "button") as "button", { name: step.target, exact: true });
    if (step.action === "fill" || step.action === "press") {
      await locator.fill(step.value || "");
      if (step.action === "press" || /search/i.test(step.target)) await locator.press("Enter");
    } else {
      await locator.click();
    }
    diary.push({ action: step.action, role: bound.role, name: step.target, value: step.value || "", url: page.url() });
    seen = mergePages(seen, await collectPages(page));
  }
  if (!expected || !(await textIsVisible(page, expected))) {
    const sampled = await searchText(page, seen, knownPages);
    seen = sampled.seen;
    const sample = sampled.name;
    if (sample && (await textIsVisible(page, sample))) expected = sample;
    else if (expected) return fail(`"${expected}" is not on the page.`);
    else return fail("No result was visible on the page.");
  }
  return { phase: "recorded", error: null, diary, expected };
}

async function updateCase(
  redis: Redis,
  jobId: string,
  caseId: string,
  patch: { phase: string; error: string | null; diary: DiaryLine[]; expected?: string }
): Promise<void> {
  const run = caseWrites.then(async () => {
    const job = await readJob(redis, jobId);
    if (!job) return;
    const cases = (job.cases || []).map((item) => (item.id === caseId ? { ...item, ...patch } : item));
    await redis.set(JOB_PREFIX + jobId, JSON.stringify({ ...job, cases }), "EX", JOB_TTL_SECONDS);
  });
  caseWrites = run.then(() => undefined, () => undefined);
  await run;
}

async function openContext(browser: Browser, repoRoot: string, job: AgentJob): Promise<BrowserContext> {
  const profileId = (job.authProfileId || "").trim();
  if (!profileId || !job.projectId || !job.startUrl) return browser.newContext();
  const profile = await loadAuthProfile(repoRoot, job.projectId, profileId);
  const session = await ensureAuthenticatedSession(browser, profile, job.startUrl, () => undefined);
  return browser.newContext({ storageState: session.state as never });
}

async function listControls(page: Page): Promise<Control[]> {
  // Read the DOM in one pass. Locator getAttribute waits until timeout when a
  // control is replaced while the page is still loading.
  const snapshot = page.evaluate<Control[]>(`(() => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim().slice(0, 80);
    const roleOf = (el) => {
      const raw = el.getAttribute("role") || el.tagName.toLowerCase();
      if (raw === "a") return "link";
      if (raw === "button") return "button";
      if (raw === "textarea" || raw === "input") return "textbox";
      return raw;
    };
    const labelFor = (el) => {
      const id = el.getAttribute("id");
      if (!id || typeof CSS === "undefined" || !CSS.escape) return "";
      const label = document.querySelector('label[for="' + CSS.escape(id) + '"]');
      return label ? label.textContent : "";
    };
    const nodes = document.querySelectorAll("a, button, input, textarea, select, [role='button'], [role='link'], [role='tab'], [role='textbox']");
    const found = [];
    for (const el of Array.from(nodes).slice(0, 80)) {
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "hidden" || type === "password") continue;
      const name = clean(el.getAttribute("aria-label") || labelFor(el) || el.getAttribute("placeholder") || el.innerText || "");
      if (!name || /password|token|secret/i.test(name)) continue;
      let path = "";
      if (el.tagName.toLowerCase() === "a" && el.href) {
        try {
          const url = new URL(el.href, location.href);
          path = url.origin === location.origin ? String(url.pathname || "/") + String(url.search || "") : "";
        } catch (error) {
          path = "";
        }
      }
      found.push({ role: roleOf(el), name, path });
    }
    return found;
  })()`);
  const timedOut = new Promise<Control[]>((_, reject) => {
    setTimeout(() => reject(new Error("Reading controls timed out.")), 8_000);
  });
  return Promise.race([snapshot, timedOut]);
}

export function absoluteUrl(startUrl: string, target: string): string {
  const value = (target || "").trim();
  if (!value) return startUrl;
  if (/^https?:\/\//i.test(value)) return value;
  const origin = new URL(startUrl).origin;
  return value.startsWith("/") ? `${origin}${value}` : new URL(value, startUrl).toString();
}

const PLACEHOLDER_VALUES = new Set([
  "word",
  "a word",
  "item",
  "an item",
  "item name",
  "the item name",
  "something",
  "text",
  "name",
  "result",
  "a result",
  "the result",
]);

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_VALUES.has(value.trim().toLowerCase().replace(/\s+/g, " "));
}

async function searchText(
  page: Page,
  seen: AgentPageLink[],
  knownPages: AgentPageLink[]
): Promise<{ name: string; seen: AgentPageLink[] }> {
  await settle(page);
  const pages = mergePages(seen, await collectPages(page));
  const titles = await visibleTitles(page);
  return { name: contentName(pages, knownPages, new URL(page.url()).pathname, titles), seen: pages };
}

async function settle(page: Page): Promise<void> {
  try {
    await page.waitForLoadState("networkidle", { timeout: 5_000 });
  } catch {
    // The item list can still be read when the page never goes idle.
  }
}

async function visibleTitles(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(`(() => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim().slice(0, 80);
    const root = document.querySelector("main") || document.body;
    const found = [];
    const seen = new Set();
    const nodes = root.querySelectorAll("a, h2, h3, [role='row'], [role='listitem']");
    for (const node of Array.from(nodes).slice(0, 80)) {
      const name = clean(node.innerText || node.getAttribute("aria-label") || "");
      const key = name.toLowerCase();
      if (name.length < 2 || name.length > 60 || seen.has(key)) continue;
      seen.add(key);
      found.push(name);
    }
    return found.slice(0, 20);
  })()`);
}

export function contentName(pages: AgentPageLink[], known: AgentPageLink[], currentPath: string, titles: string[] = []): string {
  const knownPaths = new Set(known.map((page) => page.path.replace(/\/$/, "") || "/"));
  const knownNames = new Set(known.map((page) => page.name.trim().toLowerCase()));
  const current = currentPath.replace(/\/$/, "") || "/";
  for (const page of pages) {
    const path = page.path.replace(/\/$/, "") || "/";
    const name = page.name.trim();
    if (name.length < 2 || name.length > 60 || path === current) continue;
    if (path.startsWith(`${current}/`)) return name;
  }
  for (const title of titles) {
    const name = title.trim();
    if (name.length < 2 || name.length > 60 || knownNames.has(name.toLowerCase())) continue;
    return name;
  }
  for (const page of pages) {
    const path = page.path.replace(/\/$/, "") || "/";
    const name = page.name.trim();
    if (name.length < 2 || name.length > 60 || path === current || knownPaths.has(path)) continue;
    return name;
  }
  return "";
}

export function bindControl(step: Step, controls: Control[]): { step: Step; role: string; error: string } {
  if (step.action === "goto") return { step, role: "", error: "" };
  const hit = pick(step, controls);
  if (hit) return { step: { ...step, target: hit.name }, role: hit.role, error: "" };
  if (step.action === "fill" || step.action === "press") {
    const fields = controls.filter((item) => item.role === "textbox");
    if (fields.length === 1) return { step: { ...step, target: fields[0].name }, role: "textbox", error: "" };
    const names = fields.map((item) => item.name).slice(0, 8).join(", ");
    return { step, role: "", error: names ? `No field named "${step.target}". Fields: ${names}.` : `No field named "${step.target}".` };
  }
  const names = controls.map((item) => item.name).slice(0, 8).join(", ");
  return { step, role: "", error: `No control named "${step.target}". On this page: ${names || "none"}.` };
}

function mergePages(current: AgentPageLink[], extra: AgentPageLink[]): AgentPageLink[] {
  const seen = new Set(current.map((page) => `${page.name}|${page.path}`));
  const next = [...current];
  for (const page of extra) {
    const key = `${page.name}|${page.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(page);
  }
  return next.slice(0, 40);
}

async function textIsVisible(page: Page, text: string): Promise<boolean> {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 4_000 });
    return true;
  } catch {
    return false;
  }
}

export function openDiscoveredPage(step: Step, pages: AgentPageLink[], currentPath = ""): Step {
  if (step.action !== "click") return step;
  const wanted = step.target.trim().toLowerCase().replace(/\s+/g, " ");
  if (wanted.length < 3) return step;
  const here = currentPath.replace(/\/$/, "");
  const linked = pages
    .filter((page) => !here || page.path.replace(/\/$/, "") === here)
    .flatMap((page) => page.controls || [])
    .filter((control) => (control.role === "link" || control.role === "tab") && control.path && control.name.trim().toLowerCase().replace(/\s+/g, " ") === wanted)
    .map((control) => control.path || "");
  const linkPaths = [...new Set(linked)];
  if (linkPaths.length === 1) return { action: "goto", target: linkPaths[0], value: linkPaths[0] };
  const named = pages.filter((page) => page.path.startsWith("/"));
  const exact = named.filter((page) => page.name.trim().toLowerCase().replace(/\s+/g, " ") === wanted);
  const partial = named.filter((page) => {
    const name = page.name.trim().toLowerCase().replace(/\s+/g, " ");
    return name.length >= 3 && (name.includes(wanted) || wanted.includes(name));
  });
  const paths = [...new Set((exact.length > 0 ? exact : partial).map((page) => page.path))];
  if (paths.length !== 1) return step;
  return { action: "goto", target: paths[0], value: paths[0] };
}

export function pick(step: Step, controls: Control[]): Control | null {
  const wanted = step.target.trim().toLowerCase();
  const exact = controls.filter((item) => item.name.trim().toLowerCase() === wanted);
  if (exact.length === 1) return exact[0];
  const partial = controls.filter((item) => item.name.toLowerCase().includes(wanted));
  return partial.length === 1 ? partial[0] : null;
}

async function rememberAgentFailure(redis: Redis, jobId: string, stopping: () => boolean): Promise<void> {
  while (!stopping()) {
    const paused = redisWriteDelayMs();
    if (paused > 0) {
      await sleep(Math.min(paused, 5_000));
      continue;
    }
    try {
      await writePhase(redis, jobId, "failed", REDIS_FULL_MESSAGE);
      return;
    } catch (error) {
      if (!isRedisOom(error)) {
        console.error(`event=agent_job_failed job=${jobId}`);
        return;
      }
      const waitMs = noteRedisOom();
      console.error(`event=redis_full action=agent_job job=${jobId} wait_ms=${waitMs}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJob(redis: Redis, jobId: string): Promise<AgentJob | null> {
  const raw = await redis.get(JOB_PREFIX + jobId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgentJob;
  } catch {
    console.error(`event=agent_job_unreadable job=${jobId}`);
    return null;
  }
}

async function writePhase(
  redis: Redis,
  jobId: string,
  phase: string,
  error: string | null,
  diary?: DiaryLine[]
): Promise<void> {
  const job = await readJob(redis, jobId);
  if (!job) return;
  const next = { ...job, phase, error, diary: diary ?? job.diary ?? [] };
  await redis.set(JOB_PREFIX + jobId, JSON.stringify(next), "EX", JOB_TTL_SECONDS);
}
