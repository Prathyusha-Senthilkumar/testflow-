"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, isNotFoundError, type WorkersResponse } from "@/lib/api";

export type WorkersState = {
  /** Latest payload (slots enriched with `testCaseName`); null before the first response. */
  data: WorkersResponse | null;
  /** First load still in progress. */
  loading: boolean;
  /** `/workers` doesn't exist (old backend): show the "not updated yet" state. */
  unavailable: boolean;
  /** Non-404 error from the latest poll; the last data stays usable. */
  error: string | null;
  /** When the last successful response arrived (ms epoch). */
  updatedAt: number | null;
  /** Polling paused because the tab is hidden. */
  paused: boolean;
  projectNames: Record<string, string>;
};

/**
 * Polls `GET /workers` (live, uncached) every `intervalMs`, never overlapping,
 * paused while the tab is hidden and refreshed immediately when it's visible.
 * Resolves project names and test-case names (slots carry only the code) from
 * the cached list endpoints. Shared by /workers (5s) and the dashboard (10s).
 */
export function useWorkers({ intervalMs = 5000 }: { intervalMs?: number } = {}): WorkersState {
  const [raw, setRaw] = useState<WorkersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [caseNames, setCaseNames] = useState<Record<string, string>>({});
  const timer = useRef<number | null>(null);
  // Old backend without /workers: stop polling for this page session.
  const unsupported = useRef(false);
  const loadedCaseProjects = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      if (document.hidden || unsupported.current) return;
      try {
        const next = await api.workers();
        if (cancelled) return;
        setRaw(next);
        setUnavailable(false);
        setError(null);
        setUpdatedAt(Date.now());
      } catch (err) {
        if (cancelled) return;
        if (isNotFoundError(err)) {
          unsupported.current = true;
          setUnavailable(true);
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : "Request failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          if (!document.hidden && !unsupported.current) timer.current = window.setTimeout(tick, intervalMs);
        }
      }
    }
    function onVisibility() {
      setPaused(document.hidden);
      if (!document.hidden) void tick();
      else if (timer.current) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    }
    void tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [intervalMs]);

  // Names for running slots, from cached list endpoints (best effort).
  const runningProjects = useMemo(() => {
    const ids = new Set<string>();
    raw?.workers.forEach((worker) => (worker.slots ?? []).forEach((slot) => slot.state === "running" && slot.projectId && ids.add(slot.projectId)));
    return Array.from(ids).sort().join(",");
  }, [raw]);

  useEffect(() => {
    if (!runningProjects) return;
    let cancelled = false;
    api
      .projects()
      .then((items) => {
        if (!cancelled) setProjectNames(Object.fromEntries(items.map((item) => [item.id, item.name])));
      })
      .catch(() => {});
    for (const projectId of runningProjects.split(",")) {
      if (loadedCaseProjects.current.has(projectId)) continue;
      loadedCaseProjects.current.add(projectId);
      api
        .testCases(projectId)
        .then((cases) => {
          if (!cancelled) setCaseNames((current) => ({ ...current, ...Object.fromEntries(cases.map((item) => [item.id, item.name])) }));
        })
        .catch(() => loadedCaseProjects.current.delete(projectId));
    }
    return () => {
      cancelled = true;
    };
  }, [runningProjects]);

  const data = useMemo<WorkersResponse | null>(() => {
    if (!raw) return null;
    return {
      ...raw,
      workers: raw.workers.map((worker) => ({
        ...worker,
        slots: (worker.slots ?? []).map((slot) =>
          slot.testCaseId && caseNames[slot.testCaseId] ? { ...slot, testCaseName: caseNames[slot.testCaseId] } : slot
        ),
      })),
    };
  }, [raw, caseNames]);

  return { data, loading, unavailable, error, updatedAt, paused, projectNames };
}
