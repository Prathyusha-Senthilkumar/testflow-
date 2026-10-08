import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AttestLoader } from "@/components/brand/attest-loader";

type LoadingAreaProps = {
  /** First load in flight: show faint placeholders with a centred loader. */
  loading: boolean;
  /** Short muted label under the loader, e.g. "Loading projects…". */
  label?: string;
  /** Layout-preserving placeholders (skeleton cards/rows) shown at ~40% behind the loader. */
  skeleton?: ReactNode;
  /** The real content once loaded. */
  children?: ReactNode;
  className?: string;
  /** Minimum height of the loading area when there's no skeleton. */
  minHeight?: number;
};

/**
 * One first-load pattern for every area: faint skeleton (no layout jump) with the
 * md Attest loader and a label centred over it. Refetches should keep content
 * visible instead (use a small loader in the section header).
 */
export function LoadingArea({ loading, label = "Loading…", skeleton, children, className, minHeight = 160 }: LoadingAreaProps) {
  if (!loading) return <>{children}</>;
  return (
    <div role="status" aria-busy="true" className={cn("relative", className)} style={skeleton ? undefined : { minHeight }}>
      {skeleton ? <div aria-hidden className="pointer-events-none opacity-40">{skeleton}</div> : null}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2">
        <AttestLoader size="md" decorative />
        <span className="text-[13px] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
