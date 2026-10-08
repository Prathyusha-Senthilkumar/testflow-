"use client";

import { Bar, BarChart, CartesianGrid, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { axisTick, chartColors } from "@/components/charts/chart-theme";

export type PassFailPoint = {
  key: string;
  /** Axis label, e.g. "Mon, Oct 6". */
  label: string;
  passed: number;
  failed: number;
  isToday?: boolean;
};

type PassFailTrendChartProps = {
  data: PassFailPoint[];
  loading?: boolean;
  height?: number;
  className?: string;
};

/** Room for the widest y tick (12px tabular digits ≈ 7.5px each) plus the tick margin. */
function yAxisWidth(data: PassFailPoint[]): number {
  const max = Math.max(0, ...data.map((point) => point.passed + point.failed));
  return Math.max(40, String(max).length * 8 + 16);
}

const TOP_RADIUS: [number, number, number, number] = [3, 3, 0, 0];

/** Rounds only the topmost segment of each stacked column (failed sits on the baseline). */
function segmentShape(segment: "failed" | "passed") {
  return function SegmentShape(props: BarShapeProps) {
    const datum = props.payload as PassFailPoint | undefined;
    const isTop = segment === "passed" || !datum || datum.passed === 0;
    return <Rectangle {...props} radius={isTop ? TOP_RADIUS : 0} />;
  };
}

const failedShape = segmentShape("failed");
const passedShape = segmentShape("passed");

function TrendTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload as PassFailPoint | undefined;
  if (!datum) return null;
  const total = datum.passed + datum.failed;
  const rows = [
    { label: "Passed", value: datum.passed, color: chartColors.passed },
    { label: "Failed", value: datum.failed, color: chartColors.failed },
  ];
  return (
    <div className="min-w-40 rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-float">
      <p className="mb-1.5 font-medium">
        {datum.label}
        {datum.isToday ? <span className="ml-1 font-normal text-muted-foreground">(today)</span> : null}
      </p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: row.color }} />
            <span className="text-muted-foreground">{row.label}</span>
            <span className="ml-auto pl-3 font-medium tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-muted-foreground tabular-nums">
        <span>Pass rate</span>
        <span className="font-medium text-foreground">{total ? `${Math.round((datum.passed / total) * 100)}%` : "—"}</span>
      </p>
    </div>
  );
}

/**
 * Stacked daily bars of passed vs failed runs. Failed sits on the baseline so
 * regressions read first; zero-run days render nothing. Today's tick is emphasised.
 */
export function PassFailTrendChart({ data, loading = false, height = 240, className }: PassFailTrendChartProps) {
  if (loading) {
    return (
      <div className={cn("flex items-end gap-3 px-2", className)} style={{ height }} aria-busy="true">
        {[45, 70, 55, 85, 60, 95, 75].map((value, index) => (
          <Skeleton key={index} className="mx-auto w-7 rounded-b-none" style={{ height: `${value}%` }} />
        ))}
      </div>
    );
  }

  const many = data.length > 14;
  const todayLabel = data.find((point) => point.isToday)?.label;

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap={many ? "18%" : "30%"}>
          <CartesianGrid vertical={false} stroke={chartColors.grid} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: chartColors.baseline }}
            interval="preserveStartEnd"
            minTickGap={16}
            tick={({ x, y, payload }: { x: number | string; y: number | string; payload: { value: string } }) => {
              const isToday = payload.value === todayLabel;
              const text = many ? payload.value.replace(/^\w+,\s*/, "") : payload.value;
              return (
                <text
                  x={x}
                  y={y}
                  dy={14}
                  textAnchor="middle"
                  fontSize={axisTick.fontSize}
                  fill={isToday ? "var(--foreground)" : axisTick.fill}
                  fontWeight={isToday ? 600 : 400}
                >
                  {isToday ? `Today` : text}
                </text>
              );
            }}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} tickMargin={6} width={yAxisWidth(data)} />
          <Tooltip cursor={{ fill: chartColors.cursor }} content={(props) => <TrendTooltip active={props.active} payload={props.payload} />} />
          <Bar dataKey="failed" name="Failed" stackId="runs" fill={chartColors.failed} maxBarSize={28} shape={failedShape} isAnimationActive={false} />
          <Bar dataKey="passed" name="Passed" stackId="runs" fill={chartColors.passed} maxBarSize={28} shape={passedShape} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
