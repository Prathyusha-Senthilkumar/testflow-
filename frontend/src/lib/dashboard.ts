/**
 * Dashboard aggregates. Pure, typed functions over existing API data
 * (`ReportRun[]`, `GroupedRun[]`, `ProjectSummary[]`); no React, no I/O.
 *
 * Definitions (all relative to a time window [start, end)):
 * - Finished run: status Passed or Failed (case-insensitive). Other statuses
 *   (Queued, Running, Not Run/cancelled) count as runs but not as outcomes.
 * - Runs: every report run whose `startedAt` falls in the window.
 * - Pass rate: passed / (passed + failed) over finished runs in the window.
 * - Failing tests: unique test cases whose most recent finished run in the
 *   window failed.
 * - Median duration: median `durationMs` of finished runs in the window.
 * - Flaky tests: test cases whose chronological finished results in the window
 *   flip between Passed and Failed at least twice.
 * - Delta: the same metric over the previous window of equal length.
 */
import type { GroupedRun, ProjectSummary, ReportRun } from "./api";

export type DashboardRange = "24h" | "7d" | "30d";

export const DASHBOARD_RANGES: { value: DashboardRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RANGE_MS: Record<DashboardRange, number> = { "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY };

export function isDashboardRange(value: string | null | undefined): value is DashboardRange {
  return value === "24h" || value === "7d" || value === "30d";
}

export type TimeWindow = { start: number; end: number };

export function windowsFor(range: DashboardRange, now: number): { current: TimeWindow; previous: TimeWindow } {
  const length = RANGE_MS[range];
  return {
    current: { start: now - length, end: now },
    previous: { start: now - 2 * length, end: now - length },
  };
}

/* ------------------------------------------------------------------ */
/* Basics                                                              */
/* ------------------------------------------------------------------ */

export type Outcome = "passed" | "failed" | "other";

export function outcomeOf(status: string | null | undefined): Outcome {
  const key = (status ?? "").toLowerCase();
  if (key === "passed") return "passed";
  if (key === "failed") return "failed";
  return "other";
}

export function isActiveStatus(status: string | null | undefined): boolean {
  const key = (status ?? "").toLowerCase();
  return key === "queued" || key === "running";
}

function time(run: { startedAt?: string | null }): number {
  if (!run.startedAt) return Number.NaN;
  return new Date(run.startedAt).getTime();
}

function inWindow(run: { startedAt?: string | null }, window: TimeWindow): boolean {
  const at = time(run);
  return at >= window.start && at < window.end;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Runs filtered to a project (or all when `projectId` is empty). */
export function filterByProject<T extends { projectId?: string | null }>(runs: T[], projectId: string | null | undefined): T[] {
  return projectId ? runs.filter((run) => run.projectId === projectId) : runs;
}

function testKey(run: ReportRun): string {
  return run.testCaseId || `${run.projectId ?? ""}:${run.testCaseCode ?? run.testName ?? run.id}`;
}

/** Finished runs grouped per test, chronological (oldest first). */
function finishedByTest(runs: ReportRun[]): Map<string, ReportRun[]> {
  const map = new Map<string, ReportRun[]>();
  for (const run of runs) {
    if (outcomeOf(run.status) === "other" || Number.isNaN(time(run))) continue;
    const key = testKey(run);
    const list = map.get(key) ?? [];
    list.push(run);
    map.set(key, list);
  }
  map.forEach((list) => list.sort((a, b) => time(a) - time(b)));
  return map;
}

/** Number of Passed↔Failed transitions in a chronological list. */
export function flipCount(runs: ReportRun[]): number {
  let flips = 0;
  for (let index = 1; index < runs.length; index += 1) {
    if (outcomeOf(runs[index].status) !== outcomeOf(runs[index - 1].status)) flips += 1;
  }
  return flips;
}

/* ------------------------------------------------------------------ */
/* KPIs                                                                */
/* ------------------------------------------------------------------ */

export type PeriodMetrics = {
  runs: number;
  passed: number;
  failed: number;
  /** 0–100, or null when there are no finished runs. */
  passRate: number | null;
  failingTests: number;
  medianDurationMs: number | null;
  flakyTests: number;
};

export function periodMetrics(runs: ReportRun[], window: TimeWindow): PeriodMetrics {
  const inRange = runs.filter((run) => inWindow(run, window));
  let passed = 0;
  let failed = 0;
  const durations: number[] = [];
  for (const run of inRange) {
    const outcome = outcomeOf(run.status);
    if (outcome === "passed") passed += 1;
    if (outcome === "failed") failed += 1;
    if (outcome !== "other" && typeof run.durationMs === "number" && run.durationMs > 0) durations.push(run.durationMs);
  }
  const byTest = finishedByTest(inRange);
  let failingTests = 0;
  let flakyTests = 0;
  byTest.forEach((list) => {
    if (outcomeOf(list[list.length - 1].status) === "failed") failingTests += 1;
    if (flipCount(list) >= 2) flakyTests += 1;
  });
  return {
    runs: inRange.length,
    passed,
    failed,
    passRate: passed + failed ? (passed / (passed + failed)) * 100 : null,
    failingTests,
    medianDurationMs: median(durations),
    flakyTests,
  };
}

/** Direction of change and whether it is good, for delta colouring. */
export type Delta = { value: number; direction: "up" | "down" | "flat"; sentiment: "good" | "bad" | "neutral" };

/**
 * Difference current − previous. `higherIsBetter` decides sentiment
 * (null = neutral, e.g. run volume). Returns null when either side is unknown.
 */
export function delta(current: number | null, previous: number | null, higherIsBetter: boolean | null): Delta | null {
  if (current == null || previous == null) return null;
  const value = current - previous;
  const direction = Math.abs(value) < 1e-9 ? "flat" : value > 0 ? "up" : "down";
  let sentiment: Delta["sentiment"] = "neutral";
  if (higherIsBetter != null && direction !== "flat") {
    sentiment = (direction === "up") === higherIsBetter ? "good" : "bad";
  }
  return { value, direction, sentiment };
}

/* ------------------------------------------------------------------ */
/* Time series                                                         */
/* ------------------------------------------------------------------ */

export type TrendBucket = {
  key: string;
  label: string;
  start: number;
  passed: number;
  failed: number;
  runs: number;
  medianDurationMs: number | null;
  /** True for the bucket containing `now` (today / this hour). */
  isCurrent: boolean;
};

/** Hourly buckets for 24h, daily otherwise, oldest first, aligned to local midnight / hour. */
export function trendBuckets(runs: ReportRun[], range: DashboardRange, now: number): TrendBucket[] {
  const hourly = range === "24h";
  const count = hourly ? 24 : RANGE_MS[range] / DAY;
  const anchor = new Date(now);
  if (hourly) anchor.setMinutes(0, 0, 0);
  else anchor.setHours(0, 0, 0, 0);
  const buckets: TrendBucket[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const start = new Date(anchor);
    if (hourly) start.setHours(anchor.getHours() - index);
    else start.setDate(anchor.getDate() - index);
    const startMs = start.getTime();
    buckets.push({
      key: String(startMs),
      label: hourly
        ? start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })
        : start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      start: startMs,
      passed: 0,
      failed: 0,
      runs: 0,
      medianDurationMs: null,
      isCurrent: index === 0,
    });
  }
  const durations = buckets.map(() => [] as number[]);
  for (const run of runs) {
    const at = time(run);
    if (Number.isNaN(at) || at < buckets[0].start || at > now) continue;
    // Locate by scanning back (DST-safe; at most 30 buckets).
    let bucketIndex = buckets.length - 1;
    while (bucketIndex > 0 && at < buckets[bucketIndex].start) bucketIndex -= 1;
    const bucket = buckets[bucketIndex];
    bucket.runs += 1;
    const outcome = outcomeOf(run.status);
    if (outcome === "passed") bucket.passed += 1;
    if (outcome === "failed") bucket.failed += 1;
    if (outcome !== "other" && typeof run.durationMs === "number" && run.durationMs > 0) durations[bucketIndex].push(run.durationMs);
  }
  buckets.forEach((bucket, index) => {
    bucket.medianDurationMs = median(durations[index]);
  });
  return buckets;
}

export type KpiSeries = {
  passRate: number[];
  runs: number[];
  failed: number[];
  medianDuration: number[];
};

export function kpiSeries(buckets: TrendBucket[]): KpiSeries {
  return {
    passRate: buckets.map((bucket) => (bucket.passed + bucket.failed ? (bucket.passed / (bucket.passed + bucket.failed)) * 100 : 0)),
    runs: buckets.map((bucket) => bucket.runs),
    failed: buckets.map((bucket) => bucket.failed),
    medianDuration: buckets.map((bucket) => bucket.medianDurationMs ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

export type AttentionItem = {
  testKey: string;
  runId: string;
  testCaseId?: string | null;
  code?: string | null;
  name: string;
  projectId?: string | null;
  projectName?: string | null;
  reason: string;
  failedAt: string | null;
};

/** First non-empty line of an error message. */
export function firstLine(message: string | null | undefined): string {
  return (message ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
}

/** Tests whose latest finished run in the window failed, newest failure first. */
export function needsAttention(runs: ReportRun[], window: TimeWindow): AttentionItem[] {
  const byTest = finishedByTest(runs.filter((run) => inWindow(run, window)));
  const items: AttentionItem[] = [];
  byTest.forEach((list, key) => {
    const latest = list[list.length - 1];
    if (outcomeOf(latest.status) !== "failed") return;
    items.push({
      testKey: key,
      runId: latest.id,
      testCaseId: latest.testCaseId,
      code: latest.testCaseCode,
      name: latest.testName || latest.testCaseCode || "Untitled test",
      projectId: latest.projectId,
      projectName: latest.projectName,
      reason: firstLine(latest.errorMessage) || "Failed without an error message",
      failedAt: latest.startedAt ?? null,
    });
  });
  return items.sort((a, b) => (b.failedAt ?? "").localeCompare(a.failedAt ?? ""));
}

export type TestStat = {
  testKey: string;
  testCaseId?: string | null;
  code?: string | null;
  name: string;
  projectId?: string | null;
  projectName?: string | null;
  latestRunId: string;
  medianDurationMs: number | null;
  flips: number;
  /** Chronological outcomes, at most the last 14. */
  outcomes: Outcome[];
};

function testStats(runs: ReportRun[], window: TimeWindow): TestStat[] {
  const byTest = finishedByTest(runs.filter((run) => inWindow(run, window)));
  const stats: TestStat[] = [];
  byTest.forEach((list, key) => {
    const latest = list[list.length - 1];
    stats.push({
      testKey: key,
      testCaseId: latest.testCaseId,
      code: latest.testCaseCode,
      name: latest.testName || latest.testCaseCode || "Untitled test",
      projectId: latest.projectId,
      projectName: latest.projectName,
      latestRunId: latest.id,
      medianDurationMs: median(list.map((run) => run.durationMs ?? 0).filter((value) => value > 0)),
      flips: flipCount(list),
      outcomes: list.slice(-14).map((run) => outcomeOf(run.status)),
    });
  });
  return stats;
}

export function slowestTests(runs: ReportRun[], window: TimeWindow, limit = 5): TestStat[] {
  return testStats(runs, window)
    .filter((stat) => stat.medianDurationMs != null)
    .sort((a, b) => (b.medianDurationMs ?? 0) - (a.medianDurationMs ?? 0))
    .slice(0, limit);
}

/** Tests with at least one flip, most flips first. */
export function flakiestTests(runs: ReportRun[], window: TimeWindow, limit = 5): TestStat[] {
  return testStats(runs, window)
    .filter((stat) => stat.flips > 0)
    .sort((a, b) => b.flips - a.flips || b.outcomes.length - a.outcomes.length)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export type ProjectHealth = {
  id: string;
  name: string;
  /** 0–100 over finished runs in the window, null if none. */
  passRate: number | null;
  /** Last 14 finished outcomes (any time), chronological. */
  recent: Outcome[];
  lastRunAt: string | null;
  failingTests: number;
  runsInRange: number;
};

/**
 * Health per project that has runs; sorted by failing tests, then most recent
 * run. `idle` lists projects without any runs (shown as one collapsed line).
 */
export function projectHealth(
  projects: ProjectSummary[],
  runs: ReportRun[],
  window: TimeWindow
): { active: ProjectHealth[]; idle: ProjectSummary[] } {
  const byProject = new Map<string, ReportRun[]>();
  for (const run of runs) {
    if (!run.projectId) continue;
    const list = byProject.get(run.projectId) ?? [];
    list.push(run);
    byProject.set(run.projectId, list);
  }
  const active: ProjectHealth[] = [];
  const idle: ProjectSummary[] = [];
  for (const project of projects) {
    const list = byProject.get(project.id);
    if (!list || list.length === 0) {
      idle.push(project);
      continue;
    }
    const metrics = periodMetrics(list, window);
    const finished = list
      .filter((run) => outcomeOf(run.status) !== "other" && !Number.isNaN(time(run)))
      .sort((a, b) => time(a) - time(b));
    const last = list.reduce<string | null>((latest, run) => (run.startedAt && (!latest || run.startedAt > latest) ? run.startedAt : latest), null);
    active.push({
      id: project.id,
      name: project.name,
      passRate: metrics.passRate,
      recent: finished.slice(-14).map((run) => outcomeOf(run.status)),
      lastRunAt: last,
      failingTests: metrics.failingTests,
      runsInRange: metrics.runs,
    });
  }
  active.sort((a, b) => b.failingTests - a.failingTests || (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""));
  return { active, idle };
}

/* ------------------------------------------------------------------ */
/* Recent runs                                                         */
/* ------------------------------------------------------------------ */

/** Live (queued/running) runs first, then newest first; capped. */
export function recentRuns(runs: GroupedRun[], limit = 15): GroupedRun[] {
  return [...runs]
    .sort((a, b) => {
      const liveA = isActiveStatus(a.status) ? 1 : 0;
      const liveB = isActiveStatus(b.status) ? 1 : 0;
      if (liveA !== liveB) return liveB - liveA;
      return (b.startedAt ?? "").localeCompare(a.startedAt ?? "");
    })
    .slice(0, limit);
}

export function groupedRunHref(run: GroupedRun): string | null {
  if (run.runType === "individual") return run.projectId ? `/projects/${run.projectId}/results/${run.id}` : null;
  return `/runs/batches/${run.id}`;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

export function relativeTime(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return "—";
  const diff = Math.max(0, now - at);
  const minute = 60_000;
  if (diff < minute) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / minute)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Onboarding                                                          */
/* ------------------------------------------------------------------ */

export type OnboardingStep = { id: string; label: string; href: string; done: boolean; optional?: boolean };

export function onboardingSteps(input: {
  firstProjectId: string | null;
  hasProject: boolean;
  hasEnvironment: boolean;
  hasAuthProfile: boolean;
  hasTestCase: boolean;
  hasRun: boolean;
}): OnboardingStep[] {
  const base = input.firstProjectId ? `/projects/${input.firstProjectId}` : "/projects";
  return [
    { id: "project", label: "Create a project", href: "/projects", done: input.hasProject },
    { id: "environment", label: "Add an environment", href: input.firstProjectId ? `${base}/environments` : "/projects", done: input.hasEnvironment },
    { id: "auth", label: "Add an auth profile", href: input.firstProjectId ? `${base}/auth-profiles` : "/projects", done: input.hasAuthProfile, optional: true },
    { id: "record", label: "Record a test", href: input.firstProjectId ? `${base}/test-cases` : "/projects", done: input.hasTestCase },
    { id: "run", label: "Run it", href: input.firstProjectId ? `${base}/test-cases` : "/projects", done: input.hasRun },
  ];
}
