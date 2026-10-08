import type { WorkerInfo, WorkerSlot, WorkerWarmState, WorkersResponse } from "./api";

/* Pure helpers for the Workers page (no React). */

/** "2h 14m", "3m 05s", "42s". */
export function formatDurationSec(totalSec: number | null | undefined): string {
  if (totalSec == null || !Number.isFinite(totalSec) || totalSec < 0) return "—";
  const sec = Math.floor(totalSec);
  const days = Math.floor(sec / 86_400);
  const hours = Math.floor((sec % 86_400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

/** Seconds between an ISO timestamp and `now` (ms), or null. */
export function secondsSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  return Math.max(0, (now - at) / 1000);
}

/** "12s ago", "4m ago", "2h ago". */
export function formatAgo(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 5) return "just now";
  return `${formatDurationSec(seconds).split(" ")[0]} ago`;
}

export function shortId(id: string | null | undefined, length = 8): string {
  return id ? id.slice(0, length) : "—";
}

/** Saturated: work is waiting and no slot is free. */
export function isSaturated(data: Pick<WorkersResponse, "totals" | "queue">): boolean {
  return (data.queue?.queued ?? 0) > 0 && data.totals.idle === 0;
}

export type WarmLevel = "warm" | "warming" | "cold";

/** Warm state of a worker's browser pool, or null when the worker doesn't report it (older builds). */
export function warmLevel(warm: WorkerWarmState | null | undefined): WarmLevel | null {
  if (!warm) return null;
  if (!warm.browserReady) return "warming";
  return warm.spareContexts > 0 ? "warm" : "cold";
}

/** Sum of spare contexts across online workers; null when no worker reports warm state. */
export function warmSlots(workers: WorkerInfo[]): number | null {
  const reporting = workers.filter((worker) => worker.warm);
  if (reporting.length === 0) return null;
  return reporting.filter((worker) => worker.status === "online").reduce((sum, worker) => sum + (worker.warm?.spareContexts ?? 0), 0);
}

export type RunningSlot = WorkerSlot & { workerId: string; hostname: string };

/** All running slots across workers, longest-running first. */
export function runningSlots(workers: WorkerInfo[]): RunningSlot[] {
  return workers
    .flatMap((worker) =>
      (worker.slots ?? []).filter((slot) => slot.state === "running").map((slot) => ({ ...slot, workerId: worker.id, hostname: workerName(worker) }))
    )
    .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
}

/** Live-run route for a running slot, falling back to the test case. */
export function slotRunHref(slot: Pick<WorkerSlot, "projectId" | "runId" | "testCaseId">): string | null {
  if (slot.projectId && slot.runId) return `/projects/${slot.projectId}/runs/${slot.runId}/live`;
  if (slot.projectId && slot.testCaseId) return `/projects/${slot.projectId}/test-cases/${slot.testCaseId}`;
  return null;
}

export function slotTestCaseHref(slot: Pick<WorkerSlot, "projectId" | "testCaseId">): string | null {
  return slot.projectId && slot.testCaseId ? `/projects/${slot.projectId}/test-cases/${slot.testCaseId}` : null;
}

/** 0–1 ratio, clamped. */
export function ratio(value: number, max: number): number {
  if (!max || max <= 0 || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** Worker display name: hostname, or the short id when the heartbeat expired. */
export function workerName(worker: Pick<WorkerInfo, "hostname" | "id">): string {
  return worker.hostname?.trim() || `Runner ${shortId(worker.id)}`;
}

/** Display title for a running slot: "TC-007 · Open assessments" (code from the payload, name resolved client-side). */
export function slotTitle(slot: Pick<WorkerSlot, "testName" | "testCaseName">): string {
  const code = slot.testName?.trim();
  const name = slot.testCaseName?.trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || "Unnamed test";
}

/** Stale worker whose heartbeat key expired: only id/status/age are known. */
export function isExpiredWorker(worker: WorkerInfo): boolean {
  return !worker.process && !worker.browser;
}
