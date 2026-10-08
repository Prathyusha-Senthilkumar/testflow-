"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkers, type WorkersState } from "@/hooks/useWorkers";

const PARAM = "runners";

type RunnersContextValue = {
  /** Shared runner status (one poll for the indicator, slide-over and dashboard panel). */
  state: WorkersState;
  open: boolean;
  openPanel: () => void;
  closePanel: () => void;
};

const EMPTY_STATE: WorkersState = {
  data: null,
  loading: false,
  unavailable: false,
  error: null,
  updatedAt: null,
  paused: false,
  projectNames: {},
};

const RunnersContext = createContext<RunnersContextValue>({
  state: EMPTY_STATE,
  open: false,
  openPanel: () => {},
  closePanel: () => {},
});

/** Reads `?runners=1` (needs a Suspense boundary on static routes). */
function UrlSync({ onChange }: { onChange: (open: boolean) => void }) {
  const params = useSearchParams();
  const open = params?.get(PARAM) === "1";
  useEffect(() => onChange(open), [open, onChange]);
  return null;
}

/** Current URL with `?runners=1` added or removed (other params kept). */
function hrefWithPanel(open: boolean): string {
  const url = new URL(window.location.href);
  if (open) url.searchParams.set(PARAM, "1");
  else url.searchParams.delete(PARAM);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

/**
 * Owns runner polling for the whole shell (10s when the panel is closed, 5s
 * when open, paused while the tab is hidden) and the URL-addressable
 * `?runners=1` slide-over state. Mounted once in the AppShell.
 */
export function RunnersProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const state = useWorkers({ intervalMs: open ? 5000 : 10_000 });

  const openPanel = useCallback(() => {
    setOpen(true);
    router.push(hrefWithPanel(true), { scroll: false });
  }, [router]);

  const closePanel = useCallback(() => {
    setOpen(false);
    router.replace(hrefWithPanel(false), { scroll: false });
  }, [router]);

  const value = useMemo(() => ({ state, open, openPanel, closePanel }), [state, open, openPanel, closePanel]);

  return (
    <RunnersContext.Provider value={value}>
      <Suspense fallback={null}>
        <UrlSync onChange={setOpen} />
      </Suspense>
      {children}
    </RunnersContext.Provider>
  );
}

/** Shared runner status + slide-over controls. Safe outside the provider (inert defaults). */
export function useRunners(): RunnersContextValue {
  return useContext(RunnersContext);
}
