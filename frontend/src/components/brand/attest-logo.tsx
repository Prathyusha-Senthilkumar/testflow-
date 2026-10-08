import { cn } from "@/lib/utils";

type MarkProps = {
  className?: string;
  /**
   * `tile` is the app icon (same as the favicon): white A and periwinkle tick on a dawn-blue
   * rounded square, identical in light and dark. `onPrimary` draws the bare mark in
   * primary-foreground for use on a primary fill.
   */
  variant?: "default" | "onPrimary" | "tile";
  /** Accessible name; omit when the wordmark is rendered next to it. */
  title?: string;
};

/**
 * Attest mark, "check peak": the legs of an A, with a tick as its crossbar.
 * All artwork lives here so a variant swap touches only this component.
 * Colours come from theme tokens only.
 */
export function AttestMark({ className, variant = "default", title }: MarkProps) {
  if (variant === "tile") {
    return (
      <svg
        data-slot="attest-mark"
        viewBox="0 0 64 64"
        fill="none"
        role={title ? "img" : undefined}
        aria-hidden={title ? undefined : true}
        aria-label={title}
        className={cn("size-6 shrink-0", className)}
      >
        <rect width="64" height="64" rx="14" fill="var(--brand)" />
        <g transform="translate(10 10) scale(0.6875)" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M10 54L32 10l22 44" stroke="var(--brand-tile-fg)" strokeWidth="6" />
          <path d="M17.5 37.5l7.5 7.5L40.5 27.5" stroke="var(--brand-tick)" strokeWidth="5.5" />
        </g>
      </svg>
    );
  }
  const onPrimary = variant === "onPrimary";
  const legs = onPrimary ? "var(--primary-foreground)" : "var(--primary)";
  const tick = onPrimary ? "var(--primary-foreground)" : "var(--brand-accent)";

  return (
    <svg
      data-slot="attest-mark"
      viewBox="0 0 64 64"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("size-6 shrink-0", className)}
    >
      <path d="M10 54L32 10l22 44" stroke={legs} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M17.5 37.5l7.5 7.5L40.5 27.5" stroke={tick} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  /** Classes for the mark (size). */
  markClassName?: string;
  /** Classes for the wordmark (font size). */
  wordmarkClassName?: string;
  variant?: "default" | "onPrimary" | "tile";
};

/** Mark + "Attest" wordmark. */
export function AttestLogo({ className, markClassName, wordmarkClassName, variant = "default" }: LogoProps) {
  return (
    <span data-slot="attest-logo" className={cn("inline-flex items-center gap-2", className)}>
      <AttestMark variant={variant} className={markClassName} />
      <span
        className={cn(
          "text-[15px] leading-none font-semibold tracking-[-0.03em]",
          variant === "onPrimary" ? "text-primary-foreground" : "text-foreground",
          wordmarkClassName
        )}
      >
        Attest
      </span>
    </span>
  );
}
