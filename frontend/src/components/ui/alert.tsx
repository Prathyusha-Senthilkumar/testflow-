import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminDetails } from "@/components/common/AdminDetails";

export type AlertVariant = "info" | "success" | "warning" | "error";

const styles: Record<AlertVariant, string> = {
  info: "border-info/30 bg-info-soft text-foreground [&_[data-slot=alert-icon]]:text-info",
  success: "border-success/30 bg-success-soft text-foreground [&_[data-slot=alert-icon]]:text-success",
  warning: "border-warning/30 bg-warning-soft text-foreground [&_[data-slot=alert-icon]]:text-warning",
  error: "border-destructive/30 bg-destructive-soft text-foreground [&_[data-slot=alert-icon]]:text-destructive",
};

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: OctagonAlert } as const;

type AlertProps = {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  /** Trailing action (e.g. a Retry button). */
  action?: ReactNode;
  className?: string;
};

/**
 * Inline, persistent message for page-level load errors and contextual notes.
 * Use `toast` for transient success/failure of an action instead.
 */
export function Alert({ variant = "info", title, children, action, className }: AlertProps) {
  const Icon = icons[variant];
  return (
    <div
      data-slot="alert"
      role={variant === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px]", styles[variant], className)}
    >
      <Icon data-slot="alert-icon" aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn("break-words", title ? "mt-0.5 text-muted-foreground" : undefined)}>{children}</div> : null}
        {/* Friendly errors keep the operator detail behind a collapsed disclosure. */}
        {typeof children === "string" ? <AdminDetails message={children} /> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
