import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Primary/secondary actions, usually Buttons. */
  action?: ReactNode;
  className?: string;
  /** `panel` draws its own dashed border; `plain` sits inside an existing surface. */
  variant?: "panel" | "plain";
  size?: "default" | "sm";
};

/** Designed empty state: icon tile, title, one-line explanation and an action. */
export function EmptyState({ icon: Icon, title, description, action, className, variant = "plain", size = "default" }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "sm" ? "px-4 py-8" : "px-6 py-14",
        variant === "panel" && "rounded-lg border border-dashed border-border bg-surface",
        className
      )}
    >
      {Icon ? (
        <span className="mb-3 grid size-10 place-items-center rounded-md border border-border bg-elevated text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
