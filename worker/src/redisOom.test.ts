import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  OOM_BACKOFF_MAX_MS,
  OOM_BACKOFF_MIN_MS,
  OOM_REAP_TRAIL_MS,
  isRedisOom,
  leaseTtlSeconds,
  noteRedisOom,
  redisReapPaused,
  redisRetryDelayMs,
  redisWriteDelayMs,
  redisWritesPaused,
  resetRedisOomForTests,
  setRedisFullHandler,
  throwIfRedisOom,
} from "./redisOom.js";

const oom = () => new Error("OOM command not allowed when used memory > 'maxmemory'.");

describe("redis maxmemory rejection", { concurrency: false }, () => {
  test("classifies ioredis and node-redis OOM text, and not other Redis errors", () => {
    resetRedisOomForTests();
    const reply = oom();
    reply.name = "ReplyError";
    assert.equal(isRedisOom(reply), true);
    assert.equal(isRedisOom({ message: "OOM command not allowed when used memory > 'maxmemory'." }), true);
    assert.equal(
      isRedisOom(
        new Error(
          "ERR Error running script (call to f_1): @user_script: 2: OOM command not allowed when used memory > 'maxmemory'."
        )
      ),
      true
    );
    const wrapped = new Error("command failed");
    wrapped.cause = oom();
    assert.equal(isRedisOom(wrapped), true);

    assert.equal(isRedisOom(new Error("connect ECONNREFUSED 127.0.0.1:6379")), false);
    assert.equal(isRedisOom(new Error("Reached the max retries per request limit (which is 20).")), false);
    assert.equal(isRedisOom(new Error("JavaScript heap out of memory")), false);
    assert.equal(isRedisOom(new Error("LOADING Redis is loading the dataset in memory")), false);
    assert.equal(isRedisOom(new Error("READONLY You can't write against a read only replica.")), false);
    assert.equal(isRedisOom(new Error("OOM")), false);
    assert.equal(redisRetryDelayMs(new Error("connect ECONNREFUSED 127.0.0.1:6379"), 0, 0), null);
  });

  test("OOM does not schedule an immediate retry, and a second hit does not shorten the wait", () => {
    resetRedisOomForTests();
    let notices = 0;
    setRedisFullHandler(() => {
      notices += 1;
    });
    const first = noteRedisOom(0, 0);
    assert.equal(first, OOM_BACKOFF_MIN_MS);
    assert.ok(first >= 30_000);
    assert.equal(redisWriteDelayMs(0), OOM_BACKOFF_MIN_MS);
    assert.equal(redisWritesPaused(0), true);
    assert.equal(redisWritesPaused(OOM_BACKOFF_MIN_MS), false);
    assert.equal(redisReapPaused(OOM_BACKOFF_MIN_MS), true);
    assert.equal(redisReapPaused(OOM_BACKOFF_MIN_MS + OOM_REAP_TRAIL_MS), false);

    const second = redisRetryDelayMs(oom(), 1_000, 1);
    assert.equal(second, OOM_BACKOFF_MIN_MS - 1_000);
    assert.notEqual(second, 0);
    assert.ok((second ?? 0) > 1_000);
    assert.equal(notices, 1);

    const longest = noteRedisOom(OOM_BACKOFF_MIN_MS, 1);
    assert.equal(longest, OOM_BACKOFF_MAX_MS);
    assert.ok(longest <= OOM_BACKOFF_MAX_MS);
    resetRedisOomForTests();
  });

  test("a pipeline OOM reply is rejected once, and a loading error is not", () => {
    assert.throws(() => throwIfRedisOom([[oom(), null]]), (error) => isRedisOom(error));
    throwIfRedisOom([[new Error("LOADING Redis is loading the dataset in memory"), null]]);
    throwIfRedisOom(null);
  });

  test("lease key outlives one rejected refresh", () => {
    assert.equal(leaseTtlSeconds(60), 60 + OOM_BACKOFF_MAX_MS / 1000);
  });
});
