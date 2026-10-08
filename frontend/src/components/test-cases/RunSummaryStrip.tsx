"use client";

import type { TestRunHistoryItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { statusLabel, statusTone } from "@/components/runs/RunStatusBadge";
import { formatRelative } from "@/components/test-cases/testCaseFormat";

const TICK: Record<string, string> = {
  passed: "bg-pass",
  failed: "bg-destructive",
  running: "bg-brand-accent motion-safe:animate-pulse",
};

/**
 * Compact header summary: the last 10 results as ticks (oldest → newest),
 * "Last run: Failed · 2h ago" and the pass rate. Renders nothing without runs.
 */
export function RunSummaryStrip({ runs, className }: { runs: TestRunHistoryItem[]; className?: string }) {
  if (runs.length === 0) return null;
  const recent = runs.slice(0, 10).reverse();
  const finished = runs.filter((run) => {
    const tone = statusTone(run.status);
    return tone === "passed" || tone === "failed";
  });
  const passed = finished.filter((run) => statusTone(run.status) === "passed").length;
  const passRate = finished.length ? Math.round((passed / finished.length) * 100) : null;
  const last = runs[0];
  const lastTone = statusTone(last.status);

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="flex items-end gap-[3px]" role="img" aria-label={`Last ${recent.length} runs: ${recent.map((run) => statusLabel(run.status)).join(", ")}`}>
        {recent.map((run) => (
          <span
            key={run.id}
            title={`${statusLabel(run.status)} · ${formatRelative(run.startedAt || run.completedAt)}`}
            className={cn("h-3.5 w-1.5 rounded-[2px]", TICK[statusTone(run.status)] ?? "bg-border-strong")}
          />
        ))}
      </span>
      <span>
        Last run:{" "}
        <span className={cn("font-medium", lastTone === "failed" ? "text-destructive" : lastTone === "passed" ? "text-pass" : "text-foreground")}>
          {statusLabel(last.status)}
        </span>{" "}
        · <span className="tabular-nums">{formatRelative(last.startedAt || last.completedAt)}</span>
      </span>
      {passRate != null ? (
        <span>
          Pass rate <span className="font-medium text-foreground tabular-nums">{passRate}%</span>
        </span>
      ) : null}
    </span>
  );
}
