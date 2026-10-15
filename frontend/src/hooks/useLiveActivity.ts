"use client";

import { useEffect, useState } from "react";
import { pollWhileVisible } from "@/hooks/useExecutionPolling";
import { api, type ProjectLiveActivity } from "@/lib/api";

const LIVE_POLL_MS = 3000;

/** Queued and running work in a project, including runs started in another tab or on another device. */
export function useLiveActivity(projectId: string | undefined): ProjectLiveActivity | null {
  const [activity, setActivity] = useState<ProjectLiveActivity | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setActivity(null);
    return pollWhileVisible(async () => {
      setActivity(await api.liveActivity(projectId));
      return true;
    }, LIVE_POLL_MS);
  }, [projectId]);

  return activity;
}

export function runningTitle(active: boolean, runBy: string | null | undefined, idle: string): string {
  if (!active) return idle;
  return runBy ? `Running, started by ${runBy}` : "Running";
}
