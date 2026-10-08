import { cn } from "@/lib/utils";

const SIZES = { sm: "size-4", md: "size-8", lg: "size-14" } as const;

type AttestLoaderProps = {
  /** sm 16px (inline, buttons), md 32px, lg 56px (full page). */
  size?: keyof typeof SIZES;
  /** Accessible status text. */
  label?: string;
  /** Purely visual (no status role); use when a surrounding element already announces. */
  decorative?: boolean;
  /** `brand` (default) or `current`: draw in currentColor, e.g. on a primary button. */
  tone?: "brand" | "current";
  className?: string;
};

/**
 * Branded loading animation: the A's legs draw in, then the tick crossbar,
 * a short hold, a quiet fade, loop (CSS keyframes in globals.css). No glow or
 * flash. Reduced motion shows a static mark with a gentle opacity pulse.
 * Server-component safe (no JS).
 */
export function AttestLoader({ size = "md", label = "Loading", decorative = false, tone = "brand", className }: AttestLoaderProps) {
  const legs = tone === "current" ? "currentColor" : "var(--primary)";
  const tick = tone === "current" ? "currentColor" : "var(--brand-accent)";
  return (
    <span role={decorative ? undefined : "status"} aria-live={decorative ? undefined : "polite"} className={cn("inline-flex shrink-0", className)}>
      <svg viewBox="0 0 64 64" fill="none" aria-hidden className={cn("attest-loader", SIZES[size])}>
        <path
          data-part="legs"
          d="M10 54L32 10l22 44"
          stroke={legs}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
        />
        <path
          data-part="tick"
          d="M17.5 37.5l7.5 7.5L40.5 27.5"
          stroke={tick}
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={36}
        />
      </svg>
      {decorative ? null : <span className="sr-only">{label}</span>}
    </span>
  );
}

/** Full-area centred loader (app start / auth gate). */
export function AttestLoaderScreen({ label = "Loading Attest", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("grid min-h-[50vh] w-full place-items-center", className)}>
      <AttestLoader size="lg" label={label} />
    </div>
  );
}

/**
 * Centred lg loader shown over a skeleton for the first ~300ms only, then it
 * fades away and the skeleton remains (CSS only; works in server components).
 */
export function AttestLoaderIntro() {
  return (
    <div aria-hidden className="attest-loader-intro pointer-events-none absolute inset-0 z-10 grid place-items-center bg-canvas/70">
      <AttestLoader size="lg" decorative />
    </div>
  );
}
