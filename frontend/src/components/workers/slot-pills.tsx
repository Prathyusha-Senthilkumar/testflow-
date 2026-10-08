"use client";

import { useState } from "react";
import { ArrowUpRight, FileCheck2 } from "lucide-react";
import type { WorkerSlot } from "@/lib/api";
import { Link } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { shortId, slotRunHref, slotTestCaseHref, slotTitle } from "@/lib/workers";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Elapsed } from "@/components/workers/elapsed";

function RunningSlot({ slot, projectNames }: { slot: WorkerSlot; projectNames: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const runHref = slotRunHref(slot);
  const caseHref = slotTestCaseHref(slot);
  const project = slot.projectId ? (projectNames[slot.projectId] ?? shortId(slot.projectId)) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={`Slot ${slot.index + 1}: running ${slotTitle(slot)}`}
        className="inline-flex h-7 min-w-16 items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:animate-pulse"
      >
        <span className="tabular-nums">#{slot.index + 1}</span>
        <Elapsed startedAt={slot.startedAt} className="tabular-nums opacity-90" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 p-3"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="text-xs text-muted-foreground">Slot #{slot.index + 1} · running</p>
        <p className="mt-1 text-[13px] font-medium text-foreground">{slotTitle(slot)}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Project</dt>
          <dd className="truncate">{project ?? "—"}</dd>
          <dt className="text-muted-foreground">Elapsed</dt>
          <dd>
            <Elapsed startedAt={slot.startedAt} />
          </dd>
          {slot.runId ? (
            <>
              <dt className="text-muted-foreground">Job</dt>
              <dd className="font-mono">{shortId(slot.runId)}</dd>
            </>
          ) : null}
        </dl>
        <div className="mt-3 flex flex-wrap gap-3 text-[13px]">
          {runHref && slot.runId ? (
            <Link to={runHref} className="inline-flex items-center gap-1 text-brand-accent hover:text-foreground hover:underline">
              Live run <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
          {caseHref ? (
            <Link to={caseHref} className="inline-flex items-center gap-1 text-brand-accent hover:text-foreground hover:underline">
              <FileCheck2 className="size-3.5" aria-hidden /> Test case
            </Link>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** One pill per execution slot: outline "Idle", or primary with a subtle pulse while running. */
export function SlotPills({ slots, projectNames, className }: { slots: WorkerSlot[]; projectNames: Record<string, string>; className?: string }) {
  if (slots.length === 0) return <p className="text-xs text-muted-foreground">No slots reported.</p>;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Execution slots">
      {slots.map((slot) => (
        <li key={slot.index}>
          {slot.state === "running" ? (
            <RunningSlot slot={slot} projectNames={projectNames} />
          ) : (
            <span className="inline-flex h-7 min-w-16 items-center justify-center rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground">
              <span className="sr-only">Slot {slot.index + 1}: </span>Idle
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
