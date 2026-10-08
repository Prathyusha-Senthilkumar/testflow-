import assert from "node:assert/strict";
import { test } from "node:test";
import { dig, pageTheScriptOpens, readLocal, refreshConfigured, stateChanged } from "./authProfiles.js";
import { storageEntries } from "./runTest.js";

test("storage assertions keep only usable entries", () => {
  assert.deepEqual(
    storageEntries([
      { kind: "cookie", key: "sid", value: "1" },
      { kind: "localStorage", key: " token ", value: 2 },
      { kind: "bogus", key: "x" },
      { kind: "sessionStorage", key: "" },
      null,
    ]),
    [
      { kind: "cookie", key: "sid", value: "1" },
      { kind: "localStorage", key: "token", value: "2" },
    ]
  );
  assert.deepEqual(storageEntries(undefined), []);
});

test("refresh helpers", () => {
  assert.equal(refreshConfigured(null), false);
  assert.equal(refreshConfigured({ strategy: "cookie", url: "https://a.test/r" }), true);
  assert.equal(refreshConfigured({ strategy: "other", url: "https://a.test/r" }), false);
  assert.equal(dig({ data: { token: "t" } }, "data.token"), "t");
  assert.equal(dig({ data: {} }, "data.token"), null);
  const state = { cookies: [], origins: [{ origin: "https://a.test", localStorage: [{ name: "rt", value: "abc" }] }] };
  assert.equal(readLocal(state, "https://a.test", "rt"), "abc");
  assert.equal(readLocal(state, "https://b.test", "rt"), null);
  assert.equal(stateChanged(state, { ...state }), false);
  assert.equal(stateChanged(null, state), true);
});

test("auth validation target is the first page the script opens", () => {
  assert.equal(pageTheScriptOpens('await page.goto("https://a.test/app")', "https://fallback"), "https://a.test/app");
  assert.equal(pageTheScriptOpens("await page.click('x')", "https://fallback"), "https://fallback");
});
