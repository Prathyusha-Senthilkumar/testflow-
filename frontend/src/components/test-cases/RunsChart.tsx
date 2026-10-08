"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { TestRunHistoryItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { axisTick, chartColors } from "@/components/charts/chart-theme";
import { ChartLegend } from "@/components/charts/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { RunStatusBadge, statusTone } from "@/components/runs/RunStatusBadge";
import { formatDurationMs } from "@/components/test-cases/testCaseFormat";

type RunPoint = {
  id: string;
  label: string;
  when: string;
  status: string;
  seconds: number;
};

function toPoints(runs: TestRunHistoryItem[]): RunPoint[] {
  return runs
    .filter((run) => run.startedAt || run.completedAt)
    .slice(0, 30)
    .reverse()
    .map((run) => {
      const at = new Date(run.startedAt || run.completedAt || "");
      return {
        id: run.id,
        label: at.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        when: at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
        status: run.status,
        // Live runs have no duration yet; give them a small visible stub.
        seconds: run.durationMs != null ? Math.max(run.durationMs / 1000, 0.05) : 0.05,
      };
    });
}

function colorFor(status: string): string {
  const tone = statusTone(status);
  if (tone === "passed") return chartColors.passed;
  if (tone === "failed") return chartColors.failed;
  if (tone === "running") return "var(--info)";
  return "var(--border-strong)";
}

function RunTooltip({ active, payload }: Partial<TooltipContentProps<ValueType, NameType>>) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as RunPoint | undefined;
  if (!point) return null;
  return (
    <div className="min-w-40 rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-float">
      <p className="mb-1.5 font-medium tabular-nums">{point.when}</p>
      <div className="flex items-center justify-between gap-3">
        <RunStatusBadge status={point.status} />
        <span className="font-medium tabular-nums">{formatDurationMs(point.seconds * 1000)}</span>
      </div>
    </div>
  );
}

/** One bar per run (height = duration), coloured by outcome, oldest → newest. */
export function RunsChart({ runs, loading, className }: { runs: TestRunHistoryItem[]; loading?: boolean; className?: string }) {
  const points = toPoints(runs);
  const passed = runs.filter((run) => statusTone(run.status) === "passed").length;
  const failed = runs.filter((run) => statusTone(run.status) === "failed").length;
  const maxSeconds = Math.max(1, ...points.map((point) => point.seconds));
  const yWidth = Math.max(40, `${Math.ceil(maxSeconds)}s`.length * 8 + 16);

  return (
    <section aria-label="Recent runs chart" className={cn("rounded-lg border border-border bg-surface px-4 pt-3 pb-2", className)}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium text-foreground">
          Recent runs <span className="font-normal text-muted-foreground">· duration per run</span>
        </h2>
        <ChartLegend
          items={[
            { label: "Passed", color: chartColors.passed, value: String(passed) },
            { label: "Failed", color: chartColors.failed, value: String(failed) },
          ]}
        />
      </div>
      {loading ? (
        <Skeleton className="h-28 w-full" />
      ) : points.length === 0 ? (
        <p className="grid h-28 place-items-center text-[13px] text-muted-foreground">No runs yet. Run the test to start its history.</p>
      ) : (
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} stroke={chartColors.grid} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: chartColors.baseline }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis
                width={yWidth}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                allowDecimals={false}
                tickFormatter={(value: number) => `${value}s`}
              />
              <Tooltip cursor={{ fill: chartColors.cursor }} content={<RunTooltip />} />
              <Bar dataKey="seconds" name="Duration" maxBarSize={28} minPointSize={3} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {points.map((point) => (
                  <Cell key={point.id} fill={colorFor(point.status)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
