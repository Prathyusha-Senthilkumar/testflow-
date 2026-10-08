"use client";

import { Server } from "lucide-react";
import type { WorkersResponse } from "@/lib/api";
import { isSaturated, warmSlots } from "@/lib/workers";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRunners } from "@/components/runners/runners-context";

export type RunnersHealth = "ok" | "saturated" | "none" | "unknown";

/** Overall runner health for the indicator dot. */
export function runnersHealth(data: WorkersResponse | null): RunnersHealth {
  if (!data) return "unknown";
  const online = data.totals.online + (data.totals.draining ?? 0);
  if (data.workers.length === 0 || online === 0) return "none";
  if (isSaturated(data)) return "saturated";
  return "ok";
}

const DOT: Record<RunnersHealth, string> = {
  ok: "bg-ok",
  saturated: "bg-warning",
  none: "bg-destructive",
  unknown: "bg-border-strong",
};

/** Tooltip text: "Runners · 1 online · 0 of 5 slots busy · Warm". */
export function runnersSummary(data: WorkersResponse | null, unavailable: boolean, loading: boolean): string {
  if (!data) return loading ? "Runners · checking…" : unavailable ? "Runners · status isn’t available yet" : "Runners";
  const parts = [`Runners`, `${data.totals.online} online`, `${data.totals.busy} of ${data.totals.slots} slots busy`];
  const warm = warmSlots(data.workers);
  if (warm && warm > 0) parts.push("Warm");
  if (isSaturated(data)) parts.push("Saturated");
  if (data.workers.length === 0) return "Runners · No runners online";
  return parts.join(" · ");
}

type RunnersIndicatorViewProps = {
  data: WorkersResponse | null;
  loading?: boolean;
  unavailable?: boolean;
  onClick?: () => void;
  className?: string;
};

/** Compact top-bar pill: health dot + Server icon + busy/total slots (dot + icon only on mobile). */
export function RunnersIndicatorView({ data, loading = false, unavailable = false, onClick, className }: RunnersIndicatorViewProps) {
  const health = runnersHealth(data);
  const summary = runnersSummary(data, unavailable, loading);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={`${summary}. Open runners`}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[13px] text-muted-foreground transition-colors duration-[120ms] hover:border-border-strong hover:bg-state-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            className
          )}
        >
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[health], loading && !data && "animate-pulse")} />
          <Server className="size-3.5 shrink-0" aria-hidden />
          <span className="hidden font-medium text-foreground tabular-nums sm:inline">
            {data ? `${data.totals.busy}/${data.totals.slots}` : "–/–"}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{summary}</TooltipContent>
    </Tooltip>
  );
}

/** Connected indicator (shared runner state from RunnersProvider). */
export function RunnersIndicator() {
  const { state, openPanel } = useRunners();
  return <RunnersIndicatorView data={state.data} loading={state.loading} unavailable={state.unavailable} onClick={openPanel} />;
}
