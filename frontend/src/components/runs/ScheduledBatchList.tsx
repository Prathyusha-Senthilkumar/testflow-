"use client";

import { CalendarClock, X } from "lucide-react";
import type { ScheduledBatch } from "@/lib/api";
import { formatInTimeZone } from "@/lib/scheduleTime";
import { SUITE_CATEGORY_LABELS, type SuiteCategory } from "@/lib/suiteCategory";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ScheduledBatchListProps = {
  items: ScheduledBatch[];
  onCancel: (item: ScheduledBatch) => void;
  /** Show which suite/project each row runs (project page, runners panel). */
  showTarget?: boolean;
  title?: string;
  className?: string;
};

function targetLabel(item: ScheduledBatch): string {
  if (item.batchType === "suite") return item.suiteName || "Suite";
  const category = item.suiteCategory ? SUITE_CATEGORY_LABELS[item.suiteCategory as SuiteCategory] : null;
  return `${item.projectName || "Project"} · ${category ?? "All categories"}`;
}

/** Compact "Scheduled" list of upcoming suite/project runs. Renders nothing when empty. */
export function ScheduledBatchList({ items, onCancel, showTarget = false, title = "Scheduled", className }: ScheduledBatchListProps) {
  if (items.length === 0) return null;
  return (
    <section className={cn("space-y-2", className)} aria-label={title}>
      <h2 className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
        <CalendarClock className="size-3.5 text-muted-foreground" aria-hidden />
        {title}
        <span className="text-muted-foreground tabular-nums">{items.length}</span>
      </h2>
      <ul className="divide-y divide-border-subtle overflow-hidden rounded-md border border-border bg-surface">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-3 py-1.5 text-[13px]">
            <span className="shrink-0 tabular-nums text-foreground">
              {formatInTimeZone(item.scheduledFor, item.timeZone || "UTC")}
            </span>
            <span className="min-w-0 truncate text-muted-foreground">
              {showTarget ? (
                <>
                  <span className="text-foreground">{targetLabel(item)}</span>
                  <span className="text-faint"> · </span>
                </>
              ) : null}
              {item.environmentName || "Environment"}
              {item.runBy ? <span className="text-faint"> · by {item.runBy}</span> : null}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onCancel(item)}
              className="ml-auto h-7 shrink-0 hover:text-destructive"
              aria-label={`Cancel scheduled run of ${targetLabel(item)}`}
            >
              <X aria-hidden />
              Cancel
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
