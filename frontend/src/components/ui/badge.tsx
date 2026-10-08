import type { ReactNode } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

export type BadgeVariant = "default" | "success" | "error" | "warning" | "info" | "outline" | "primary" | "ok";

export const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-xs font-medium tabular-nums [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-elevated text-muted-foreground",
        outline: "border border-border text-muted-foreground",
        primary: "bg-info-soft text-brand-accent",
        success: "bg-pass-soft text-pass",
        /** Live/health state: session Active, runner Online, browser Ready, Enabled. */
        ok: "bg-ok-soft text-ok",
        error: "bg-destructive-soft text-destructive",
        warning: "bg-warning-soft text-warning",
        info: "bg-info-soft text-info",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

type Props = {
  children: ReactNode;
  variant?: BadgeVariant;
  /** @deprecated Prefer `variant`. Maps legacy status strings to variants. */
  status?: string;
  /** Show a leading status dot. */
  dot?: boolean;
  className?: string;
  title?: string;
};

function variantFromStatus(status?: string): BadgeVariant {
  if (status === "Passed") return "success";
  if (status === "Failed") return "error";
  if (status === "Running") return "info";
  if (status === "Skipped") return "warning";
  return "default";
}

export function Badge({ children, variant, status, dot, className, title }: Props) {
  const resolved = variant ?? variantFromStatus(status);

  return (
    <span data-slot="badge" data-variant={resolved} title={title} className={cn(badgeVariants({ variant: resolved }), className)}>
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
