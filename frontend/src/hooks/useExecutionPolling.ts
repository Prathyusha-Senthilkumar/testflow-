"use client";

import { useEffect, useState } from "react";
import { api, type ExecutionStatus } from "@/lib/api";

const POLL_MS = 2000;

export function useExecutionPolling(jobId: string | undefined) {
  const [execution, setExecution] = useState<ExecutionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const status = await api.getExecution(jobId);
        if (cancelled) return;
        setExecution(status);
        setError(null);
        if (status.state === "queued" || status.state === "running") {
          timer = setTimeout(poll, POLL_MS);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load execution status");
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  return { execution, error };
}
