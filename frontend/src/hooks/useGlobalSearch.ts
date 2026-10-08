"use client";

import { useEffect, useState } from "react";
import type { SearchResponse } from "@/lib/api";
import { globalSearch, type SearchScope } from "@/lib/search";

export type GlobalSearchState =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: SearchResponse | null; error: null }
  | { status: "success"; data: SearchResponse; error: null }
  | { status: "error"; data: null; error: string };

const IDLE: GlobalSearchState = { status: "idle", data: null, error: null };

type Options = {
  scope: SearchScope;
  projectId?: string | null;
  limit?: number;
  /** Minimum query length before searching. */
  minLength?: number;
  debounceMs?: number;
  /** Skip searching entirely (e.g. command mode). */
  enabled?: boolean;
};

/**
 * Debounced global search. Each new query aborts the previous request.
 * Keeps the last results visible while the next query loads.
 */
export function useGlobalSearch(query: string, { scope, projectId, limit = 5, minLength = 2, debounceMs = 200, enabled = true }: Options): GlobalSearchState {
  const [state, setState] = useState<GlobalSearchState>(IDLE);
  const trimmed = query.trim();
  const active = enabled && trimmed.length >= minLength;

  useEffect(() => {
    if (!active) {
      setState(IDLE);
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({ status: "loading", data: previous.data, error: null }));
    const timer = window.setTimeout(() => {
      globalSearch(trimmed, { type: scope, projectId: projectId || undefined, limit }, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setState({ status: "success", data, error: null });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState({ status: "error", data: null, error: error instanceof Error ? error.message : "Search failed" });
        });
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, trimmed, scope, projectId, limit, debounceMs]);

  return active ? state : IDLE;
}
