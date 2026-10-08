import type { DemoStatus } from "@/lib/demoData";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";

/** Test-case status pill. Thin wrapper over RunStatusBadge for the legacy DemoStatus type. */
export function StatusBadge({ status, className }: { status: DemoStatus; className?: string }) {
  return <RunStatusBadge status={status} className={className} />;
}
