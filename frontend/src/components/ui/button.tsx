import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "default"
  | "outline";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "default" | "sm";
  loading?: boolean;
};

function resolveVariant(variant: ButtonVariant): "primary" | "secondary" | "danger" | "ghost" {
  if (variant === "default") return "primary";
  if (variant === "outline") return "secondary";
  return variant;
}

export function Button({
  className,
  variant = "primary",
  size = "default",
  loading = false,
  disabled,
  children,
  type = "button",
  ...props
}: Props) {
  const resolved = resolveVariant(variant);
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50",
        size === "default" && "h-10 px-4",
        size === "sm" && "h-8 px-3 text-xs",
        resolved === "primary" && "bg-indigo-600 text-white hover:bg-indigo-700",
        resolved === "secondary" && "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
        resolved === "danger" && "bg-red-600 text-white hover:bg-red-700",
        resolved === "ghost" && "text-slate-700 hover:bg-slate-100",
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
