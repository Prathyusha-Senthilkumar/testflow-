/**
 * Chart styling read from theme tokens (CSS variables), so recharts output
 * follows light/dark automatically. Status colours: --chart-pass (brand blue)
 * for Passed, --chart-fail (muted coral) for Failed, --chart-other (grey) otherwise. Categorical series use --chart-1..5 in order.
 */
export const chartColors = {
  passed: "var(--chart-pass)",
  failed: "var(--chart-fail)",
  other: "var(--chart-other)",
  grid: "var(--border-subtle)",
  baseline: "var(--border)",
  axis: "var(--muted-foreground)",
  cursor: "var(--bg-elevated)",
  surface: "var(--bg-surface)",
  series: ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"],
} as const;

export const axisTick = { fill: chartColors.axis, fontSize: 12 } as const;
