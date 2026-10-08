import { cn } from "@/lib/utils";
import { ratio } from "@/lib/workers";

type MeterProps = {
  value: number;
  max: number;
  label: string;
  /** Text after the label, e.g. "412 MB" or "1.2 / 4". */
  valueText: string;
  /** Turns warning above this ratio (default 0.85). */
  warnAt?: number;
  className?: string;
};

/** Small labelled horizontal meter. Warning colour only when near the limit. */
export function Meter({ value, max, label, valueText, warnAt = 0.85, className }: MeterProps) {
  const fraction = ratio(value, max);
  const warn = fraction >= warnAt;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("tabular-nums", warn ? "text-warning" : "text-foreground")}>{valueText}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated"
      >
        <div className={cn("h-full rounded-full transition-[width] duration-300", warn ? "bg-warning" : "bg-primary")} style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  );
}
