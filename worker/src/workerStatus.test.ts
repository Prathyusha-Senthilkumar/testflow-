import assert from "node:assert/strict";
import { test } from "node:test";
import type { Redis } from "ioredis";
import {
  SlotTracker,
  WORKERS_SEEN_KEY,
  WORKERS_SET_KEY,
  WORKER_KEY_PREFIX,
  buildHeartbeat,
  heartbeatTtlSeconds,
  publishHeartbeat,
  removeHeartbeat,
  workerVersion,
} from "./workerStatus.js";

const warm = {
  browserReady: true,
  spareContexts: 1,
  browserLaunchedAt: "2026-10-08T10:00:00.000Z",
  testsSinceLaunch: 3,
  lastRecycleAt: null,
  coldStartsAvoided: 2,
};
const proc = { rssMb: 210.5, heapUsedMb: 40.2, uptimeSec: 120, loadAvg1: 0.4, cpuCount: 8 };

function heartbeatFor(slots: SlotTracker, status: "online" | "draining" = "online") {
  return buildHeartbeat({
    id: "host-1-abc",
    hostname: "host",
    pid: 1,
    version: "1.0.0+abc123",
    startedAt: new Date("2026-10-08T10:00:00Z"),
    status,
    slots,
    browser: { connected: true, version: "140.0.0.0", contexts: 2 },
    warm,
    process: proc,
    now: new Date("2026-10-08T10:02:00Z"),
  });
}

test("slots start idle and track running jobs by index", () => {
  const slots = new SlotTracker(3);
  assert.equal(slots.busy, 0);
  slots.start(1, { jobId: "j1", runId: "j1", testCaseId: "tc1", projectId: "p1", testName: "TC-001" }, new Date("2026-10-08T10:01:00Z"));
  assert.equal(slots.busy, 1);
  assert.deepEqual(slots.snapshot(), [
    { index: 0, state: "idle" },
    {
      index: 1,
      state: "running",
      jobId: "j1",
      runId: "j1",
      testCaseId: "tc1",
      projectId: "p1",
      testName: "TC-001",
      startedAt: "2026-10-08T10:01:00.000Z",
    },
    { index: 2, state: "idle" },
  ]);
});

test("finish frees the slot and counts processed and failed runs", () => {
  const slots = new SlotTracker(2);
  slots.start(0, { jobId: "a" });
  slots.start(1, { jobId: "b" });
  slots.finish(0, "passed");
  slots.finish(1, "failed");
  slots.start(0, { jobId: "c" });
  slots.finish(0, "released");
  slots.start(0, { jobId: "d" });
  slots.finish(0, "skipped");
  assert.equal(slots.busy, 0);
  assert.equal(slots.processedTotal, 2);
  assert.equal(slots.failedTotal, 1);
  assert.deepEqual(slots.snapshot()[0], { index: 0, state: "idle" });
});

test("slot indexes outside the concurrency are rejected", () => {
  const slots = new SlotTracker(2);
  assert.throws(() => slots.start(2, { jobId: "x" }), RangeError);
  assert.throws(() => slots.finish(-1, "passed"), RangeError);
});

test("snapshots are copies, not live references", () => {
  const slots = new SlotTracker(1);
  const before = slots.snapshot();
  slots.start(0, { jobId: "j" });
  assert.equal(before[0].state, "idle");
});

test("heartbeat has the contract fields and busy + idle = concurrency", () => {
  const slots = new SlotTracker(5);
  slots.start(0, { jobId: "j1" });
  slots.start(3, { jobId: "j2" });
  const hb = heartbeatFor(slots, "draining");
  assert.deepEqual(Object.keys(hb).sort(), [
    "browser",
    "busy",
    "concurrency",
    "failedTotal",
    "hostname",
    "id",
    "idle",
    "lastHeartbeatAt",
    "pid",
    "process",
    "processedTotal",
    "slots",
    "startedAt",
    "status",
    "version",
    "warm",
  ]);
  assert.equal(hb.status, "draining");
  assert.equal(hb.concurrency, 5);
  assert.equal(hb.busy, 2);
  assert.equal(hb.idle, 3);
  assert.equal(hb.slots.length, 5);
  assert.equal(hb.lastHeartbeatAt, "2026-10-08T10:02:00.000Z");
  assert.deepEqual(hb.warm, warm);
  assert.deepEqual(JSON.parse(JSON.stringify(hb)), hb);
});

test("heartbeat never carries job secrets, script body or URLs even if the job had them", () => {
  const slots = new SlotTracker(1);
  const job = {
    jobId: "j1",
    testName: "Login",
    configPath: "tests/p/tc/testflow.config.json",
    environmentBaseUrl: "https://user:pw@staging.example.com",
    script: "await page.fill('#password', 'hunter2')",
    storageState: { cookies: [{ name: "session", value: "s3cret" }] },
    password: "hunter2",
  };
  slots.start(0, job as never);
  const raw = JSON.stringify(heartbeatFor(slots));
  for (const secret of ["hunter2", "s3cret", "staging.example.com", "configPath", "storageState", "password", "script"]) {
    assert.ok(!raw.includes(secret), `heartbeat leaked ${secret}`);
  }
});

test("version appends the git sha when set", () => {
  assert.match(workerVersion(""), /^\d+\.\d+\.\d+$/);
  assert.match(workerVersion("0123456789abcdef"), /^\d+\.\d+\.\d+\+0123456789ab$/);
});

test("TTL is three intervals, at least 3 seconds", () => {
  assert.equal(heartbeatTtlSeconds(5000), 15);
  assert.equal(heartbeatTtlSeconds(500), 3);
});

/** Records MULTI commands so we can check the keys, TTL and payload written. */
function recordingRedis() {
  const calls: unknown[][] = [];
  const tx: Record<string, unknown> = {};
  for (const name of ["set", "sadd", "hset", "del", "srem", "hdel"]) {
    tx[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
      return tx;
    };
  }
  tx.exec = async () => [];
  return { client: { multi: () => tx } as unknown as Redis, calls };
}

test("publish writes the key with a TTL, adds the id to the set and records last seen", async () => {
  const { client, calls } = recordingRedis();
  const hb = heartbeatFor(new SlotTracker(2));
  await publishHeartbeat(client, hb, 5000);
  assert.deepEqual(calls[0].slice(0, 2), ["set", WORKER_KEY_PREFIX + hb.id]);
  assert.deepEqual(calls[0].slice(3), ["EX", 15]);
  assert.deepEqual(JSON.parse(String(calls[0][2])), hb);
  assert.deepEqual(calls[1], ["sadd", WORKERS_SET_KEY, hb.id]);
  assert.deepEqual(calls[2], ["hset", WORKERS_SEEN_KEY, hb.id, String(Date.parse(hb.lastHeartbeatAt))]);
});

test("remove deletes the key and the registry entries", async () => {
  const { client, calls } = recordingRedis();
  await removeHeartbeat(client, "w1");
  assert.deepEqual(calls, [
    ["del", WORKER_KEY_PREFIX + "w1"],
    ["srem", WORKERS_SET_KEY, "w1"],
    ["hdel", WORKERS_SEEN_KEY, "w1"],
  ]);
});
