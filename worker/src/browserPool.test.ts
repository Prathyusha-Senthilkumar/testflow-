import assert from "node:assert/strict";
import { test } from "node:test";
import type { Browser } from "playwright";
import { BrowserPool } from "./browserPool.js";

/** A fake Chromium whose launch and newContext take a fixed delay, like a real cold start. */
function fakeChromium(delays = { launchMs: 0, contextMs: 0 }) {
  const stats = { launches: 0, contextsCreated: 0, contextsClosed: 0, browsersClosed: 0 };
  const browsers: ReturnType<typeof makeBrowser>[] = [];
  function makeBrowser() {
    let connected = true;
    const open = new Set<object>();
    const listeners: (() => void)[] = [];
    const browser = {
      isConnected: () => connected,
      version: () => "140.0.0.0",
      contexts: () => [...open],
      on: (event: string, fn: () => void) => {
        if (event === "disconnected") listeners.push(fn);
      },
      async newContext(options: Record<string, unknown> = {}) {
        await sleep(delays.contextMs);
        stats.contextsCreated += 1;
        const context = {
          options,
          browser: () => browser,
          async newPage() {
            return { goto: async () => undefined };
          },
          async close() {
            if (open.delete(context)) stats.contextsClosed += 1;
          },
        };
        open.add(context);
        return context;
      },
      async close() {
        stats.browsersClosed += 1;
        connected = false;
        listeners.forEach((fn) => fn());
      },
      crash() {
        connected = false;
        listeners.forEach((fn) => fn());
      },
    };
    return browser;
  }
  const launch = async () => {
    await sleep(delays.launchMs);
    stats.launches += 1;
    const browser = makeBrowser();
    browsers.push(browser);
    return browser as unknown as Browser;
  };
  return { launch, stats, browsers };
}

function pool(fake: ReturnType<typeof fakeChromium>, overrides: Partial<ConstructorParameters<typeof BrowserPool>[0]> = {}) {
  return new BrowserPool({
    launch: fake.launch,
    warmContexts: 1,
    recycleAfterTests: 200,
    recycleRssMb: 1500,
    rssMb: () => 100,
    log: () => undefined,
    ...overrides,
  });
}

test("start launches at boot, warms one throwaway context and fills the spares", async () => {
  const fake = fakeChromium();
  const p = pool(fake, { warmContexts: 2 });
  await p.start();
  assert.equal(fake.stats.launches, 1);
  assert.equal(fake.stats.contextsClosed, 1, "throwaway warm-up context is closed");
  const status = p.warmStatus();
  assert.equal(status.browserReady, true);
  assert.equal(status.spareContexts, 2);
  assert.ok(status.browserLaunchedAt);
  assert.equal(p.browserStatus().contexts, 2);
});

test("a job without an auth profile takes a spare and the pool refills", async () => {
  const fake = fakeChromium();
  const p = pool(fake);
  await p.start();
  const { context, warm } = await p.acquireContext({ viewport: { width: 1280, height: 720 } });
  assert.equal(warm, true);
  assert.equal(p.warmStatus().coldStartsAvoided, 1);
  await p.refill();
  assert.equal(p.warmStatus().spareContexts, 1);
  await context.close();
  // The used context was closed, never handed out again.
  const next = await p.acquireContext({});
  assert.notEqual(next.context, context);
});

test("a job with an auth profile always gets a fresh context with its storageState", async () => {
  const fake = fakeChromium();
  const p = pool(fake);
  await p.start();
  const storageState = { cookies: [], origins: [] };
  const { context, warm } = await p.acquireContext({ storageState });
  assert.equal(warm, false);
  assert.equal((context as unknown as { options: { storageState: unknown } }).options.storageState, storageState);
  assert.equal(p.warmStatus().coldStartsAvoided, 0);
  assert.equal(p.warmStatus().spareContexts, 1, "spare left for the next plain job");
});

test("WARM_CONTEXTS=0 disables spares", async () => {
  const fake = fakeChromium();
  const p = pool(fake, { warmContexts: 0 });
  await p.start();
  assert.equal(p.warmStatus().spareContexts, 0);
  assert.equal((await p.acquireContext({})).warm, false);
});

test("a crashed browser is relaunched in the background, not on the next job", async () => {
  const fake = fakeChromium();
  const p = pool(fake);
  await p.start();
  fake.browsers[0].crash();
  await sleep(10);
  await p.refill();
  assert.equal(fake.stats.launches, 2);
  assert.equal(p.warmStatus().browserReady, true);
  assert.equal(p.warmStatus().spareContexts, 1);
});

test("health check replaces spares older than the max age", async () => {
  const fake = fakeChromium();
  const p = pool(fake, { spareMaxAgeMs: 1000 });
  await p.start();
  const closedBefore = fake.stats.contextsClosed;
  await p.healthCheck(Date.now() + 5000);
  assert.equal(fake.stats.contextsClosed, closedBefore + 1);
  assert.equal(p.warmStatus().spareContexts, 1);
});

test("recycle is due after N tests or above the RSS limit, and relaunches warm", async () => {
  const fake = fakeChromium();
  let rss = 100;
  const p = pool(fake, { recycleAfterTests: 2, rssMb: () => rss });
  await p.start();
  assert.equal(p.needsRecycle(), false);
  rss = 2000;
  assert.equal(p.needsRecycle(), true);
  rss = 100;
  await (await p.acquireContext({})).context.close();
  await (await p.acquireContext({})).context.close();
  assert.equal(p.warmStatus().testsSinceLaunch, 2);
  assert.equal(p.needsRecycle(), true);
  await p.recycle("test");
  assert.equal(fake.stats.launches, 2);
  assert.equal(fake.stats.browsersClosed, 1);
  const status = p.warmStatus();
  assert.equal(status.testsSinceLaunch, 0);
  assert.ok(status.lastRecycleAt);
  assert.equal(status.browserReady, true);
  assert.equal(status.spareContexts, 1);
});

test("claim to first navigation: warm spare vs cold launch (simulated 300 ms launch, 40 ms context)", async () => {
  const delays = { launchMs: 300, contextMs: 40 };
  const firstNavigation = async (p: BrowserPool) => {
    const started = performance.now();
    const { context } = await p.acquireContext({ viewport: { width: 1280, height: 720 } });
    await (await context.newPage()).goto("about:blank");
    const elapsed = performance.now() - started;
    await context.close();
    return elapsed;
  };
  // Cold: what the old lazy pool did for the first job (launch + context on claim).
  const cold = pool(fakeChromium(delays), { warmContexts: 0 });
  const coldMs = await firstNavigation(cold);
  // Warm: browser launched at boot and a spare context ready.
  const warmPool = pool(fakeChromium(delays));
  await warmPool.start();
  const warmMs = await firstNavigation(warmPool);
  console.log(`claim_to_first_navigation simulated cold_ms=${coldMs.toFixed(1)} warm_ms=${warmMs.toFixed(1)}`);
  assert.ok(coldMs >= 330);
  assert.ok(warmMs < 40, `warm path should skip launch and context creation (${warmMs} ms)`);
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
