import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type StatProps = {
  label: string;
  value: ReactNode;
  /** Small secondary line under the value. */
  hint?: ReactNode;
  icon?: LucideIcon;
  /** Status signal: a small coloured dot before the label (the value stays neutral). */
  tone?: "default" | "success" | "destructive" | "warning" | "info";
  loading?: boolean;
  /** `lg` = 28px value (report/dashboard KPIs). */
  size?: "default" | "lg";
  /** Optional trailing visual, e.g. a Sparkline, shown right of the value. */
  chart?: ReactNode;
  className?: string;
};

/** Tone is signalled by a small dot in the label row; the number itself stays in foreground. */
const toneDot = {
  default: null,
  success: "bg-pass",
  destructive: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
} as const;

/** One metric tile. Place several inside a `StatGroup` (one surface, divided cells). */
export function Stat({ label, value, hint, icon: Icon, tone = "default", loading, size = "default", chart, className }: StatProps) {
  return (
    <div data-slot="stat" className={cn("min-w-0 px-4 py-3.5", className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {toneDot[tone] ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneDot[tone])} /> : null}
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div
          className={cn(
            "font-semibold tracking-tight text-foreground tabular-nums",
            size === "lg" ? "text-[28px] leading-9" : "text-2xl leading-8"
          )}
        >
          {loading ? <Skeleton className={cn("h-5 w-12", size === "lg" ? "my-2" : "my-1.5")} /> : value}
        </div>
        {chart && !loading ? <div className="mb-1 h-8 w-20 shrink-0">{chart}</div> : null}
      </div>
      {hint ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** A single bordered surface holding a row of Stats separated by 1px dividers. */
export function StatGroup({ children, className, columns = 4 }: { children: ReactNode; className?: string; columns?: 2 | 3 | 4 | 5 | 6 }) {
  const cols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-3 lg:grid-cols-5",
    6: "sm:grid-cols-3 lg:grid-cols-6",
  }[columns];
  return (
    <div data-slot="stat-group" className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}>
      {/* Cells draw their right/bottom divider; the negative margin hides the outer edge ones. */}
      <div className={cn("-mr-px -mb-px grid grid-cols-2 [&>*]:shadow-[inset_-1px_-1px_0_var(--color-border)]", cols)}>
        {children}
      </div>
    </div>
  );
}
