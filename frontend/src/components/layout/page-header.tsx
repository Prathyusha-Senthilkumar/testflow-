import type * as React from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AttestLoader } from "@/components/brand/attest-loader";

type PageContainerProps = {
  children: ReactNode;
  /**
   * `full`: dashboards, tables, run/log views use all available width.
   * `form`: settings and forms, constrained to ~768px.
   * `detail`: detail pages; pair with `DetailLayout` for a side panel at xl.
   */
  width?: "full" | "form" | "detail";
  className?: string;
};

/** Page padding + width strategy. Every view's root. */
export function PageContainer({ children, width = "full", className }: PageContainerProps) {
  return (
    <div
      data-slot="page"
      className={cn(
        "flex w-full flex-col gap-6 p-4 sm:p-6",
        width === "form" && "mx-auto max-w-3xl",
        width === "detail" && "mx-auto max-w-[1600px]",
        className
      )}
    >
      {children}
    </div>
  );
}

type PageHeaderProps = {
  title: ReactNode;
  /** One line describing the page. */
  description?: ReactNode;
  /** Primary action(s), right-aligned. */
  actions?: ReactNode;
  /** Small inline meta under the title (badges, ids). */
  meta?: ReactNode;
  /** @deprecated Eyebrows are no longer rendered; breadcrumbs live in the global header. */
  eyebrow?: ReactNode;
  className?: string;
};

/** Level-2 header: 24px semibold title, one-line description, actions on the right. */
export function PageHeader({ title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <div data-slot="page-header" className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl leading-8 font-semibold tracking-[-0.015em] text-foreground">{title}</h1>
        {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type SectionHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Filters and actions, right-aligned. */
  actions?: ReactNode;
  /** Optional count shown next to the title. */
  count?: number;
  className?: string;
  as?: "h2" | "h3";
  /** Show the small Attest loader next to the title while the section loads. */
  loading?: boolean;
};

/** Level-3 header for a section within a page (14–16px). */
export function SectionHeader({ title, description, actions, count, className, as: Heading = "h2", loading = false }: SectionHeaderProps) {
  return (
    <div data-slot="section-header" className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <Heading className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          {title}
          {typeof count === "number" ? (
            <span className="rounded-sm bg-elevated px-1.5 text-xs font-medium text-muted-foreground tabular-nums">{count}</span>
          ) : null}
          {loading ? <AttestLoader size="sm" label="Loading section" /> : null}
        </Heading>
        {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Main content + side panel; the panel stacks below on small screens and sits right at xl. */
export function DetailLayout({
  main,
  aside,
  className,
  stickyAside = true,
  asideWidth = 340,
}: {
  main: ReactNode;
  aside: ReactNode;
  className?: string;
  /** Pin the side panel while the main column scrolls. Turn off for panels taller than the viewport. */
  stickyAside?: boolean;
  asideWidth?: number;
}) {
  return (
    <div
      style={{ "--aside-w": `${asideWidth}px` } as React.CSSProperties}
      className={cn("grid gap-6 xl:grid-cols-[minmax(0,1fr)_var(--aside-w)]", className)}
    >
      <div className="min-w-0 space-y-6">{main}</div>
      <aside className={cn("min-w-0 space-y-6", stickyAside && "xl:sticky xl:top-6 xl:self-start")}>{aside}</aside>
    </div>
  );
}
