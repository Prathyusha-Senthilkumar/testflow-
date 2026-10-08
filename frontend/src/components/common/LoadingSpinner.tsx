"use client";

import { AttestLoader } from "@/components/brand/attest-loader";
import { cn } from "@/lib/utils";

type LoadingSpinnerProps = {
  label?: string;
  compact?: boolean;
  className?: string;
};

export function LoadingSpinner({ label = "Loading…", compact = false, className = "" }: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center text-[13px] text-muted-foreground", compact ? "gap-2" : "justify-center gap-2.5 py-10", className)}
    >
      <AttestLoader size={compact ? "sm" : "md"} decorative />
      <span>{label}</span>
    </div>
  );
}
