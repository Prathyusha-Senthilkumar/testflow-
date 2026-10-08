"use client";

import { AlertTriangle, ArrowRight, Flame } from "lucide-react";
import type { WorkersResponse } from "@/lib/api";
import { isSaturated, ratio, warmSlots } from "@/lib/workers";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AttestLoader } from "@/components/brand/attest-loader";
import { SlotPills } from "@/components/workers/slot-pills";
import { Panel } from "@/components/dashboard/panel";
import { LoadingArea } from "@/components/common/LoadingArea";

export type RunnersPanelProps = {
  data: WorkersResponse | null;
  loading?: boolean;
  /** `/workers` isn't available on this server (old backend). */
  unavailable?: boolean;
  error?: string | null;
  projectNames?: Record<string, string>;
  /** Opens the runners slide-over; falls back to a link to /workers. */
  onViewAll?: () => void;
  className?: string;
};

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Compact runner status for the dashboard: online count, warm state, slot
 * meter with pills, queue depth and a saturation warning. Links to /workers.
 */
export function RunnersPanel({ data, loading = false, unavailable = false, error = null, projectNames = {}, onViewAll, className }: RunnersPanelProps) {
  const totals = data?.totals;
  const online = data?.workers.filter((worker) => worker.status !== "stale") ?? [];
  const warm = data ? warmSlots(data.workers) : null;
  const coldStartsAvoided = online.reduce((sum, worker) => sum + (worker.warm?.coldStartsAvoided ?? 0), 0);
  const anyWarm = online.some((worker) => worker.warm?.browserReady && (worker.warm?.spareContexts ?? 0) > 0);
  const saturated = data ? isSaturated(data) : false;
  const slots = online.flatMap((worker) => worker.slots ?? []);

  return (
    <Panel
      className={className}
      title={
        <span className="inline-flex items-center gap-2">
          Runners
          {loading && data ? <AttestLoader size="sm" label="Refreshing runners" /> : null}
        </span>
      }
      {...(onViewAll
        ? {
            actions: (
              <button
                type="button"
                onClick={onViewAll}
                className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                View runners <ArrowRight className="size-3.5" aria-hidden />
              </button>
            ),
          }
        : { viewAllHref: "/workers", viewAllLabel: "View runners" })}
    >
      <div className="space-y-3 p-4">
        {loading && !data ? (
          <LoadingArea
            loading
            label="Loading runners…"
            skeleton={
              <div className="space-y-2.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full" />
              </div>
            }
          />
        ) : unavailable && !data ? (
          <p className="text-[13px] text-muted-foreground">Runner status isn’t available yet.</p>
        ) : !data || !totals ? (
          <p className="text-[13px] text-muted-foreground">{error ? "Couldn’t load runner status." : "Runner status isn’t available yet."}</p>
        ) : data.workers.length === 0 || totals.online + (totals.draining ?? 0) === 0 ? (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-warning">
              <AlertTriangle className="size-3.5" aria-hidden /> No runners online
            </p>
            <p className="text-xs text-muted-foreground">
              {data.queue ? `${plural(data.queue.queued, "test")} waiting in the queue.` : "Tests you start will wait until a runner is available."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="inline-flex items-center gap-1.5 text-foreground tabular-nums">
                <span aria-hidden className="size-1.5 rounded-full bg-ok" />
                {totals.online} of {totals.workers} runners online
              </span>
              {anyWarm ? (
                <span className="inline-flex h-5 items-center gap-1 rounded-sm bg-ok-soft px-1.5 text-xs font-medium text-ok">
                  <Flame className="size-3" aria-hidden /> Warm
                </span>
              ) : null}
              {saturated ? (
                <span className="inline-flex h-5 items-center gap-1 rounded-sm bg-warning-soft px-1.5 text-xs font-medium text-warning">
                  <AlertTriangle className="size-3" aria-hidden /> Saturated
                </span>
              ) : null}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Parallel runs</span>
                <span className="tabular-nums">
                  {totals.busy} / {totals.slots} busy
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-elevated"
                role="meter"
                aria-label="Busy runner slots"
                aria-valuemin={0}
                aria-valuemax={totals.slots}
                aria-valuenow={totals.busy}
              >
                <div
                  className={cn("h-full rounded-full transition-[width] duration-300", saturated ? "bg-warning" : "bg-primary")}
                  style={{ width: `${ratio(totals.busy, totals.slots) * 100}%` }}
                />
              </div>
              {slots.length > 0 && slots.length <= 24 ? <SlotPills slots={slots} projectNames={projectNames} className="mt-2" /> : null}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Queue</dt>
              <dd className="text-right text-foreground tabular-nums">
                {data.queue ? `${data.queue.queued} queued · ${data.queue.scheduled} scheduled` : "—"}
              </dd>
              {warm != null ? (
                <>
                  <dt className="text-muted-foreground">Warm browser</dt>
                  <dd className={warm > 0 ? "text-right text-ok tabular-nums" : "text-right text-muted-foreground tabular-nums"}>{warm > 0 ? `${warm} ready` : "Not ready"}</dd>
                  <dt className="text-muted-foreground">Cold starts avoided</dt>
                  <dd className="text-right text-foreground tabular-nums">{coldStartsAvoided}</dd>
                </>
              ) : null}
            </dl>
          </>
        )}
      </div>
    </Panel>
  );
}
