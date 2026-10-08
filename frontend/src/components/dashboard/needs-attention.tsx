"use client";

import { CircleCheck, RotateCcw } from "lucide-react";
import { AttestLoader } from "@/components/brand/attest-loader";
import { Link } from "@/lib/navigation";
import { relativeTime, type AttentionItem } from "@/lib/dashboard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { LoadingArea } from "@/components/common/LoadingArea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { friendlyRunError } from "@/lib/friendlyRunError";

export type RerunState = "starting" | "queued" | "running" | "passed" | "failed" | "error";

type NeedsAttentionProps = {
  items: AttentionItem[];
  now: number;
  loading?: boolean;
  /** Per test key: live state of a rerun started from this panel. */
  rerun?: Record<string, RerunState>;
  onRerun?: (item: AttentionItem) => void;
  /** Max rows shown (rest are reachable via "View all"). */
  limit?: number;
};

/** Currently failing tests with one-line reasons, View and Rerun actions. */
export function NeedsAttentionList({ items, now, loading = false, rerun = {}, onRerun, limit = 8 }: NeedsAttentionProps) {
  if (loading) {
    return (
      <LoadingArea
        loading
        label="Loading failing tests…"
        skeleton={
          <ul className="divide-y divide-border-subtle">
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index} className="space-y-1.5 px-3 py-3">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </li>
            ))}
          </ul>
        }
      />
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <span className="grid size-9 place-items-center rounded-full border border-border bg-elevated">
          <CircleCheck className="size-4.5 text-brand-accent" aria-hidden />
        </span>
        <p className="text-sm font-medium text-foreground">All clear</p>
        <p className="text-[13px] text-muted-foreground">No failing tests in this range.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border-subtle">
      {items.slice(0, limit).map((item) => {
        const state = rerun[item.testKey];
        const busy = state === "starting" || state === "queued" || state === "running";
        const href = item.projectId ? `/projects/${item.projectId}/results/${item.runId}` : null;
        return (
          <li key={item.testKey} className="group px-3 py-2.5 transition-colors duration-150 hover:bg-state-hover">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground" title={item.name}>
                  {item.code ? <span className="mr-1.5 font-mono text-xs text-muted-foreground">{item.code}</span> : null}
                  {item.name}
                </p>
                {item.reason ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" tabIndex={0}>
                        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-destructive" />
                        <span className="truncate">{friendlyRunError(item.reason)}</span>
                      </p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm font-mono text-[11px] break-words">{item.reason}</TooltipContent>
                  </Tooltip>
                ) : null}
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.projectName ?? "Project"} · <span className="tabular-nums">{relativeTime(item.failedAt, now)}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {state && state !== "starting" && state !== "error" ? <RunStatusBadge status={state} /> : null}
                {href ? (
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                    <Link to={href}>View</Link>
                  </Button>
                ) : null}
                {onRerun ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={busy}
                    onClick={() => onRerun(item)}
                    aria-label={`Rerun ${item.name}`}
                  >
                    {busy ? <AttestLoader size="sm" tone="current" decorative /> : <RotateCcw aria-hidden />}
                    Rerun
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
