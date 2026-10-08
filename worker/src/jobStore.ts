import type { Redis } from "ioredis";

// Redis layout shared with backend/app/queue/job_store.py and app/services/run_sweep_service.py.
export const QUEUE_KEY = "testflow:queue";
export const SCHEDULE_KEY = "testflow:scheduled";
export const JOB_PREFIX = "testflow:job:";
export const PROCESSING_PREFIX = "testflow:processing:";
export const LEASE_PREFIX = "testflow:lease:";
const REAPER_LOCK_KEY = "testflow:reaper:lock";
export const JOB_TTL_SECONDS = 60 * 60 * 48;
export const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);
/** A job orphaned by a dead worker is requeued this many times, then failed. */
export const MAX_RECOVERIES = 1;

export type JobPayload = {
  id: string;
  state: string;
  configPath: string;
  result: unknown;
  error: string | null;
  environmentBaseUrl?: string | null;
  claimedBy?: string | null;
  recoveries?: number;
  [key: string]: unknown;
};

// Compare-and-set on the raw string. The new JSON is built in Node, never re-encoded in Lua
// (cjson would turn [] into {}), so the stored document is byte-for-byte what we wrote.
const CAS_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0`;

export async function readJob(redis: Redis, jobId: string): Promise<JobPayload | null> {
  const raw = await redis.get(JOB_PREFIX + jobId);
  return parse(raw);
}

function parse(raw: string | null): JobPayload | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as JobPayload;
    return value && typeof value === "object" && value.id ? value : null;
  } catch {
    return null;
  }
}

export type CasResult = { applied: boolean; current: JobPayload | null };

/**
 * Atomically replace the job document with mutate(current). mutate returns null to leave it alone.
 * Retries when another writer (backend cancel, another worker) changed it in between.
 */
export async function updateJob(
  redis: Redis,
  jobId: string,
  mutate: (current: JobPayload) => JobPayload | null
): Promise<CasResult> {
  const key = JOB_PREFIX + jobId;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const raw = await redis.get(key);
    const current = parse(raw);
    if (!current || raw === null) return { applied: false, current: null };
    const next = mutate(current);
    if (!next) return { applied: false, current };
    const ok = await redis.eval(CAS_SCRIPT, 1, key, raw, JSON.stringify(next), String(JOB_TTL_SECONDS));
    if (Number(ok) === 1) return { applied: true, current: next };
  }
  throw new Error(`Job ${jobId} kept changing; update abandoned.`);
}

/** queued -> running, owned by this worker. Not applied for cancelled/finished jobs. */
export function claimJob(redis: Redis, jobId: string, workerId: string): Promise<CasResult> {
  return updateJob(redis, jobId, (job) => {
    if (TERMINAL_STATES.has(job.state)) return null;
    return { ...job, state: "running", claimedBy: workerId, startedAt: new Date().toISOString() };
  });
}

/** running -> completed|failed, only if still running and owned by this worker (cancel wins). */
export function finishJob(
  redis: Redis,
  jobId: string,
  workerId: string,
  state: "completed" | "failed",
  fields: { result?: unknown; error: string | null }
): Promise<CasResult> {
  return updateJob(redis, jobId, (job) => {
    if (job.state !== "running" || job.claimedBy !== workerId) return null;
    return { ...job, ...fields, state };
  });
}

export function processingKey(workerId: string): string {
  return PROCESSING_PREFIX + workerId;
}

/** Block until a job id is available and move it into this worker's processing list. */
export async function claimNext(redis: Redis, workerId: string, timeoutSeconds: number): Promise<string | null> {
  return redis.blmove(QUEUE_KEY, processingKey(workerId), "RIGHT", "LEFT", timeoutSeconds);
}

export async function ack(redis: Redis, workerId: string, jobId: string): Promise<void> {
  await redis.lrem(processingKey(workerId), 1, jobId);
}

/** Put a claimed job back at the consuming end of the queue (used on shutdown). */
export async function release(redis: Redis, workerId: string, jobId: string): Promise<void> {
  await updateJob(redis, jobId, (job) =>
    TERMINAL_STATES.has(job.state) ? null : { ...job, state: "queued", claimedBy: null }
  );
  await redis.multi().lrem(processingKey(workerId), 1, jobId).rpush(QUEUE_KEY, jobId).exec();
}

export async function heartbeat(redis: Redis, workerId: string, leaseSeconds: number): Promise<void> {
  await redis.set(LEASE_PREFIX + workerId, String(Date.now()), "EX", leaseSeconds);
}

export async function dropLease(redis: Redis, workerId: string): Promise<void> {
  await redis.del(LEASE_PREFIX + workerId);
}

/** Move due scheduled jobs onto the queue. ZREM decides which worker owns the promotion. */
export async function promoteScheduled(redis: Redis): Promise<string[]> {
  const due = await redis.zrangebyscore(SCHEDULE_KEY, 0, Date.now() / 1000);
  const promoted: string[] = [];
  for (const jobId of due) {
    if ((await redis.zrem(SCHEDULE_KEY, jobId)) !== 1) continue;
    const { current } = await updateJob(redis, jobId, (job) =>
      job.state === "scheduled" ? { ...job, state: "queued" } : null
    );
    if (!current || TERMINAL_STATES.has(current.state)) continue;
    await redis.lpush(QUEUE_KEY, jobId);
    promoted.push(jobId);
  }
  return promoted;
}

export type OrphanOutcome = { jobId: string; action: "requeued" | "failed" | "dropped" };

/**
 * Recover jobs left in processing lists of workers whose lease expired.
 * Each orphan is requeued MAX_RECOVERIES times, then failed. Guarded by a short lock so only
 * one reaper works at a time.
 */
export async function reapOrphans(redis: Redis, selfId: string, lockSeconds = 30): Promise<OrphanOutcome[]> {
  const locked = await redis.set(REAPER_LOCK_KEY, selfId, "EX", lockSeconds, "NX");
  if (locked !== "OK") return [];
  const outcomes: OrphanOutcome[] = [];
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${PROCESSING_PREFIX}*`, "COUNT", 100);
      cursor = next;
      for (const key of keys) {
        const workerId = key.slice(PROCESSING_PREFIX.length);
        if (workerId === selfId) continue;
        if (await redis.exists(LEASE_PREFIX + workerId)) continue;
        const jobIds = await redis.lrange(key, 0, -1);
        for (const jobId of jobIds) outcomes.push(await recoverOne(redis, key, jobId));
        if ((await redis.llen(key)) === 0) await redis.del(key);
      }
    } while (cursor !== "0");
  } finally {
    if ((await redis.get(REAPER_LOCK_KEY)) === selfId) await redis.del(REAPER_LOCK_KEY);
  }
  return outcomes;
}

async function recoverOne(redis: Redis, listKey: string, jobId: string): Promise<OrphanOutcome> {
  let action = "dropped" as OrphanOutcome["action"];
  await updateJob(redis, jobId, (job) => {
    if (TERMINAL_STATES.has(job.state)) {
      action = "dropped";
      return null;
    }
    const recoveries = Number(job.recoveries || 0);
    if (recoveries < MAX_RECOVERIES) {
      action = "requeued";
      return { ...job, state: "queued", claimedBy: null, recoveries: recoveries + 1 };
    }
    action = "failed";
    return { ...job, state: "failed", claimedBy: null, error: ORPHAN_FAILED_MESSAGE };
  });
  const tx = redis.multi().lrem(listKey, 1, jobId);
  if (action === "requeued") tx.rpush(QUEUE_KEY, jobId);
  await tx.exec();
  return { jobId, action };
}

export const ORPHAN_FAILED_MESSAGE =
  "Failed: the worker running this test stopped twice before it finished. Run the test again.";
