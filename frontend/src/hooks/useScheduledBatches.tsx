"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type ScheduledBatch } from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatInTimeZone } from "@/lib/scheduleTime";

export type ScheduledBatchesState = {
  items: ScheduledBatch[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Asks with an in-app confirm, then cancels and refreshes. */
  cancel: (item: ScheduledBatch) => Promise<void>;
};

export function scheduledBatchTitle(item: ScheduledBatch): string {
  return item.batchType === "suite" ? item.suiteName || "Suite" : item.projectName || "Project";
}

/** Upcoming suite/project runs, filtered by project and/or suite. Skips loading when `enabled` is false. */
export function useScheduledBatches(
  filter: { projectId?: string; suiteId?: string },
  { enabled = true }: { enabled?: boolean } = {}
): ScheduledBatchesState {
  const { projectId, suiteId } = filter;
  const confirm = useConfirm();
  const [items, setItems] = useState<ScheduledBatch[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.scheduledBatches({ projectId, suiteId });
      setItems(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load scheduled runs");
    } finally {
      setLoading(false);
    }
  }, [projectId, suiteId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api
      .scheduledBatches({ projectId, suiteId })
      .then((next) => {
        if (cancelled) return;
        setItems(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load scheduled runs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, projectId, suiteId]);

  const cancel = useCallback(
    async (item: ScheduledBatch) => {
      const when = formatInTimeZone(item.scheduledFor, item.timeZone || "UTC");
      const confirmed = await confirm({
        title: "Cancel scheduled run?",
        description: (
          <>
            <strong>{scheduledBatchTitle(item)}</strong> will not run at {when}.
          </>
        ),
        confirmLabel: "Cancel run",
        cancelLabel: "Keep",
        tone: "danger",
        onConfirm: () => api.cancelScheduledBatch(item.id),
      });
      if (!confirmed) return;
      toast.success("Scheduled run cancelled");
      await refresh();
    },
    [confirm, refresh]
  );

  return { items, loading, error, refresh, cancel };
}
