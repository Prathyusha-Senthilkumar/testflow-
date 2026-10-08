import { readFileSync } from "node:fs";
import os from "node:os";
import type { Redis } from "ioredis";
import type { BrowserStatus, WarmStatus } from "./browserPool.js";

// Worker registry read by backend/app/repositories/worker_status_repository.py (GET /api/workers).
export const WORKER_KEY_PREFIX = "testflow:worker:";
export const WORKERS_SET_KEY = "testflow:workers";
/** id -> last heartbeat (epoch ms). Lets the API tell how long a vanished worker has been gone. */
export const WORKERS_SEEN_KEY = "testflow:workers:seen";

export type SlotJob = {
  jobId: string;
  runId?: string | null;
  testCaseId?: string | null;
  projectId?: string | null;
  testName?: string | null;
};

export type Slot = {
  index: number;
  state: "idle" | "running";
  jobId?: string;
  runId?: string;
  testCaseId?: string;
  projectId?: string;
  testName?: string;
  startedAt?: string;
};

/**
 * Busy/idle bookkeeping for the execution slots of one worker process. Only ids and the test
 * name are kept: never the job payload, script body, environment URL or auth data.
 */
export class SlotTracker {
  private readonly slots: Slot[];
  processedTotal = 0;
  failedTotal = 0;

  constructor(readonly concurrency: number) {
    this.slots = Array.from({ length: concurrency }, (_, index) => ({ index, state: "idle" as const }));
  }

  start(index: number, job: SlotJob, now = new Date()): void {
    const slot: Slot = { index, state: "running", jobId: job.jobId, startedAt: now.toISOString() };
    if (job.runId) slot.runId = String(job.runId);
    if (job.testCaseId) slot.testCaseId = String(job.testCaseId);
    if (job.projectId) slot.projectId = String(job.projectId);
    if (job.testName) slot.testName = String(job.testName).slice(0, 200);
    this.slots[this.check(index)] = slot;
  }

  /** outcome: counted runs only. "released" (handed back on shutdown) frees the slot without counting. */
  finish(index: number, outcome: "passed" | "failed" | "released" | "skipped"): void {
    this.slots[this.check(index)] = { index, state: "idle" };
    if (outcome === "passed" || outcome === "failed") this.processedTotal += 1;
    if (outcome === "failed") this.failedTotal += 1;
  }

  get busy(): number {
    return this.slots.filter((slot) => slot.state === "running").length;
  }

  snapshot(): Slot[] {
    return this.slots.map((slot) => ({ ...slot }));
  }

  private check(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= this.concurrency) {
      throw new RangeError(`Slot ${index} is outside 0..${this.concurrency - 1}`);
    }
    return index;
  }
}

export type ProcessStats = { rssMb: number; heapUsedMb: number; uptimeSec: number; loadAvg1: number; cpuCount: number };

export type WorkerHeartbeat = {
  id: string;
  hostname: string;
  pid: number;
  version: string;
  startedAt: string;
  lastHeartbeatAt: string;
  status: "online" | "draining";
  concurrency: number;
  busy: number;
  idle: number;
  slots: Slot[];
  browser: BrowserStatus;
  warm: WarmStatus;
  process: ProcessStats;
  processedTotal: number;
  failedTotal: number;
};

export type HeartbeatInput = {
  id: string;
  hostname: string;
  pid: number;
  version: string;
  startedAt: Date;
  status: "online" | "draining";
  slots: SlotTracker;
  browser: BrowserStatus;
  warm: WarmStatus;
  process: ProcessStats;
  now?: Date;
};

/** The JSON document stored at testflow:worker:<id>. Built from an explicit allow-list of fields. */
export function buildHeartbeat(input: HeartbeatInput): WorkerHeartbeat {
  const busy = input.slots.busy;
  return {
    id: input.id,
    hostname: input.hostname,
    pid: input.pid,
    version: input.version,
    startedAt: input.startedAt.toISOString(),
    lastHeartbeatAt: (input.now ?? new Date()).toISOString(),
    status: input.status,
    concurrency: input.slots.concurrency,
    busy,
    idle: input.slots.concurrency - busy,
    slots: input.slots.snapshot(),
    browser: { connected: input.browser.connected, version: input.browser.version, contexts: input.browser.contexts },
    warm: { ...input.warm },
    process: { ...input.process },
    processedTotal: input.slots.processedTotal,
    failedTotal: input.slots.failedTotal,
  };
}

export function processStats(): ProcessStats {
  const memory = process.memoryUsage();
  return {
    rssMb: round(memory.rss / 1024 / 1024),
    heapUsedMb: round(memory.heapUsed / 1024 / 1024),
    uptimeSec: Math.round(process.uptime()),
    loadAvg1: round(os.loadavg()[0]),
    cpuCount: os.cpus().length,
  };
}

/** Package version, plus "+<sha>" when GIT_SHA is set at build/deploy time. */
export function workerVersion(gitSha = process.env.GIT_SHA): string {
  let version = "unknown";
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
    version = pkg.version || "unknown";
  } catch {
    version = "unknown";
  }
  const sha = (gitSha || "").trim().slice(0, 12);
  return sha ? `${version}+${sha}` : version;
}

/** TTL is three heartbeat intervals, so one or two missed beats do not drop the worker. */
export function heartbeatTtlSeconds(intervalMs: number): number {
  return Math.max(3, Math.ceil((intervalMs * 3) / 1000));
}

/** One MULTI round trip on the shared (non-blocking) connection. */
export async function publishHeartbeat(redis: Redis, heartbeat: WorkerHeartbeat, intervalMs: number): Promise<void> {
  await redis
    .multi()
    .set(WORKER_KEY_PREFIX + heartbeat.id, JSON.stringify(heartbeat), "EX", heartbeatTtlSeconds(intervalMs))
    .sadd(WORKERS_SET_KEY, heartbeat.id)
    .hset(WORKERS_SEEN_KEY, heartbeat.id, String(Date.parse(heartbeat.lastHeartbeatAt)))
    .exec();
}

export async function removeHeartbeat(redis: Redis, workerId: string): Promise<void> {
  await redis
    .multi()
    .del(WORKER_KEY_PREFIX + workerId)
    .srem(WORKERS_SET_KEY, workerId)
    .hdel(WORKERS_SEEN_KEY, workerId)
    .exec();
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
