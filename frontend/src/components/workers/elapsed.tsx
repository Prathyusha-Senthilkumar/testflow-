"use client";

import { formatDurationSec, secondsSince } from "@/lib/workers";
import { useNow } from "@/components/workers/use-now";

/** Live-ticking elapsed time since `startedAt`. */
export function Elapsed({ startedAt, className }: { startedAt?: string | null; className?: string }) {
  const now = useNow(1000);
  return <span className={className ?? "tabular-nums"}>{formatDurationSec(secondsSince(startedAt, now))}</span>;
}
