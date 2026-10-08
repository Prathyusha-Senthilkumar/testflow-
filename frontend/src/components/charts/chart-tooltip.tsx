"use client";

import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

type ChartTooltipContentProps = Partial<TooltipContentProps<ValueType, NameType>> & {
  /** Format each value (defaults to the raw number). */
  valueFormatter?: (value: number) => string;
  /** Optional footer, e.g. a total, computed from the hovered datum. */
  footer?: (datum: Record<string, unknown>) => string | null;
};

/**
 * Themed recharts tooltip: popover surface, colour swatch per series, text in
 * text tokens (never the series colour), tabular numbers.
 */
export function ChartTooltipContent({ active, payload, label, valueFormatter, footer }: ChartTooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = (payload[0]?.payload ?? {}) as Record<string, unknown>;
  const footerText = footer?.(datum) ?? null;

  return (
    <div className="min-w-36 rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-float">
      {label !== undefined && label !== null ? <p className="mb-1.5 font-medium">{String(label)}</p> : null}
      <ul className="space-y-1">
        {payload.map((entry) => {
          const value = typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);
          return (
            <li key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2">
              <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: entry.color }} />
              <span className="text-muted-foreground">{entry.name}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums">{valueFormatter ? valueFormatter(value) : value}</span>
            </li>
          );
        })}
      </ul>
      {footerText ? <p className="mt-1.5 border-t border-border pt-1.5 text-muted-foreground tabular-nums">{footerText}</p> : null}
    </div>
  );
}

/** Legend row: swatch + label + optional value, in text tokens. */
export function ChartLegend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ background: item.color }} />
          {item.label}
          {item.value ? <span className="font-medium text-foreground tabular-nums">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}
