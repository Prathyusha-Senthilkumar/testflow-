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

type Control = { role: string; name: string };
type Step = { action: string; target: string; value: string };
type DiaryLine = { action: string; role: string; name: string; value: string; url: string };

type AgentPageLink = { name: string; path: string };

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
    const pages = await collectPages(page);
    await writePages(redis, jobId, pages);
  } finally {
    await context.close();
  }
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
      if (step.action === "goto") {
        const destination = (step.value || step.target || "").trim();
        if (!destination.startsWith("/") && !/^https?:\/\//i.test(destination)) continue;
        await page.goto(absoluteUrl(job.startUrl, destination), {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
        diary.push({ action: "goto", role: "", name: "", value: "", url: page.url() });
        continue;
      }
      let controls = await listControls(page);
      let hit = pick(step, controls);
      if (!hit) {
        await revealLocator(page, page.getByText(step.target, { exact: false }));
        controls = await listControls(page);
        hit = pick(step, controls);
      }
      if (!hit) {
        await writePhase(redis, jobId, "needs_choice", `No single match for "${step.target}".`, diary);
        return;
      }
      const locator = page.getByRole(hit.role as "button", { name: hit.name, exact: true });
      if (step.action === "fill" || step.action === "press") {
        await locator.fill(step.value || "");
        if (step.action === "press") await locator.press("Enter");
      } else {
        await locator.click();
      }
      diary.push({ action: step.action, role: hit.role, name: hit.name, value: step.value || "", url: page.url() });
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
    const outcome = await playSteps(page, planned.startUrl || "", planned.steps || []);
    await updateCase(redis, job.id, planned.id, {
      phase: outcome.phase,
      error: outcome.error,
      diary: outcome.diary,
    });
  } catch (error) {
    if (isRedisOom(error)) throw error;
    const message = error instanceof AuthProfileError
      ? error.message
      : "This test case could not be recorded.";
    await updateCase(redis, job.id, planned.id, { phase: "failed", error: message, diary: [] });
  } finally {
    await context.close();
  }
}

async function playSteps(
  page: Page,
  startUrl: string,
  steps: Step[]
): Promise<{ phase: string; error: string | null; diary: DiaryLine[] }> {
  const started = Date.now();
  const diary: DiaryLine[] = [];
  let lastKey = "";
  let repeats = 0;
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  for (const step of steps.slice(0, MAX_STEPS)) {
    if (Date.now() - started > MAX_MS) break;
    const key = `${step.action}:${step.target}`;
    repeats = key === lastKey ? repeats + 1 : 1;
    lastKey = key;
    if (repeats > 3) return { phase: "failed", error: "The same step repeated.", diary };
    if (/password|token|secret/i.test(step.target)) {
      return { phase: "failed", error: "Use an auth profile. The agent does not type passwords.", diary };
    }
    if (step.action === "goto") {
      const destination = (step.value || step.target || "").trim();
      if (!destination.startsWith("/") && !/^https?:\/\//i.test(destination)) continue;
      await page.goto(absoluteUrl(startUrl, destination), { waitUntil: "domcontentloaded", timeout: 20_000 });
      diary.push({ action: "goto", role: "", name: "", value: "", url: page.url() });
      continue;
    }
    let controls = await listControls(page);
    let hit = pick(step, controls);
    if (!hit) {
      await revealLocator(page, page.getByText(step.target, { exact: false }));
      controls = await listControls(page);
      hit = pick(step, controls);
    }
    if (!hit) return { phase: "failed", error: `No single match for "${step.target}".`, diary };
    const locator = page.getByRole(hit.role as "button", { name: hit.name, exact: true });
    if (step.action === "fill" || step.action === "press") {
      await locator.fill(step.value || "");
      if (step.action === "press") await locator.press("Enter");
    } else {
      await locator.click();
    }
    diary.push({ action: step.action, role: hit.role, name: hit.name, value: step.value || "", url: page.url() });
  }
  return { phase: "recorded", error: null, diary };
}

async function updateCase(
  redis: Redis,
  jobId: string,
  caseId: string,
  patch: { phase: string; error: string | null; diary: DiaryLine[] }
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
  const nodes = await page.locator("a, button, input, textarea, select, [role='button'], [role='link'], [role='textbox']").all();
  const found: Control[] = [];
  for (const node of nodes.slice(0, 80)) {
    const role = (await node.getAttribute("role")) || (await node.evaluate((el) => el.tagName.toLowerCase()));
    const name = ((await node.getAttribute("aria-label")) || (await node.innerText().catch(() => "")) || "").trim();
    if (!name) continue;
    found.push({ role: roleName(role), name: name.slice(0, 80) });
  }
  return found;
}

function roleName(tagOrRole: string): string {
  if (tagOrRole === "a") return "link";
  if (tagOrRole === "button") return "button";
  if (tagOrRole === "textarea" || tagOrRole === "input") return "textbox";
  return tagOrRole;
}

export function absoluteUrl(startUrl: string, target: string): string {
  const value = (target || "").trim();
  if (!value) return startUrl;
  if (/^https?:\/\//i.test(value)) return value;
  const origin = new URL(startUrl).origin;
  return value.startsWith("/") ? `${origin}${value}` : new URL(value, startUrl).toString();
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
