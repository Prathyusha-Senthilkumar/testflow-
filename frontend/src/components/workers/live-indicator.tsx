"use client";

import { cn } from "@/lib/utils";
import { formatAgo } from "@/lib/workers";
import { useNow } from "@/components/workers/use-now";

/** Pulsing "Live" dot plus a ticking "Last updated Ns ago". */
export function LiveIndicator({ updatedAt, paused = false, className }: { updatedAt: number | null; paused?: boolean; className?: string }) {
  const now = useNow(1000);
  const age = updatedAt ? Math.max(0, (now - updatedAt) / 1000) : null;
  return (
    <div className={cn("flex items-center gap-3 text-[13px]", className)}>
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <span aria-hidden className="relative flex size-2">
          {!paused ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-accent opacity-60" /> : null}
          <span className={cn("relative inline-flex size-2 rounded-full", paused ? "bg-muted-foreground" : "bg-brand-accent")} />
        </span>
        {paused ? "Paused" : "Live"}
      </span>
      <span className="text-muted-foreground tabular-nums" aria-live="off">
        {age == null ? "Waiting for data…" : `Last updated ${formatAgo(age)}`}
      </span>
    </div>
  );
}
