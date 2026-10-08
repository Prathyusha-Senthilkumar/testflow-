"use client";

import { useEffect, useState } from "react";
import { api, type ExecutionStatus } from "@/lib/api";

const POLL_MS = 2000;

/**
 * Runs `tick` now and then every `intervalMs` while it resolves `true`.
 * Stops for good once `tick` resolves `false` (terminal state). While the tab
 * is hidden no requests are made; the next tick fires as soon as it is
 * visible again. Ticks never overlap. Returns a stop function.
 */
export function pollWhileVisible(tick: () => Promise<boolean>, intervalMs: number): () => void {
  let stopped = false;
  let finished = false;
  let running = false;
  let missedWhileHidden = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (stopped || finished) return;
    clearTimeout(timer);
    timer = setTimeout(run, intervalMs);
  };

  async function run() {
    if (stopped || finished || running) return;
    if (document.hidden) {
      missedWhileHidden = true;
      return;
    }
    running = true;
    try {
      if (!(await tick())) finished = true;
    } catch {
      // `tick` owns error reporting; keep polling on transient failures.
    } finally {
      running = false;
    }
    schedule();
  }

  const onVisibilityChange = () => {
    if (!document.hidden && missedWhileHidden) {
      missedWhileHidden = false;
      void run();
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  void run();

  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

/** Polls an execution job while it is queued/running; pauses while the tab is hidden. */
export function useExecutionPolling(jobId: string | undefined) {
  const [execution, setExecution] = useState<ExecutionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const stop = pollWhileVisible(async () => {
      try {
        const status = await api.getExecution(jobId);
        if (cancelled) return false;
        setExecution(status);
        setError(null);
        return status.state === "queued" || status.state === "running";
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load execution status");
        return false;
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      stop();
    };
  }, [jobId]);

  return { execution, error };
}
