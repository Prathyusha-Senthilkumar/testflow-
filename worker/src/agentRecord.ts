import type { Browser, BrowserContext, Page } from "playwright";
import type { Redis } from "ioredis";
import { AuthProfileError, ensureAuthenticatedSession, loadAuthProfile } from "./authProfiles.js";
import { revealLocator } from "./reveal.js";

const JOB_PREFIX = "testflow:agent:job:";
export const AGENT_QUEUE = "testflow:agent:queue";
const JOB_TTL_SECONDS = 60 * 60 * 48;
const MAX_STEPS = 40;
const MAX_MS = 60_000;

type Control = { role: string; name: string };
type Step = { action: string; target: string; value: string };
type DiaryLine = { action: string; role: string; name: string; value: string; url: string };

type AgentJob = {
  id: string;
  phase: string;
  projectId?: string;
  startUrl?: string;
  authProfileId?: string | null;
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
      const item = await blocking.brpop(AGENT_QUEUE, 5);
      if (!item) continue;
      const jobId = item[1];
      try {
        await recordJob(redis, jobId, await openBrowser(), repoRoot);
      } catch (error) {
        const message = error instanceof AuthProfileError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Recording failed.";
        await writePhase(redis, jobId, "failed", message);
      }
    }
  } finally {
    blocking.disconnect();
  }
}

async function recordJob(redis: Redis, jobId: string, browser: Browser, repoRoot: string): Promise<void> {
  const job = await readJob(redis, jobId);
  if (!job || job.phase !== "recording" || !job.startUrl) return;
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

async function readJob(redis: Redis, jobId: string): Promise<AgentJob | null> {
  const raw = await redis.get(JOB_PREFIX + jobId);
  if (!raw) return null;
  return JSON.parse(raw) as AgentJob;
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
