"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { cn } from "@/lib/utils";

type SparklineProps = {
  /** Values in chronological order. */
  data: number[];
  /** Stroke colour as a CSS value; defaults to a neutral muted ink. */
  color?: string;
  className?: string;
  /** Accessible summary, e.g. "Failed runs per day, last 14 days". */
  label?: string;
};

/** Tiny, non-interactive trend line for stat tiles. Hidden when there's nothing to show. */
export function Sparkline({ data, color = "var(--muted-foreground)", className, label }: SparklineProps) {
  if (data.length < 2 || data.every((value) => value === 0)) return null;
  const points = data.map((value, index) => ({ index, value }));
  return (
    <div className={cn("h-7 w-20 shrink-0", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 1, bottom: 2, left: 1 }}>
          <YAxis hide domain={[0, "dataMax"]} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={color}
            fillOpacity={0.12}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
