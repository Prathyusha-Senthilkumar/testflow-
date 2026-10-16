"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu } from "lucide-react";
import { api, stepScreenshotSrc, type RunScreenshot, type WorkerInfo } from "@/lib/api";
import { pollWhileVisible } from "@/hooks/useExecutionPolling";
import { friendlyStepLabel } from "@/lib/stepLabel";
import { runningSlots, shortId, slotTitle, type RunningSlot } from "@/lib/workers";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { Elapsed } from "@/components/workers/elapsed";

/** Step screenshots for the runs currently on these workers. Polls only while mounted. */
export function WorkerLiveProgress({
  workers,
  projectNames,
  scopeLabel,
}: {
  workers: WorkerInfo[];
  projectNames: Record<string, string>;
  /** Shown when nothing is running, e.g. the selected runner name. */
  scopeLabel: string;
}) {
  const slots = useMemo(() => runningSlots(workers), [workers]);
  const runKey = slots.map((slot) => slot.runId || "").join("|");
  const [shots, setShots] = useState<Record<string, RunScreenshot[]>>({});

  useEffect(() => {
    const ids = [...new Set(slots.map((slot) => slot.runId).filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return;
    return pollWhileVisible(async () => {
      const next: Record<string, RunScreenshot[]> = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            next[id] = await api.runScreenshots(id);
          } catch {
            next[id] = [];
          }
        })
      );
      setShots(next);
      return true;
    }, 2000);
    // runKey changes when the set of live runs changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  if (slots.length === 0) {
    return (
      <EmptyState
        icon={Cpu}
        size="sm"
        title="Nothing running"
        description={`${scopeLabel} will show each step here while a test is in progress.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <LiveSlot
          key={`${slot.workerId}:${slot.index}`}
          slot={slot}
          projectNames={projectNames}
          steps={slot.runId ? (shots[slot.runId] ?? []) : []}
        />
      ))}
    </div>
  );
}

function LiveSlot({
  slot,
  projectNames,
  steps,
}: {
  slot: RunningSlot;
  projectNames: Record<string, string>;
  steps: RunScreenshot[];
}) {
  const project = slot.projectId ? (projectNames[slot.projectId] ?? shortId(slot.projectId)) : null;
  const latest = steps.length > 0 ? steps[steps.length - 1] : null;
  const current = latest ? friendlyStepLabel(latest.label) : null;
  const stepNumber = latest ? steps.length : slot.step;
  const src = slot.runId && latest ? stepScreenshotSrc(slot.runId, latest) : "";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{slotTitle(slot)}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {project ? `${project} · ` : null}
            {slot.hostname} · slot #{slot.index + 1}
          </p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          <Elapsed startedAt={slot.startedAt} />
        </p>
      </div>
      <div className="space-y-3 px-4 py-3">
        <p className="text-[13px] text-foreground">
          {stepNumber ? <span className="font-medium tabular-nums">Step {stepNumber}</span> : <span className="font-medium">Starting</span>}
          {current ? <span className="text-muted-foreground"> · {current}</span> : <span className="text-muted-foreground"> · waiting for the first step</span>}
        </p>
        {latest?.failed && latest.error ? <p className="text-[13px] text-destructive">{latest.error}</p> : null}
        {src ? (
          <img src={src} alt={current || "Latest step"} className="max-h-72 w-full rounded-md bg-elevated object-contain" />
        ) : (
          <div className="grid h-36 place-items-center rounded-md bg-elevated text-xs text-muted-foreground">Screenshot appears after the first step</div>
        )}
        {steps.length > 1 ? (
          <ol className="space-y-1 text-xs text-muted-foreground">
            {steps.map((step, index) => (
              <li key={step.file} className={cn("truncate", index === steps.length - 1 && "font-medium text-foreground")}>
                <span className="tabular-nums">{index + 1}.</span> {friendlyStepLabel(step.label)}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </Card>
  );
}
