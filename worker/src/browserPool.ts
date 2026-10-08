import { readFileSync, readdirSync } from "node:fs";
import type { Browser, BrowserContext, BrowserContextOptions } from "playwright";

// One Chromium per worker process, launched at boot and kept warm. Every test still gets its
// own BrowserContext: a spare is a blank context created ahead of time, handed to exactly one
// test and closed afterwards. Contexts are never reused between tests.

/** The only context shape tests use today; spares are created with it so they always match. */
export const DEFAULT_CONTEXT_OPTIONS: BrowserContextOptions = { viewport: { width: 1280, height: 720 } };

export type WarmStatus = {
  browserReady: boolean;
  spareContexts: number;
  browserLaunchedAt: string | null;
  testsSinceLaunch: number;
  lastRecycleAt: string | null;
  coldStartsAvoided: number;
};

export type BrowserStatus = { connected: boolean; version: string | null; contexts: number };

export type BrowserPoolOptions = {
  launch: () => Promise<Browser>;
  /** Spare blank contexts kept ready (0 disables). */
  warmContexts: number;
  recycleAfterTests: number;
  recycleRssMb: number;
  spareMaxAgeMs?: number;
  rssMb?: () => number;
  log?: (line: string) => void;
};

type Spare = { context: BrowserContext; createdAt: number };

export class BrowserPool {
  private browser: Browser | null = null;
  private browserVersion: string | null = null;
  private launching: Promise<Browser> | null = null;
  private spares: Spare[] = [];
  private refilling: Promise<void> | null = null;
  private closed = false;
  private recycling: Promise<void> | null = null;
  private launchedAt: number | null = null;
  private lastRecycleAt: number | null = null;
  private testsSinceLaunch = 0;
  private coldStartsAvoided = 0;
  private readonly spareMaxAgeMs: number;
  private readonly rssMb: () => number;
  private readonly log: (line: string) => void;

  constructor(private readonly options: BrowserPoolOptions) {
    this.spareMaxAgeMs = options.spareMaxAgeMs ?? 10 * 60 * 1000;
    this.rssMb = options.rssMb ?? (() => process.memoryUsage().rss / 1024 / 1024);
    this.log = options.log ?? ((line) => console.log(line));
  }

  /** Launch Chromium, open and close one throwaway page, then fill the spare pool. */
  async start(): Promise<void> {
    const browser = await this.getBrowser();
    const context = await browser.newContext(DEFAULT_CONTEXT_OPTIONS);
    try {
      await (await context.newPage()).goto("about:blank");
    } finally {
      await context.close().catch(() => undefined);
    }
    await this.refill();
  }

  async getBrowser(): Promise<Browser> {
    if (this.recycling) await this.recycling;
    if (this.browser && this.browser.isConnected()) return this.browser;
    return this.launchOnce();
  }

  private launchOnce(): Promise<Browser> {
    if (this.closed) return Promise.reject(new Error("Browser pool is closed."));
    if (!this.launching) {
      const started = Date.now();
      this.launching = this.options
        .launch()
        .then((launched) => {
          launched.on("disconnected", () => this.onDisconnected(launched));
          this.browser = launched;
          this.browserVersion = safeVersion(launched);
          this.launchedAt = Date.now();
          this.testsSinceLaunch = 0;
          this.spares = [];
          this.log(`event=browser_launched version=${this.browserVersion || "unknown"} ms=${Date.now() - started}`);
          return launched;
        })
        .finally(() => {
          this.launching = null;
        });
    }
    return this.launching;
  }

  private onDisconnected(which: Browser): void {
    if (this.browser !== which) return;
    this.browser = null;
    this.spares = [];
    if (this.closed || this.recycling) return;
    this.log("event=browser_disconnected relaunching=now");
    // Relaunch in the background so the next job does not pay the cold start.
    void this.launchOnce()
      .then(() => this.refill())
      .catch((error) => this.log(`event=browser_relaunch_failed error=${errorText(error)}`));
  }

  /**
   * A context for one test. Jobs with a storageState (Auth Profile) always get a fresh context;
   * the rest take a spare when one is ready. The caller owns the context and must close it.
   */
  async acquireContext(options: BrowserContextOptions = {}): Promise<{ context: BrowserContext; warm: boolean }> {
    const browser = await this.getBrowser();
    this.testsSinceLaunch += 1;
    if (!options.storageState) {
      const spare = this.takeSpare();
      if (spare) {
        this.coldStartsAvoided += 1;
        void this.refill();
        return { context: spare, warm: true };
      }
    }
    void this.refill();
    return { context: await browser.newContext({ ...DEFAULT_CONTEXT_OPTIONS, ...options }), warm: false };
  }

  private takeSpare(): BrowserContext | null {
    while (this.spares.length > 0) {
      const spare = this.spares.shift()!;
      if (spare.context.browser()?.isConnected() !== false) return spare.context;
    }
    return null;
  }

  /** Top the spare pool up to warmContexts. Concurrent callers share one refill. */
  refill(): Promise<void> {
    if (!this.refilling) {
      this.refilling = (async () => {
        while (!this.closed && !this.recycling && this.spares.length < this.options.warmContexts) {
          const browser = this.browser;
          if (!browser || !browser.isConnected()) return;
          try {
            const context = await browser.newContext(DEFAULT_CONTEXT_OPTIONS);
            if (this.browser !== browser || this.closed) {
              await context.close().catch(() => undefined);
              return;
            }
            this.spares.push({ context, createdAt: Date.now() });
          } catch (error) {
            this.log(`event=spare_context_failed error=${errorText(error)}`);
            return;
          }
        }
      })().finally(() => {
        this.refilling = null;
      });
    }
    return this.refilling;
  }

  /** Keep-alive: ping the browser, replace spares older than spareMaxAgeMs. */
  async healthCheck(now = Date.now()): Promise<void> {
    const browser = this.browser;
    if (!browser || !browser.isConnected()) {
      if (!this.launching && !this.recycling && !this.closed) await this.launchOnce();
      await this.refill();
      return;
    }
    try {
      this.browserVersion = browser.version();
    } catch (error) {
      this.log(`event=browser_health_failed error=${errorText(error)}`);
    }
    const expired = this.spares.filter((spare) => now - spare.createdAt > this.spareMaxAgeMs);
    if (expired.length > 0) {
      this.spares = this.spares.filter((spare) => !expired.includes(spare));
      await Promise.all(expired.map((spare) => spare.context.close().catch(() => undefined)));
    }
    await this.refill();
  }

  needsRecycle(): boolean {
    if (!this.browser) return false;
    return this.testsSinceLaunch >= this.options.recycleAfterTests || this.rssMb() > this.options.recycleRssMb;
  }

  /** Close and relaunch Chromium. The caller must make sure no test is running. */
  recycle(reason: string): Promise<void> {
    if (!this.recycling) {
      this.recycling = (async () => {
        const old = this.browser;
        const spares = this.spares;
        this.browser = null;
        this.spares = [];
        this.log(`event=browser_recycle reason=${reason} tests=${this.testsSinceLaunch}`);
        await Promise.all(spares.map((spare) => spare.context.close().catch(() => undefined)));
        if (old) await old.close().catch(() => undefined);
        this.lastRecycleAt = Date.now();
      })().finally(() => {
        this.recycling = null;
      });
    }
    return this.recycling.then(() => this.start());
  }

  warmStatus(): WarmStatus {
    return {
      browserReady: Boolean(this.browser && this.browser.isConnected() && !this.recycling),
      spareContexts: this.spares.length,
      browserLaunchedAt: iso(this.launchedAt),
      testsSinceLaunch: this.testsSinceLaunch,
      lastRecycleAt: iso(this.lastRecycleAt),
      coldStartsAvoided: this.coldStartsAvoided,
    };
  }

  browserStatus(): BrowserStatus {
    const browser = this.browser;
    const connected = Boolean(browser && browser.isConnected());
    let contexts = 0;
    try {
      contexts = connected ? browser!.contexts().length : 0;
    } catch {
      contexts = 0;
    }
    return { connected, version: connected ? this.browserVersion : null, contexts };
  }

  async close(): Promise<void> {
    this.closed = true;
    const browser = this.browser;
    const spares = this.spares;
    this.browser = null;
    this.spares = [];
    await Promise.all(spares.map((spare) => spare.context.close().catch(() => undefined)));
    if (browser) await browser.close().catch(() => undefined);
  }
}

/**
 * RSS of this process plus its descendants (Chromium runs in child processes), in MB.
 * Linux reads /proc; elsewhere only this process is counted.
 */
export function processTreeRssMb(rootPid = process.pid): number {
  const own = process.memoryUsage().rss / 1024 / 1024;
  if (process.platform !== "linux") return own;
  try {
    const children = new Map<number, number[]>();
    const rssPages = new Map<number, number>();
    for (const entry of readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
        // Fields after the ")" of the command name: state ppid ... (rss is field 24 overall).
        const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        const pid = Number(entry);
        const ppid = Number(fields[1]);
        rssPages.set(pid, Number(fields[21]) || 0);
        children.set(ppid, [...(children.get(ppid) || []), pid]);
      } catch {
        continue;
      }
    }
    let pages = 0;
    const stack = [rootPid];
    while (stack.length > 0) {
      const pid = stack.pop()!;
      pages += rssPages.get(pid) || 0;
      stack.push(...(children.get(pid) || []));
    }
    return (pages * 4096) / 1024 / 1024 || own;
  } catch {
    return own;
  }
}

function safeVersion(browser: Browser): string | null {
  try {
    return browser.version();
  } catch {
    return null;
  }
}

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
