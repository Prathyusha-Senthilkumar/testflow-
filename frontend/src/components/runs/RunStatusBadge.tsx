import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Visual tone for a run/test status. Passed = brand blue, Failed = muted coral. */
export type StatusTone = "neutral" | "running" | "passed" | "failed" | "warning" | "cancelled";

/** Canonical status keys TestFlow renders. Unknown strings fall back to `neutral`. */
export type RunStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "completed"
  | "skipped"
  | "untested"
  | "scheduled"
  | "preparing"
  | "error"
  | "not_run";

const TONES: Record<string, StatusTone> = {
  queued: "neutral",
  scheduled: "neutral",
  preparing: "neutral",
  untested: "neutral",
  not_run: "neutral",
  pending: "neutral",
  running: "running",
  in_progress: "running",
  passed: "passed",
  success: "passed",
  failed: "failed",
  error: "failed",
  timed_out: "warning",
  timeout: "warning",
  skipped: "warning",
  cancelled: "cancelled",
  canceled: "cancelled",
  completed: "neutral",
};

const LABELS: Record<string, string> = {
  timed_out: "Timed out",
  timeout: "Timed out",
  in_progress: "Running",
  canceled: "Cancelled",
  not_run: "Not run",
};

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-elevated text-muted-foreground",
  running: "bg-info-soft text-brand-accent",
  passed: "bg-pass-soft text-pass",
  failed: "bg-destructive-soft text-destructive",
  warning: "bg-warning-soft text-warning",
  cancelled: "border border-dashed border-border text-muted-foreground",
};

/** Normalises any casing/spacing ("Timed out", "TIMED_OUT") to a key. */
export function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function statusTone(status: string | null | undefined): StatusTone {
  return TONES[normalizeStatus(status)] ?? "neutral";
}

export function statusLabel(status: string | null | undefined): string {
  const key = normalizeStatus(status);
  if (!key) return "Unknown";
  if (LABELS[key]) return LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

/** Text-colour class for a tone, for inline icons and counts. */
export function statusTextClass(status: string | null | undefined): string {
  const tone = statusTone(status);
  if (tone === "passed") return "text-pass";
  if (tone === "failed") return "text-destructive";
  if (tone === "running") return "text-info";
  if (tone === "warning") return "text-warning";
  return "text-muted-foreground";
}

type RunStatusBadgeProps = {
  /** Any status string; case-insensitive (e.g. "passed", "Timed out", "TIMED_OUT"). */
  status: RunStatus | (string & {});
  /** Override the visible label (e.g. "Completed with failures"). */
  label?: string;
  className?: string;
};

/**
 * Status pill for test runs and test cases: Queued, Running, Passed, Failed,
 * Cancelled, Timed out (plus Completed, Skipped, Untested, Scheduled).
 */
export function RunStatusBadge({ status, label, className }: RunStatusBadgeProps) {
  const tone = statusTone(status);
  const text = label ?? statusLabel(status);
  return (
    <span
      data-slot="run-status-badge"
      data-status={normalizeStatus(status)}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className
      )}
    >
      {tone === "passed" ? (
        <Check aria-hidden className="size-3" strokeWidth={2.5} />
      ) : (
      <span aria-hidden className="relative flex size-1.5">
        {tone === "running" ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
        ) : null}
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      )}
      {text}
    </span>
  );
}
