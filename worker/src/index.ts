import { Redis } from "ioredis";
import { createClient } from "@supabase/supabase-js";
import { runRecordedTest } from "./runTest.js";

const QUEUE_KEY = "testflow:queue";
const SCHEDULE_KEY = "testflow:scheduled";
const JOB_PREFIX = "testflow:job:";
const REPO_ROOT = process.env.TESTFLOW_ROOT || "/app";

type JobPayload = {
  id: string;
  state: string;
  configPath: string;
  result: unknown;
  error: string | null;
  environmentBaseUrl?: string | null;
};

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379/0");
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

async function main(): Promise<void> {
  console.log("TestFlow Node worker listening on queue: testflow:queue");
  for (;;) {
    await promoteScheduled();
    const item = await redis.brpop(QUEUE_KEY, 5);
    if (!item) continue;
    const jobId = item[1];
    await runOne(jobId);
  }
}

async function promoteScheduled(): Promise<void> {
  const due = await redis.zrangebyscore(SCHEDULE_KEY, 0, Date.now() / 1000);
  for (const jobId of due) {
    await redis.zrem(SCHEDULE_KEY, jobId);
    await updateJob(jobId, { state: "queued" });
    await redis.lpush(QUEUE_KEY, jobId);
  }
}

async function runOne(jobId: string): Promise<void> {
  const payload = await readJob(jobId);
  if (!payload || payload.state === "cancelled") {
    await markCancelled(jobId);
    return;
  }
  await updateJob(jobId, { state: "running" });
  const started = await readJob(jobId);
  if (!started || started.state === "cancelled") {
    await markCancelled(jobId);
    return;
  }
  await markRun(jobId, { status: "Running" });
  try {
    const result = await runRecordedTest(REPO_ROOT, payload.configPath, {
      isCancelled: async () => (await readJob(jobId))?.state === "cancelled",
      environmentBaseUrl: payload.environmentBaseUrl,
    });
    const latest = await readJob(jobId);
    if (result.success) {
      await updateJob(jobId, { state: "completed", result, error: null });
      await markRun(jobId, {
        status: "Passed",
        duration_ms: result.duration_ms,
        error_message: null,
        completed_at: new Date().toISOString(),
      });
      console.log(`Job ${jobId} passed`);
      return;
    }
    if (latest?.state === "cancelled") {
      await markCancelled(jobId);
      console.log(`Job ${jobId} cancelled`);
      return;
    }
    await updateJob(jobId, { state: "failed", result, error: result.error_message });
    await markRun(jobId, {
      status: "Failed",
      duration_ms: result.duration_ms,
      error_message: result.error_message,
      completed_at: new Date().toISOString(),
    });
    console.log(`Job ${jobId} failed`);
  } catch (error) {
    const latest = await readJob(jobId);
    if (latest?.state === "cancelled") {
      await markCancelled(jobId);
      console.log(`Job ${jobId} cancelled`);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    await updateJob(jobId, { state: "failed", error: message });
    await markRun(jobId, {
      status: "Failed",
      error_message: message.slice(0, 3000),
      completed_at: new Date().toISOString(),
    });
    console.log(`Job ${jobId} failed: ${message}`);
  }
}

async function markCancelled(jobId: string): Promise<void> {
  if (!supabase || process.env.USE_DEMO_DATA === "true") return;
  await supabase
    .from("test_runs")
    .update({
      status: "Not Run",
      error_message: "Cancelled",
      completed_at: new Date().toISOString(),
    })
    .eq("job_id", jobId)
    .in("status", ["Queued", "Running"]);
}

async function readJob(jobId: string): Promise<JobPayload | null> {
  const raw = await redis.get(JOB_PREFIX + jobId);
  if (!raw) return null;
  return JSON.parse(raw) as JobPayload;
}

async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const current = await readJob(jobId);
  if (!current) return;
  if (current.state === "cancelled" && patch.state && patch.state !== "cancelled") return;
  const next = { ...current, ...patch };
  await redis.set(JOB_PREFIX + jobId, JSON.stringify(next), "EX", 60 * 60 * 48);
}

async function markRun(jobId: string, fields: Record<string, unknown>): Promise<void> {
  if (!supabase || process.env.USE_DEMO_DATA === "true") return;
  await supabase.from("test_runs").update(fields).eq("job_id", jobId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
