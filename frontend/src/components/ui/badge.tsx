import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "default" | "success" | "error" | "warning" | "info";

type Props = {
  children: ReactNode;
  variant?: BadgeVariant;
  /** @deprecated Prefer `variant`. Maps legacy status strings to variants. */
  status?: string;
  className?: string;
};

function variantFromStatus(status?: string): BadgeVariant {
  if (status === "Passed") return "success";
  if (status === "Failed") return "error";
  if (status === "Running") return "info";
  if (status === "Skipped") return "warning";
  return "default";
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-700",
  error: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-800",
  info: "bg-indigo-50 text-indigo-700",
};

export function Badge({ children, variant, status, className }: Props) {
  const resolved = variant ?? variantFromStatus(status);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        variantStyles[resolved],
        className
      )}
    >
      {children}
    </span>
  );
}
