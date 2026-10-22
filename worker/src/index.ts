import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { Redis } from "ioredis";
import { chromium } from "playwright";
import { BrowserPool, processTreeRssMb } from "./browserPool.js";
import {
  ORPHAN_FAILED_MESSAGE,
  QUEUE_KEY,
  ack,
  claimJob,
  claimNext,
  dropLease,
  finishJob,
  heartbeat,
  processingKey,
  promoteScheduled,
  readJob,
  type JobPayload,
  reapOrphans,
  release,
} from "./jobStore.js";
import { markCancelled, markFinished, markRequeued, markRunning, noteRedisFull } from "./runs.js";
import {
  REDIS_FULL_MESSAGE,
  isRedisOom,
  leaseTtlSeconds,
  noteRedisOom,
  redisReapPaused,
  redisWriteDelayMs,
  redisWritesPaused,
  setRedisFullHandler,
} from "./redisOom.js";
import { runRecordedTest, type RunOutcome } from "./runTest.js";
import {
  SlotTracker,
  buildHeartbeat,
  processStats,
  publishHeartbeat,
  removeHeartbeat,
  workerVersion,
} from "./workerStatus.js";

const REPO_ROOT = process.env.TESTFLOW_ROOT || "/app";
const intEnv = (name: string, fallback: number, min = 1) =>
  Math.max(min, Number.parseInt(process.env[name] || "", 10) || fallback);
const WORKER_CONCURRENCY = intEnv("WORKER_CONCURRENCY", 3);
const TEST_TIMEOUT_MS = intEnv("TEST_TIMEOUT_MS", 5 * 60 * 1000, 1000);
const STEP_TIMEOUT_MS = intEnv("STEP_TIMEOUT_MS", 30 * 1000, 500);
const LEASE_SECONDS = intEnv("JOB_LEASE_SECONDS", 60, 10);
const SHUTDOWN_GRACE_MS = intEnv("SHUTDOWN_GRACE_MS", 45 * 1000, 0);
const REAPER_INTERVAL_MS = intEnv("REAPER_INTERVAL_MS", 30 * 1000, 1000);
const STATUS_INTERVAL_MS = intEnv("WORKER_STATUS_INTERVAL_MS", 5 * 1000, 1000);
// Spare blank contexts kept warm for jobs without an Auth Profile (0..concurrency).
const WARM_CONTEXTS = Math.min(WORKER_CONCURRENCY, countEnv("WARM_CONTEXTS", 1));
const BROWSER_RECYCLE_AFTER_TESTS = intEnv("BROWSER_RECYCLE_AFTER_TESTS", 200);
const BROWSER_RECYCLE_RSS_MB = intEnv("BROWSER_RECYCLE_RSS_MB", 1500, 100);
const KEEPALIVE_INTERVAL_MS = 30 * 1000;

// Unique per process; the processing list and lease key are named after it.
const WORKER_ID = `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379/0", {
  // A maxmemory reply is not a dropped connection. Returning 2 would resend the rejected write.
  // Connection blips still use ioredis' default retryStrategy and maxRetriesPerRequest.
  reconnectOnError(error) {
    if (isRedisOom(error)) return false;
    return false;
  },
});
let stopping = false;
const shutdown = new AbortController();
const inFlight = new Map<string, Promise<void>>();
const STARTED_AT = new Date();
const VERSION = workerVersion();
const slots = new SlotTracker(WORKER_CONCURRENCY);
const pool = new BrowserPool({
  launch: () => chromium.launch({ headless: true }),
  warmContexts: WARM_CONTEXTS,
  recycleAfterTests: BROWSER_RECYCLE_AFTER_TESTS,
  recycleRssMb: BROWSER_RECYCLE_RSS_MB,
  rssMb: processTreeRssMb,
});
// Set while the browser is recycled: consumers stop claiming until it is warm again.
let pausedForRecycle = false;
let recyclePending: Promise<void> | null = null;
let statusStopped = false;
let statusWrite: Promise<void> = Promise.resolve();

async function consume(slotIndex: number): Promise<void> {
  const consumerNumber = slotIndex + 1;
  // Each consumer has its own blocking connection; sharing one would serialize BLMOVE calls.
  const blocking = redis.duplicate();
  console.log(`event=consumer_ready worker=${WORKER_ID} consumer=${consumerNumber}`);
  try {
    while (!stopping) {
      if (pausedForRecycle) {
        await sleep(200);
        continue;
      }
      const paused = redisWriteDelayMs();
      if (paused > 0) {
        await sleep(Math.min(paused, 5_000));
        continue;
      }
      let jobId: string | null = null;
      try {
        jobId = await claimNext(blocking, WORKER_ID, 5);
      } catch (error) {
        if (stopping) break;
        if (pauseAfterRedisOom(error, "claim") !== null) continue;
        console.error(`event=claim_failed error=${publicError(error)}`);
        await sleep(1000);
        continue;
      }
      if (!jobId) continue;
      if (stopping) {
        await releaseQuietly(jobId);
        break;
      }
      const task = runOne(jobId, slotIndex)
        .catch((error) => {
          if (error instanceof WorkerStopping || stopping) return;
          console.error(`event=job_failed job=${jobId} error=${publicError(error)}`);
        })
        .finally(() => inFlight.delete(jobId));
      inFlight.set(jobId, task);
      await task;
    }
  } finally {
    blocking.disconnect();
  }
}

async function runOne(jobId: string, slotIndex: number): Promise<void> {
  const claimed = await redisWrite("claim_job", () => claimJob(redis, jobId, WORKER_ID));
  if (!claimed.applied) {
    // Missing, cancelled or already finished: nothing to run.
    if (!claimed.current || claimed.current.state === "cancelled") await markCancelled(jobId);
    await redisWrite("ack", () => ack(redis, WORKER_ID, jobId));
    return;
  }
  const payload = claimed.current!;
  const runKey = typeof payload.runId === "string" && payload.runId ? payload.runId : jobId;
  slots.start(slotIndex, {
    jobId,
    // test_runs rows are linked by job_id; the job id doubles as the run id the UI links to.
    runId: runKey,
    testCaseId: stringOrNull(payload.testCaseId),
    projectId: stringOrNull(payload.projectId),
    testName: stringOrNull(payload.testCaseName) || stringOrNull(payload.testCaseCode),
  });
  let outcome: "passed" | "failed" | "released" | "skipped" = "skipped";
  try {
    outcome = await execute(jobId, payload, slotIndex, runKey);
  } finally {
    slots.finish(slotIndex, outcome);
    if (pool.needsRecycle()) void recycleWhenIdle("threshold");
  }
}

async function execute(
  jobId: string,
  payload: JobPayload,
  slotIndex: number,
  runKey: string
): Promise<"passed" | "failed" | "released" | "skipped"> {
  await markRunning(jobId);
  let result: RunOutcome;
  try {
    result = await runRecordedTest(REPO_ROOT, payload.configPath, {
      browser: await pool.getBrowser(),
      newContext: async (options) => (await pool.acquireContext(options)).context,
      isCancelled: async () => {
        try {
          return (await readJob(redis, jobId))?.state === "cancelled";
        } catch (error) {
          if (pauseAfterRedisOom(error, "read_job") !== null) return false;
          throw error;
        }
      },
      environmentBaseUrl: payload.environmentBaseUrl,
      runId: runKey,
      testTimeoutMs: TEST_TIMEOUT_MS,
      stepTimeoutMs: STEP_TIMEOUT_MS,
      signal: shutdown.signal,
      onStep: (step) => slots.progress(slotIndex, step),
    });
  } catch (error) {
    if (isRedisOom(error)) pauseAfterRedisOom(error, "test");
    const message = (isRedisOom(error) ? REDIS_FULL_MESSAGE : errorText(error)).slice(0, 3000);
    result = {
      success: false,
      status: "Fail",
      pytest_return_code: 1,
      config_path: payload.configPath,
      title: null,
      test_file_location: null,
      test_case_location: null,
      validation_errors: null,
      error_message: message,
      duration_ms: 0,
      screenshot_path: null,
      screenshot_error: null,
    };
  }

  let handBack = false;
  try {
    handBack = Boolean(stopping && result.cancelled && (await readJob(redis, jobId))?.state === "running");
  } catch (error) {
    if (pauseAfterRedisOom(error, "read_job") === null) throw error;
  }
  if (handBack) {
    // Interrupted by shutdown, not by the tester: hand it back for another worker.
    // One attempt. A full Redis must not turn shutdown into a requeue loop.
    if (await releaseQuietly(jobId)) await markRequeued(jobId);
    console.log(`event=job_released job=${jobId}`);
    return "released";
  }
  if (result.screenshot_error) console.error(`event=screenshot_failed job=${jobId}`);

  const state = result.success ? "completed" : "failed";
  const finished = await redisWrite("finish_job", () =>
    finishJob(redis, jobId, WORKER_ID, state, {
      result,
      error: result.success ? null : result.error_message,
    })
  );
  if (!finished.applied) {
    // Cancelled (or reaped) while running: the cancel wins, never overwrite it with a result.
    if (finished.current?.state === "cancelled") await markCancelled(jobId);
    console.log(`event=job_result_discarded job=${jobId} state=${finished.current?.state || "missing"}`);
    await redisWrite("ack", () => ack(redis, WORKER_ID, jobId));
    return "skipped";
  } else {
    await markFinished(jobId, result.success ? "Passed" : "Failed", {
      duration_ms: result.duration_ms,
      error_message: result.success ? null : result.error_message,
      screenshot_path: result.screenshot_path,
    });
    console.log(`event=job_${state} job=${jobId} duration_ms=${result.duration_ms}`);
  }
  await redisWrite("ack", () => ack(redis, WORKER_ID, jobId));
  return result.success ? "passed" : "failed";
}

/** Drain (stop claiming, let running slots finish), recycle Chromium, resume. */
function recycleWhenIdle(reason: string): Promise<void> {
  if (recyclePending || stopping) return recyclePending || Promise.resolve();
  recyclePending = (async () => {
    pausedForRecycle = true;
    try {
      while (!stopping && (slots.busy > 0 || inFlight.size > 0)) await sleep(200);
      if (stopping) return;
      await pool.recycle(reason);
      console.log(`event=browser_recycled worker=${WORKER_ID}`);
    } catch (error) {
      console.error(`event=browser_recycle_failed error=${errorText(error)}`);
    } finally {
      pausedForRecycle = false;
      recyclePending = null;
    }
  })();
  return recyclePending;
}

async function keepWarm(): Promise<void> {
  if (pausedForRecycle) return;
  await pool.healthCheck();
  if (pool.needsRecycle()) void recycleWhenIdle("keepalive");
}

async function publishStatus(status: "online" | "draining"): Promise<void> {
  const heartbeat = buildHeartbeat({
    id: WORKER_ID,
    hostname: hostname(),
    pid: process.pid,
    version: VERSION,
    startedAt: STARTED_AT,
    status,
    slots,
    browser: pool.browserStatus(),
    warm: pool.warmStatus(),
    process: processStats(),
  });
  await publishHeartbeat(redis, heartbeat, STATUS_INTERVAL_MS);
}

/** Runs until shutdown finishes (not just until it starts), so draining workers stay visible. */
async function statusLoop(): Promise<void> {
  while (!statusStopped) {
    const paused = redisWriteDelayMs();
    if (paused > 0) {
      await sleep(Math.min(paused, STATUS_INTERVAL_MS));
      continue;
    }
    try {
      statusWrite = publishStatus(stopping ? "draining" : "online");
      await statusWrite;
    } catch (error) {
      if (pauseAfterRedisOom(error, "worker_status") === null) {
        console.error(`event=worker_status_failed error=${publicError(error)}`);
      }
    }
    await sleep(STATUS_INTERVAL_MS);
  }
}

/** Launch and warm Chromium before taking work. Retries so a broken browser shows up as not ready. */
async function warmUp(): Promise<void> {
  const started = Date.now();
  while (!stopping) {
    try {
      await pool.start();
      console.log(
        `event=worker_ready worker=${WORKER_ID} warm_ms=${Date.now() - started} spare_contexts=${pool.warmStatus().spareContexts}`
      );
      return;
    } catch (error) {
      console.error(`event=browser_warmup_failed error=${errorText(error)}`);
      await sleep(5000);
    }
  }
}

async function every(intervalMs: number, task: () => Promise<void>): Promise<void> {
  while (!stopping) {
    try {
      await task();
    } catch (error) {
      console.error(`event=background_task_failed error=${publicError(error)}`);
    }
    await sleep(intervalMs);
  }
}

async function leaseLoop(): Promise<void> {
  const interval = Math.max(1000, Math.floor((LEASE_SECONDS * 1000) / 3));
  while (!stopping) {
    const paused = redisWriteDelayMs();
    if (paused > 0) {
      await sleep(Math.min(paused, 5_000));
      continue;
    }
    try {
      await heartbeat(redis, WORKER_ID, leaseTtlSeconds(LEASE_SECONDS));
    } catch (error) {
      if (pauseAfterRedisOom(error, "lease") === null) {
        console.error(`event=background_task_failed error=${publicError(error)}`);
        await sleep(interval);
      }
      continue;
    }
    await sleep(interval);
  }
}

async function promoteDue(): Promise<void> {
  if (redisWritesPaused()) return;
  try {
    await promoteScheduled(redis);
  } catch (error) {
    if (pauseAfterRedisOom(error, "promote") !== null) return;
    throw error;
  }
}

async function reap(): Promise<void> {
  if (redisReapPaused() || redisWritesPaused()) return;
  let orphans;
  try {
    orphans = await reapOrphans(redis, WORKER_ID);
  } catch (error) {
    if (pauseAfterRedisOom(error, "reap") !== null) return;
    throw error;
  }
  for (const orphan of orphans) {
    if (orphan.action === "requeued") await markRequeued(orphan.jobId);
    if (orphan.action === "failed") {
      await markFinished(orphan.jobId, "Failed", { error_message: ORPHAN_FAILED_MESSAGE });
    }
    console.warn(`event=orphan_${orphan.action} job=${orphan.jobId}`);
  }
}

async function main(): Promise<void> {
  setRedisFullHandler(() => {
    for (const id of inFlight.keys()) void noteRedisFull(id, REDIS_FULL_MESSAGE).catch(() => undefined);
  });
  console.log(
    `event=worker_start worker=${WORKER_ID} queue=${QUEUE_KEY} concurrency=${WORKER_CONCURRENCY} ` +
      `test_timeout_ms=${TEST_TIMEOUT_MS} step_timeout_ms=${STEP_TIMEOUT_MS} lease_s=${LEASE_SECONDS} ` +
      `lease_ttl_s=${leaseTtlSeconds(LEASE_SECONDS)}`
  );
  try {
    await heartbeat(redis, WORKER_ID, leaseTtlSeconds(LEASE_SECONDS));
  } catch (error) {
    if (pauseAfterRedisOom(error, "lease") === null) throw error;
  }
  void statusLoop();
  // Recover anything this host left behind before taking new work.
  await reap();
  await warmUp();
  await Promise.all([
    every(KEEPALIVE_INTERVAL_MS, keepWarm),
    leaseLoop(),
    every(1000, promoteDue),
    every(REAPER_INTERVAL_MS, reap),
    ...Array.from({ length: WORKER_CONCURRENCY }, (_, index) => consume(index)),
  ]);
}

async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`event=worker_stopping signal=${signal} in_flight=${inFlight.size}`);
  await publishStatus("draining").catch(() => undefined);
  const drained = Promise.allSettled([...inFlight.values()]);
  const grace = sleep(SHUTDOWN_GRACE_MS).then(() => "timeout" as const);
  if ((await Promise.race([drained.then(() => "drained" as const), grace])) === "timeout") {
    // Abort what is still running; runOne hands those jobs back to the queue.
    shutdown.abort();
    await Promise.race([drained, sleep(10_000)]);
  }
  // Anything still listed as ours goes back to the queue (e.g. claimed just before the signal).
  // One attempt each. A full Redis must not turn shutdown into a requeue loop.
  try {
    for (const jobId of await redis.lrange(processingKey(WORKER_ID), 0, -1)) {
      if (await releaseQuietly(jobId)) await markRequeued(jobId);
    }
  } catch (error) {
    if (pauseAfterRedisOom(error, "shutdown_release") === null) {
      console.error(`event=shutdown_release_failed error=${publicError(error)}`);
    }
  }
  await pool.close();
  statusStopped = true;
  // Let an in-flight heartbeat land first so it cannot re-create the key after removal.
  await statusWrite.catch(() => undefined);
  await removeHeartbeat(redis, WORKER_ID).catch((error) => {
    if (pauseAfterRedisOom(error, "worker_status") === null) {
      console.error(`event=worker_status_remove_failed error=${publicError(error)}`);
    }
  });
  await dropLease(redis, WORKER_ID).catch((error) => {
    if (pauseAfterRedisOom(error, "drop_lease") === null) {
      console.error(`event=drop_lease_failed error=${publicError(error)}`);
    }
  });
  redis.disconnect();
  console.log("event=worker_stopped");
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function countEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function publicError(error: unknown): string {
  return errorText(error).split("\n")[0].replace(/rediss?:\/\/\S+/gi, "redis://redacted").slice(0, 180);
}

class WorkerStopping extends Error {
  constructor() {
    super("Worker is stopping");
    this.name = "WorkerStopping";
  }
}

/** Retry a Redis write only after a maxmemory pause. Connection errors still throw on the first failure. */
async function redisWrite<T>(action: string, op: () => Promise<T>): Promise<T> {
  for (;;) {
    if (stopping) throw new WorkerStopping();
    const paused = redisWriteDelayMs();
    if (paused > 0) {
      await sleep(Math.min(paused, 5_000));
      continue;
    }
    try {
      return await op();
    } catch (error) {
      if (pauseAfterRedisOom(error, action) === null) throw error;
    }
  }
}

/** One shutdown/release attempt. Returns false when Redis rejected the write, without queueing a retry. */
async function releaseQuietly(jobId: string): Promise<boolean> {
  if (redisWritesPaused()) return false;
  try {
    await release(redis, WORKER_ID, jobId);
    return true;
  } catch (error) {
    if (pauseAfterRedisOom(error, "release") !== null) return false;
    console.error(`event=release_failed job=${jobId} error=${publicError(error)}`);
    return false;
  }
}

function pauseAfterRedisOom(error: unknown, action: string): number | null {
  if (!isRedisOom(error)) return null;
  const waitMs = noteRedisOom();
  console.error(`event=redis_full action=${action} wait_ms=${waitMs}`);
  return waitMs;
}

process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));

main().catch((error) => {
  console.error(publicError(error));
  process.exit(1);
});
