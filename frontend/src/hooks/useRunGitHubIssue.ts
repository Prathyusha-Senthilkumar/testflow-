"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type RunGitHubIssueStatus } from "@/lib/api";
import { pollWhileVisible } from "@/hooks/useExecutionPolling";

const POLL_MS = 5000;
/** Automatic filing happens in the background shortly after a run fails; stop waiting after ~2 minutes. */
const MAX_WAIT_TICKS = 24;

/**
 * GitHub issue status for a failed run. Polls while the issue is being filed (or not filed yet,
 * since automatic filing runs in the background), and exposes `create` for the button and retry.
 */
export function useRunGitHubIssue(runId: string, enabled: boolean) {
  const [status, setStatus] = useState<RunGitHubIssueStatus | null>(null);
  const [creating, setCreating] = useState(false);
  // Bumped after a create that comes back "pending", to start polling again.
  const [pollKey, setPollKey] = useState(0);

  useEffect(() => {
    if (!runId || !enabled) return;
    let cancelled = false;
    let ticks = 0;
    const stop = pollWhileVisible(async () => {
      ticks += 1;
      try {
        const next = await api.runGithubIssue(runId);
        if (cancelled) return false;
        setStatus(next);
        if (!next.connected) return false;
        if (next.issue?.state === "pending") return true;
        return !next.issue && ticks < MAX_WAIT_TICKS;
      } catch {
        // Older backends without the endpoint, or a transient error: hide the section quietly.
        return false;
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      stop();
    };
  }, [runId, enabled, pollKey]);

  const create = useCallback(async () => {
    setCreating(true);
    try {
      const next = await api.createRunGithubIssue(runId);
      setStatus(next);
      if (next.issue?.state === "pending") setPollKey((key) => key + 1);
      else if (next.issue?.state === "error") toast.error("Couldn't file the GitHub issue");
      else if (next.issue) toast.success(`Opened issue #${next.issue.number} on GitHub`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't file the GitHub issue");
    } finally {
      setCreating(false);
    }
  }, [runId]);

  return { status: enabled ? status : null, creating, create };
}
