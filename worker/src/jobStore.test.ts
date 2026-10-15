import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Redis } from "ioredis";
import { JOB_PREFIX, claimJob, finishJob, reapOrphans, updateJob } from "./jobStore.js";
import { redisReapPaused, redisWriteDelayMs, resetRedisOomForTests } from "./redisOom.js";

/** Just enough of ioredis for the CAS helpers: GET, and EVAL of the compare-and-set script. */
function fakeRedis(initial: Record<string, string>, beforeEval?: (store: Map<string, string>) => void) {
  const store = new Map(Object.entries(initial));
  const client = {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async eval(_script: string, _numKeys: number, key: string, expected: string, next: string) {
      beforeEval?.(store);
      beforeEval = undefined;
      if (store.get(key) !== expected) return 0;
      store.set(key, next);
      return 1;
    },
  };
  return { client: client as unknown as Redis, store };
}

const job = (state: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ id: "j1", state, configPath: "c", result: null, error: null, ...extra });

test("claim moves queued -> running and records the owner", async () => {
  const { client, store } = fakeRedis({ [JOB_PREFIX + "j1"]: job("queued") });
  const res = await claimJob(client, "j1", "w1");
  assert.equal(res.applied, true);
  assert.equal(JSON.parse(store.get(JOB_PREFIX + "j1")!).claimedBy, "w1");
});

test("claim does not resurrect a cancelled job", async () => {
  const { client } = fakeRedis({ [JOB_PREFIX + "j1"]: job("cancelled") });
  const res = await claimJob(client, "j1", "w1");
  assert.equal(res.applied, false);
  assert.equal(res.current?.state, "cancelled");
});

test("finish never overwrites a cancel that landed while the test ran", async () => {
  const { client, store } = fakeRedis({ [JOB_PREFIX + "j1"]: job("cancelled", { claimedBy: "w1" }) });
  const res = await finishJob(client, "j1", "w1", "completed", { result: { ok: true }, error: null });
  assert.equal(res.applied, false);
  assert.equal(JSON.parse(store.get(JOB_PREFIX + "j1")!).state, "cancelled");
});

test("CAS retries when the document changed between read and write", async () => {
  const key = JOB_PREFIX + "j1";
  const { client, store } = fakeRedis({ [key]: job("running", { claimedBy: "w1" }) }, (s) =>
    s.set(key, job("cancelled", { claimedBy: "w1" }))
  );
  const res = await finishJob(client, "j1", "w1", "completed", { error: null });
  assert.equal(res.applied, false);
  assert.equal(JSON.parse(store.get(key)!).state, "cancelled");
});

test("updateJob does not retry a maxmemory rejection", async () => {
  let evals = 0;
  const client = {
    async get() {
      return job("running", { claimedBy: "w1" });
    },
    async eval() {
      evals += 1;
      const error = new Error("OOM command not allowed when used memory > 'maxmemory'.");
      error.name = "ReplyError";
      throw error;
    },
  };
  await assert.rejects(() => finishJob(client as unknown as Redis, "j1", "w1", "failed", { error: "x" }));
  assert.equal(evals, 1);
});

test("empty arrays survive the update (no Lua re-encoding)", async () => {
  const key = JOB_PREFIX + "j1";
  const { client, store } = fakeRedis({ [key]: job("running", { claimedBy: "w1", steps: [] }) });
  await updateJob(client, "j1", (current) => ({ ...current, note: "x" }));
  assert.deepEqual(JSON.parse(store.get(key)!).steps, []);
});

describe("reaper and maxmemory", { concurrency: false }, () => {
  test("does not requeue when the job write is rejected, and does not retry while backing off", async () => {
    resetRedisOomForTests();
    const pushed: string[] = [];
    let sets = 0;
    let lock: string | null = null;
    const client = {
      async set(_key: string, value: string) {
        sets += 1;
        lock = value;
        return "OK";
      },
      async get(key: string) {
        if (key.includes("reaper:lock")) return lock;
        if (key.includes("job:")) {
          return JSON.stringify({
            id: "job-1",
            state: "running",
            configPath: "c",
            result: null,
            error: null,
            claimedBy: "other",
          });
        }
        return null;
      },
      async scan() {
        return ["0", ["testflow:processing:other"]];
      },
      async exists() {
        return 0;
      },
      async lrange() {
        return ["job-1"];
      },
      async eval() {
        const error = new Error("OOM command not allowed when used memory > 'maxmemory'.");
        error.name = "ReplyError";
        throw error;
      },
      async del() {
        lock = null;
        return 1;
      },
      async llen() {
        return 1;
      },
      multi() {
        return {
          lrem() {
            return this;
          },
          rpush(_key: string, jobId: string) {
            pushed.push(jobId);
            return this;
          },
          async exec() {
            return [];
          },
        };
      },
    };
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.join(" "));
    };
    try {
      const first = await reapOrphans(client as unknown as Redis, "self");
      const setsAfterFirst = sets;
      const second = await reapOrphans(client as unknown as Redis, "self");
      assert.deepEqual(first, []);
      assert.deepEqual(second, []);
      assert.deepEqual(pushed, []);
      assert.equal(setsAfterFirst, 1);
      assert.equal(sets, 1);
      assert.ok(redisWriteDelayMs() >= 30_000);
      assert.equal(redisReapPaused(), true);
      assert.ok(errors.some((line) => String(line).includes("event=redis_full action=reap")));
    } finally {
      console.error = original;
      resetRedisOomForTests();
    }
  });
});
