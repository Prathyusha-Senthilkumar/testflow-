import assert from "node:assert/strict";
import { test } from "node:test";
import type { Redis } from "ioredis";
import { JOB_PREFIX, claimJob, finishJob, updateJob } from "./jobStore.js";

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

test("empty arrays survive the update (no Lua re-encoding)", async () => {
  const key = JOB_PREFIX + "j1";
  const { client, store } = fakeRedis({ [key]: job("running", { claimedBy: "w1", steps: [] }) });
  await updateJob(client, "j1", (current) => ({ ...current, note: "x" }));
  assert.deepEqual(JSON.parse(store.get(key)!).steps, []);
});
