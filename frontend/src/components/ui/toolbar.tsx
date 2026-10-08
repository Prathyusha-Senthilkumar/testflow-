import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ToolbarProps = {
  /** Usually a SearchInput; grows to fill the row. */
  search?: ReactNode;
  /** Pickers (Select) shown after the search; each fixed ~160–200px. */
  filters?: ReactNode;
  /** Right-aligned actions (buttons, counts). */
  actions?: ReactNode;
  /** Stick to the top of the scrolling `main` while the list scrolls. */
  sticky?: boolean;
  className?: string;
  children?: ReactNode;
};

/**
 * One row for list controls: [search grows][filters fixed][actions right],
 * 8px gaps. Wraps on narrow screens.
 */
export function Toolbar({ search, filters, actions, sticky = false, className, children }: ToolbarProps) {
  return (
    <div
      data-slot="toolbar"
      role="toolbar"
      aria-orientation="horizontal"
      className={cn(
        "flex flex-wrap items-center gap-2",
        sticky && "sticky top-0 z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6",
        className
      )}
    >
      {search ? <div className="min-w-[200px] flex-1 basis-64">{search}</div> : null}
      {filters ? <div className="flex flex-wrap items-center gap-2 [&>*]:w-40 sm:[&>*]:w-44">{filters}</div> : null}
      {children}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
