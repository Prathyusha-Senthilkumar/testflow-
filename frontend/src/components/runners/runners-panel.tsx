"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Flame, LayoutGrid, Maximize2, Server, X } from "lucide-react";
import { useNavigate } from "@/lib/navigation";
import type { WorkerInfo } from "@/lib/api";
import { shortId, warmLevel, workerName } from "@/lib/workers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert } from "@/components/ui/alert";
import { LoadingArea } from "@/components/common/LoadingArea";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveIndicator } from "@/components/workers/live-indicator";
import { WorkersKpis } from "@/components/workers/workers-kpis";
import { RunningNowTable } from "@/components/workers/running-now";
import { QueuePanel } from "@/components/workers/queue-panel";
import { WorkerCard, WORKER_STATUS_BADGE } from "@/components/workers/worker-card";
import { WorkersEmpty } from "@/components/workers/workers-empty";
import { useNow } from "@/components/workers/use-now";
import type { WorkersState } from "@/hooks/useWorkers";
import { useRunners } from "@/components/runners/runners-context";

const ALL = "__all__";
type PanelTab = "overview" | "runner" | "running" | "queue";

function RunnerListItem({ worker, selected, onSelect }: { worker: WorkerInfo; selected: boolean; onSelect: () => void }) {
  const status = WORKER_STATUS_BADGE[worker.status] ?? WORKER_STATUS_BADGE.stale;
  const warm = warmLevel(worker.warm) === "warm";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "relative w-full rounded-md border px-2.5 py-2 text-left transition-[background-color,border-color] duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary/40 bg-state-active before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
          : "border-border-subtle hover:border-border-strong hover:bg-state-hover"
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-foreground">{workerName(worker)}</span>
        <Badge variant={status.variant} dot>
          {status.label}
        </Badge>
      </span>
      <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{shortId(worker.id)}</span>
        <span className="tabular-nums">
          {worker.busy}/{worker.concurrency} busy
        </span>
        {warm ? (
          <span className="inline-flex items-center gap-0.5 text-ok">
            <Flame className="size-3" aria-hidden /> Warm
          </span>
        ) : null}
      </span>
    </button>
  );
}

export type RunnersPanelViewProps = {
  state: WorkersState;
  /** Selected runner id, or "__all__" for the overview. */
  selected: string;
  onSelect: (id: string) => void;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onClose?: () => void;
  onExpand?: () => void;
  className?: string;
};

/**
 * Presentational runners slide-over body: header, a runner list on the left and
 * tabs (Overview / Runner / Running now / Queue) on the right. Reuses the
 * Workers page components; no data fetching.
 */
export function RunnersPanelView({ state, selected, onSelect, tab, onTabChange, onClose, onExpand, className }: RunnersPanelViewProps) {
  const now = useNow(5000);
  const [listCollapsed, setListCollapsed] = useState(false);
  const { data, loading, unavailable, error, updatedAt, paused, projectNames } = state;
  const workers = data?.workers ?? [];
  const selectedWorker = workers.find((worker) => worker.id === selected) ?? workers[0] ?? null;
  const noRunners = (unavailable && !data) || (data !== null && workers.length === 0);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="grid size-8 place-items-center rounded-md border border-border bg-elevated text-muted-foreground">
          <Server className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-foreground">Runners</h2>
          <LiveIndicator updatedAt={updatedAt} paused={paused} className="text-xs" />
        </div>
        {onExpand ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Open full runners page" onClick={onExpand}>
                <Maximize2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open full page</TooltipContent>
          </Tooltip>
        ) : null}
        {onClose ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close runners" onClick={onClose}>
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Left: runner list */}
        <aside
          className={cn(
            "flex shrink-0 flex-col border-b border-border bg-nav md:border-r md:border-b-0",
            listCollapsed ? "md:w-12" : "md:w-[260px]"
          )}
        >
          <div className="flex h-10 items-center justify-between px-3">
            {!listCollapsed ? <span className="text-[11px] font-medium tracking-[0.08em] text-faint uppercase">Runners</span> : null}
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden md:inline-flex"
              aria-label={listCollapsed ? "Expand runner list" : "Collapse runner list"}
              onClick={() => setListCollapsed((value) => !value)}
            >
              {listCollapsed ? <ChevronRight /> : <ChevronLeft />}
            </Button>
          </div>
          {!listCollapsed ? (
            <div className="max-h-48 space-y-1 overflow-y-auto px-2 pb-2 md:max-h-none md:flex-1">
              <button
                type="button"
                onClick={() => {
                  onSelect(ALL);
                  onTabChange("overview");
                }}
                aria-current={selected === ALL ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[13px] font-medium transition-[background-color,border-color] duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected === ALL ? "border-primary/40 bg-state-active text-foreground" : "border-border-subtle text-foreground hover:border-border-strong hover:bg-state-hover"
                )}
              >
                <LayoutGrid className="size-4 text-muted-foreground" aria-hidden />
                All runners
                {data ? (
                  <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
                    {data.totals.online}/{data.totals.workers} online
                  </span>
                ) : null}
              </button>
              {loading && !data
                ? Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)
                : workers.map((worker) => (
                    <RunnerListItem
                      key={worker.id}
                      worker={worker}
                      selected={selected === worker.id}
                      onSelect={() => {
                        onSelect(worker.id);
                        onTabChange("runner");
                      }}
                    />
                  ))}
            </div>
          ) : null}
        </aside>

        {/* Right: detail tabs */}
        <section className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas">
          <div className="space-y-4 p-4">
            {error ? <Alert variant="error" title="Couldn’t refresh runner status">{error}</Alert> : null}
            <LoadingArea loading={loading && !data} label="Loading runners…" minHeight={240}>
              {noRunners ? (
                <div className="space-y-4">
                  <WorkersEmpty message={data?.message} unavailable={unavailable && !data} />
                  {data ? <QueuePanel queue={data.queue} /> : null}
                </div>
              ) : data ? (
                <Tabs value={tab} onValueChange={(value) => onTabChange(value as PanelTab)}>
                  <TabsList variant="line" className="w-full justify-start gap-1 border-b border-border">
                    <TabsTrigger value="overview" className="flex-none px-3">Overview</TabsTrigger>
                    <TabsTrigger value="runner" className="flex-none px-3">Runner</TabsTrigger>
                    <TabsTrigger value="running" className="flex-none px-3">
                      Running now
                      <span className="rounded-sm bg-elevated px-1.5 text-xs text-muted-foreground tabular-nums">{data.totals.busy}</span>
                    </TabsTrigger>
                    <TabsTrigger value="queue" className="flex-none px-3">Queue</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="space-y-4 pt-4">
                    <WorkersKpis data={data} />
                    <RunningNowTable workers={data.workers} projectNames={projectNames} />
                    <QueuePanel queue={data.queue} />
                  </TabsContent>
                  <TabsContent value="runner" className="pt-4">
                    {selectedWorker ? (
                      <WorkerCard worker={selectedWorker} projectNames={projectNames} now={now} />
                    ) : (
                      <p className="text-[13px] text-muted-foreground">Select a runner on the left.</p>
                    )}
                  </TabsContent>
                  <TabsContent value="running" className="pt-4">
                    <RunningNowTable workers={data.workers} projectNames={projectNames} />
                  </TabsContent>
                  <TabsContent value="queue" className="pt-4">
                    <QueuePanel queue={data.queue} />
                  </TabsContent>
                </Tabs>
              ) : null}
            </LoadingArea>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Connected slide-over, opened by the top-bar indicator or `?runners=1`. Mounted once in the AppShell. */
export function RunnersSheet() {
  const { state, open, closePanel } = useRunners();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(ALL);
  const [tab, setTab] = useState<PanelTab>("overview");

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closePanel();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 border-l border-border bg-surface p-0 sm:max-w-none md:w-[max(70vw,720px)] md:max-w-[960px]"
      >
        <SheetTitle className="sr-only">Runners</SheetTitle>
        <SheetDescription className="sr-only">Test runners and their parallel run slots</SheetDescription>
        <RunnersPanelView
          state={state}
          selected={selected}
          onSelect={setSelected}
          tab={tab}
          onTabChange={setTab}
          onClose={closePanel}
          // Navigating drops `?runners=1`, which closes the panel.
          onExpand={() => navigate("/workers")}
        />
      </SheetContent>
    </Sheet>
  );
}
