"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { api, ApiError, type BatchExecutionStatus } from "@/lib/api";
import { useNavigate } from "@/lib/navigation";
import { pollWhileVisible } from "@/hooks/useExecutionPolling";
import { forgetWatchedBatch, forgetWatchedRun, isWatchedBatch, readWatchedItems, type WatchedBatch, type WatchedRun } from "@/lib/watchedRuns";

const POLL_MS = 3000;
const TOAST_MS = 20000;

/** Toasts when a run started in this browser finishes, including after the test case is closed. */
export function WatchedRunToasts() {
  const navigate = useNavigate();

  useEffect(() => {
    return pollWhileVisible(async () => {
      const runs = readWatchedItems();
      if (runs.length === 0) return true;
      await Promise.all(runs.map((run) => (isWatchedBatch(run) ? settleBatch(run, navigate) : settleRun(run, navigate))));
      return true;
    }, POLL_MS);
  }, [navigate]);

  return null;
}

async function settleRun(run: WatchedRun, navigate: (to: string) => void) {
  let status;
  try {
    status = await api.getExecution(run.jobId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) forgetWatchedRun(run.jobId);
    return;
  }
  if (status.state === "queued" || status.state === "running" || status.state === "scheduled") return;
  forgetWatchedRun(run.jobId);
  if (status.state === "cancelled") return;

  const passed = status.state === "completed" && Boolean(status.result?.success);
  const testRunId = status.testRunId || run.testRunId;
  const href = testRunId
    ? `/projects/${run.projectId}/results/${testRunId}`
    : `/projects/${run.projectId}/test-cases/${run.testCaseId}?tab=runs`;
  const label = [run.code, run.name].filter(Boolean).join(" · ") || "Test case";
  const action = { label: "View result", onClick: () => navigate(href) };
  if (passed) {
    const seconds = (status.result?.durationMs ?? 0) / 1000;
    toast.success(seconds > 0 ? `${label} passed in ${seconds.toFixed(1)}s` : `${label} passed`, { action, duration: TOAST_MS });
    return;
  }
  const detail = status.result?.errorMessage || status.error || "";
  toast.error(`${label} failed`, { description: detail.split(/\r?\n/)[0] || undefined, action, duration: TOAST_MS });
}

async function settleBatch(batch: WatchedBatch, navigate: (to: string) => void) {
  let status: BatchExecutionStatus;
  try {
    status = await api.getBatchRun(batch.batchId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) forgetWatchedBatch(batch.batchId);
    return;
  }
  if (!status.finished) return;
  forgetWatchedBatch(batch.batchId);
  // A cancel the user already confirmed does not need a second notice.
  if (status.cancelRequested && status.passed === 0 && status.failed === 0) return;

  const href = `/runs/batches/${batch.batchId}`;
  const action = { label: "View results", onClick: () => navigate(href) };
  const summary = [
    `${status.passed} passed`,
    `${status.failed} failed`,
    status.skipped > 0 ? `${status.skipped} skipped` : "",
  ]
    .filter(Boolean)
    .join(", ");
  if (status.failed > 0) toast.error(`${batch.label} finished`, { description: summary, action, duration: TOAST_MS });
  else toast.success(status.passed > 0 ? `${batch.label} passed` : `${batch.label} finished`, { description: summary, action, duration: TOAST_MS });
}
