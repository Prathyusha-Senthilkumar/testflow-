import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { Outcome } from "@/lib/dashboard";

/** Section header + bordered surface used by every dashboard panel. */
export function Panel({
  title,
  description,
  viewAllHref,
  viewAllLabel = "View all",
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  viewAllHref?: string;
  viewAllLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("flex min-w-0 scroll-mt-6 flex-col gap-2", className)}>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-foreground">{title}</h2>
          {description ? <p className="truncate text-xs text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {viewAllHref ? (
            <Link to={viewAllHref} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground hover:underline">
              {viewAllLabel} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>
      <div className={cn("min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface", bodyClassName)}>{children}</div>
    </section>
  );
}

const tickClass: Record<Outcome, string> = {
  passed: "bg-pass",
  failed: "bg-destructive",
  other: "bg-border-strong",
};

/** Strip of small ticks, one per result (chronological, newest on the right). */
export function OutcomeTicks({ outcomes, slots = 14, className }: { outcomes: Outcome[]; slots?: number; className?: string }) {
  const padded: (Outcome | null)[] = [...Array(Math.max(0, slots - outcomes.length)).fill(null), ...outcomes.slice(-slots)];
  const passed = outcomes.filter((outcome) => outcome === "passed").length;
  const failed = outcomes.filter((outcome) => outcome === "failed").length;
  return (
    <span
      role="img"
      aria-label={`Last ${outcomes.length} results: ${passed} passed, ${failed} failed`}
      className={cn("inline-flex h-3.5 items-end gap-[2px]", className)}
    >
      {padded.map((outcome, index) => (
        <span
          key={index}
          className={cn("w-[3px] rounded-[1px]", outcome ? tickClass[outcome] : "bg-border-subtle", outcome === "failed" ? "h-full" : "h-2.5")}
        />
      ))}
    </span>
  );
}

/**
 * Thin horizontal meter (0–100). With `failShare`, the passing share uses the
 * pass colour and only the failing share is coral.
 */
export function Meter({
  value,
  tone = "brand",
  failShare,
  className,
  label,
}: {
  value: number;
  tone?: "brand" | "success" | "destructive" | "muted";
  /** 0–100: width of a coral segment drawn after the main value (e.g. failing share). */
  failShare?: number;
  className?: string;
  label?: string;
}) {
  const color = { brand: "bg-brand-accent", success: "bg-pass", destructive: "bg-destructive", muted: "bg-muted-foreground" }[tone];
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-elevated", className)}
    >
      <span className={cn("block h-full", color)} style={{ width: `${clamped}%` }} />
      {failShare ? (
        <span className="block h-full bg-destructive" style={{ width: `${Math.max(0, Math.min(100 - clamped, failShare))}%` }} />
      ) : null}
    </span>
  );
}
