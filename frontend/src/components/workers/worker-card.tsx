"use client";

import { Copy, Flame, Globe, Snowflake } from "lucide-react";
import { toast } from "sonner";
import type { WorkerInfo } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatAgo, formatDurationSec, isExpiredWorker, secondsSince, shortId, warmLevel, workerName } from "@/lib/workers";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AttestLoader } from "@/components/brand/attest-loader";
import { Meter } from "@/components/workers/meter";
import { SlotPills } from "@/components/workers/slot-pills";

/** Status badge label + variant per runner status (shared by the card and the runners list). */
export const WORKER_STATUS_BADGE = {
  online: { label: "Online", variant: "ok" },
  draining: { label: "Draining", variant: "warning" },
  stale: { label: "Not responding", variant: "warning" },
} as const;

/** Assumed memory budget per worker for the RSS meter (no limit is reported). */
const RSS_BUDGET_MB = 2048;

function WarmState({ worker, now }: { worker: WorkerInfo; now: number }) {
  const level = warmLevel(worker.warm);
  if (!level || !worker.warm) return null;
  const warm = worker.warm;
  const browserUp = secondsSince(warm.browserLaunchedAt, now);
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        {level === "warm" ? (
          <Badge variant="ok">
            <Flame aria-hidden /> Warm
          </Badge>
        ) : level === "warming" ? (
          <span className="inline-flex h-5 items-center gap-1.5 rounded-sm bg-elevated px-1.5 font-medium text-muted-foreground">
            <AttestLoader size="sm" decorative className="[&_svg]:size-3" /> Warming…
          </span>
        ) : (
          <Badge variant="default">
            <Snowflake aria-hidden /> Cold
          </Badge>
        )}
        <span className="tabular-nums">
          {warm.spareContexts} browser session{warm.spareContexts === 1 ? "" : "s"} ready
        </span>
      </div>
      {browserUp != null || warm.testsSinceLaunch != null ? (
        <p className="tabular-nums">
          {browserUp != null ? `Browser up ${formatDurationSec(browserUp)}` : null}
          {browserUp != null && warm.testsSinceLaunch != null ? " · " : null}
          {warm.testsSinceLaunch != null ? `${warm.testsSinceLaunch} tests since recycle` : null}
        </p>
      ) : null}
      {warm.coldStartsAvoided != null ? <p className="tabular-nums">Cold starts avoided: {warm.coldStartsAvoided}</p> : null}
    </div>
  );
}

/** One worker: identity, health, resources, warm pool and its execution slots. */
export function WorkerCard({ worker, projectNames, now }: { worker: WorkerInfo; projectNames: Record<string, string>; now: number }) {
  const status = WORKER_STATUS_BADGE[worker.status] ?? WORKER_STATUS_BADGE.stale;
  const stale = worker.status === "stale";
  const { process: proc, browser } = worker;

  async function copyId() {
    try {
      await navigator.clipboard.writeText(worker.id);
      toast.success("Runner ID copied");
    } catch {
      toast.error("Couldn’t copy the runner ID");
    }
  }

  // Heartbeat key expired: only id/status/age are known. Render a compact "offline" card.
  if (isExpiredWorker(worker) || !proc || !browser) {
    return (
      <Card className="flex min-w-0 items-center justify-between gap-3 border-dashed px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-muted-foreground">{workerName(worker)}</h3>
            <Badge variant="default" dot>
              Offline
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            Offline · last seen {formatAgo(worker.heartbeatAgeSec)}
          </p>
        </div>
        <button
          type="button"
          onClick={copyId}
          aria-label="Copy runner ID"
          className="inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:bg-state-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {shortId(worker.id)} <Copy className="size-3" aria-hidden />
        </button>
      </Card>
    );
  }

  return (
    <Card className={cn("flex min-w-0 flex-col", stale && "border-warning/40")}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground" title={workerName(worker)}>
              {workerName(worker)}
            </h3>
            <Badge variant={status.variant} dot>
              {status.label}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="font-mono">{shortId(worker.id)}</span>
              <button
                type="button"
                onClick={copyId}
                aria-label="Copy runner ID"
                className="grid size-5 place-items-center rounded-sm hover:bg-state-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Copy className="size-3" aria-hidden />
              </button>
            </span>
            {worker.version ? <span>v{worker.version}</span> : null}
            
            <span className="tabular-nums">Up {formatDurationSec(proc.uptimeSec)}</span>
          </div>
        </div>
        <p className={cn("text-xs tabular-nums", stale ? "font-medium text-warning" : "text-muted-foreground")}>
          {stale ? `Not responding for ${formatDurationSec(worker.heartbeatAgeSec)}` : `Checked in ${formatAgo(worker.heartbeatAgeSec)}`}
        </p>
      </div>

      <div className="space-y-4 px-4 py-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Slots</span>
            <span className="tabular-nums text-foreground">
              {worker.busy} busy · {worker.idle} idle · {worker.concurrency} total
            </span>
          </div>
          <SlotPills slots={worker.slots} projectNames={projectNames} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Meter label="Memory" value={proc.rssMb} max={RSS_BUDGET_MB} valueText={`${Math.round(proc.rssMb)} MB`} />
          <Meter
            label="CPU load"
            value={proc.loadAvg1}
            max={proc.cpuCount}
            valueText={`${proc.loadAvg1.toFixed(2)} / ${proc.cpuCount} CPU`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {browser.connected ? (
            <Badge variant="ok" title={browser.version ? `Browser ${browser.version}` : undefined}>
              <Globe aria-hidden /> Browser ready
            </Badge>
          ) : (
            <Badge variant="warning">
              <Globe aria-hidden /> Browser disconnected
            </Badge>
          )}
          <span className="text-muted-foreground tabular-nums">{browser.contexts} open browser session{browser.contexts === 1 ? "" : "s"}</span>
          <span className="text-muted-foreground tabular-nums">
            {worker.processedTotal} processed · <span className={worker.failedTotal > 0 ? "text-destructive" : undefined}>{worker.failedTotal} failed</span>
          </span>
        </div>

        <WarmState worker={worker} now={now} />
      </div>
    </Card>
  );
}
