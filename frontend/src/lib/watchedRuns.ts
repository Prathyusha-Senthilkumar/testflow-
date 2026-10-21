/** Runs this browser started. They stay queued after the test-case page closes. */

export const WATCHED_RUNS_EVENT = "testflow-watched-runs";

const STORAGE_KEY = "testflow.watchedRuns";
const MAX_WATCHED = 20;

export type WatchedRun = {
  kind?: "case";
  jobId: string;
  projectId: string;
  testCaseId: string;
  code: string;
  name: string;
  testRunId?: string | null;
};

export type WatchedBatch = {
  kind: "batch";
  batchId: string;
  projectId: string;
  label: string;
};

export type WatchedItem = WatchedRun | WatchedBatch;

function dispatchChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(WATCHED_RUNS_EVENT));
}

export function readWatchedItems(): WatchedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isWatchedItem).slice(0, MAX_WATCHED);
  } catch {
    return [];
  }
}

export function readWatchedRuns(): WatchedRun[] {
  return readWatchedItems().filter(isWatchedRun);
}

export function watchRun(run: WatchedRun) {
  if (!isWatchedRun(run)) return;
  const next = [run, ...readWatchedItems().filter((item) => isWatchedBatch(item) || item.jobId !== run.jobId)].slice(0, MAX_WATCHED);
  write(next);
}

export function watchBatch(batch: WatchedBatch) {
  if (!isWatchedBatch(batch)) return;
  const next = [batch, ...readWatchedItems().filter((item) => !isWatchedBatch(item) || item.batchId !== batch.batchId)].slice(0, MAX_WATCHED);
  write(next);
}

export function forgetWatchedRun(jobId: string) {
  const current = readWatchedItems();
  if (!current.some((item) => isWatchedRun(item) && item.jobId === jobId)) return;
  write(current.filter((item) => !isWatchedRun(item) || item.jobId !== jobId));
}

export function forgetWatchedBatch(batchId: string) {
  const current = readWatchedItems();
  if (!current.some((item) => isWatchedBatch(item) && item.batchId === batchId)) return;
  write(current.filter((item) => !isWatchedBatch(item) || item.batchId !== batchId));
}

function write(runs: WatchedItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {
    // A full browser store should not stop the run. The toast is skipped.
  }
  dispatchChange();
}

function isWatchedItem(value: unknown): value is WatchedItem {
  return isWatchedBatch(value) || isWatchedRun(value);
}

function isWatchedRun(value: unknown): value is WatchedRun {
  if (!value || typeof value !== "object") return false;
  const run = value as { kind?: string; jobId?: unknown; projectId?: unknown; testCaseId?: unknown };
  return run.kind !== "batch" && Boolean(run.jobId && run.projectId && run.testCaseId);
}

export function isWatchedBatch(value: unknown): value is WatchedBatch {
  if (!value || typeof value !== "object") return false;
  const batch = value as WatchedBatch;
  return batch.kind === "batch" && Boolean(batch.batchId && batch.projectId);
}
