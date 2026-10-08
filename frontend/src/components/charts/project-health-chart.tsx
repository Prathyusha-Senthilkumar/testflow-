"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartTooltipContent } from "@/components/charts/chart-tooltip";
import { axisTick, chartColors } from "@/components/charts/chart-theme";

export type ProjectHealthDatum = {
  id: string;
  name: string;
  passed: number;
  failed: number;
};

type ProjectHealthChartProps = {
  data: ProjectHealthDatum[];
  loading?: boolean;
  className?: string;
  onSelect?: (id: string) => void;
};

const ROW_HEIGHT = 34;

/** Horizontal stacked bars: latest passed vs failed test cases per project. */
export function ProjectHealthChart({ data, loading = false, className, onSelect }: ProjectHealthChartProps) {
  if (loading) {
    return (
      <div className={cn("space-y-3 py-2", className)} aria-busy="true">
        {[80, 55, 70].map((width, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    );
  }

  const height = Math.max(120, data.length * ROW_HEIGHT + 32);

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
          barCategoryGap="30%"
          onClick={(state) => {
            const index = Number(state?.activeTooltipIndex ?? -1);
            const datum = Number.isInteger(index) && index >= 0 ? data[index] : undefined;
            if (datum && onSelect) onSelect(datum.id);
          }}
          style={onSelect ? { cursor: "pointer" } : undefined}
        >
          <CartesianGrid horizontal={false} stroke={chartColors.grid} />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} tickMargin={6} />
          <YAxis
            type="category"
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickMargin={8}
            width={132}
            tickFormatter={(value: string) => (value.length > 18 ? `${value.slice(0, 17)}…` : value)}
          />
          <Tooltip
            cursor={{ fill: chartColors.cursor }}
            content={(props) => (
              <ChartTooltipContent
                {...props}
                footer={(datum) => {
                  const passed = Number(datum.passed ?? 0);
                  const failed = Number(datum.failed ?? 0);
                  const total = passed + failed;
                  return total ? `${Math.round((passed / total) * 100)}% passing` : "Not run yet";
                }}
              />
            )}
          />
          <Bar dataKey="failed" name="Failed" stackId="cases" fill={chartColors.failed} stroke={chartColors.surface} strokeWidth={1} maxBarSize={16} isAnimationActive={false} />
          <Bar dataKey="passed" name="Passed" stackId="cases" fill={chartColors.passed} stroke={chartColors.surface} strokeWidth={1} radius={[0, 3, 3, 0]} maxBarSize={16} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
