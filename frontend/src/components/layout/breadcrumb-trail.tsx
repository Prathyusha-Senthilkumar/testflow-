"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { Link, useLocation, useSearchParams } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { crumbsForPath, type CrumbSpec } from "@/components/layout/breadcrumbs";
import { useEntity } from "@/components/layout/shell-context";

/** A crumb after entity resolution. `label === undefined` means still loading. */
type ResolvedCrumb = { key: string; label?: string; to?: string };

function Separator() {
  return <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/50" />;
}

function CrumbText({ crumb, current }: { crumb: ResolvedCrumb; current: boolean }) {
  if (crumb.label === undefined) {
    return <Skeleton aria-label="Loading" className="inline-block h-3.5 w-20 align-middle" />;
  }
  const text = (
    <span className={cn("block truncate", current ? "max-w-[40ch] font-medium text-foreground" : "max-w-[24ch]")}>{crumb.label}</span>
  );
  // Tooltip only matters when the label can be truncated.
  if (crumb.label.length < 24) return text;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{text}</TooltipTrigger>
      <TooltipContent>{crumb.label}</TooltipContent>
    </Tooltip>
  );
}

function CrumbNode({ crumb, current }: { crumb: ResolvedCrumb; current: boolean }) {
  if (current || !crumb.to) {
    return (
      <span aria-current={current ? "page" : undefined} className={cn("flex min-w-0 items-center", current ? "text-foreground" : "text-muted-foreground")}>
        <CrumbText crumb={crumb} current={current} />
      </span>
    );
  }
  return (
    <Link
      to={crumb.to}
      className="flex min-w-0 items-center rounded-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <CrumbText crumb={crumb} current={false} />
    </Link>
  );
}

/** Resolves one spec (and, for runs, its parent test case) into display crumbs. */
function useResolved(spec: CrumbSpec | undefined, index: number): ResolvedCrumb[] {
  const entity = useEntity(spec?.entity?.kind ?? "project", spec?.entity?.id, spec?.entity?.projectId);
  const parentId = spec?.withRunParent ? entity?.testCaseId : undefined;
  const parent = useEntity("testCase", parentId, spec?.entity?.projectId);
  if (!spec) return [];
  const own: ResolvedCrumb = { key: `${index}`, to: spec.to, label: spec.entity ? entity?.name : spec.label };
  if (!spec.withRunParent || !parentId || !spec.entity?.projectId) return [own];
  return [
    { key: `${index}-parent`, to: `/projects/${spec.entity.projectId}/test-cases/${parentId}`, label: parent?.name },
    own,
  ];
}

const MAX_SPECS = 6;

/**
 * Breadcrumbs from the single route map. Entity names come from the shell
 * registry (published by views or looked up once). On narrow widths the
 * middle crumbs collapse into a "…" menu so the first and last stay visible.
 */
export function BreadcrumbTrail({ pathname: pathnameOverride }: { pathname?: string }) {
  const location = useLocation();
  const searchParams = useSearchParams();
  const pathname = pathnameOverride ?? location.pathname;
  const specs = crumbsForPath(pathname, searchParams).slice(0, MAX_SPECS);

  // Fixed number of hook calls regardless of route depth.
  const r0 = useResolved(specs[0], 0);
  const r1 = useResolved(specs[1], 1);
  const r2 = useResolved(specs[2], 2);
  const r3 = useResolved(specs[3], 3);
  const r4 = useResolved(specs[4], 4);
  const r5 = useResolved(specs[5], 5);
  const crumbs = [r0, r1, r2, r3, r4, r5].flat();

  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLOListElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const signature = crumbs.map((crumb) => crumb.label ?? "…").join("|");

  // Collapse the middle crumbs only when the full trail would not fit.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure) return;
    const update = () => setOverflowing(measure.scrollWidth > nav.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [signature]);

  if (crumbs.length === 0) return null;
  const first = crumbs[0];
  const last = crumbs[crumbs.length - 1];
  const middle = crumbs.slice(1, -1);
  const collapsed = crumbs.length > 2 && overflowing;

  return (
    <nav ref={navRef} aria-label="Breadcrumb" className="relative min-w-0 overflow-hidden">
      {/* Invisible full-width copy used only to measure whether the trail fits. */}
      <ol ref={measureRef} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex items-center gap-1.5 text-[13px] whitespace-nowrap">
        {crumbs.map((crumb, index) => (
          <li key={crumb.key} className="flex items-center gap-1.5">
            {index > 0 ? <Separator /> : null}
            <span className={index === crumbs.length - 1 ? "font-medium" : undefined}>{crumb.label ?? "xxxxxxxxxxxx"}</span>
          </li>
        ))}
      </ol>
      {/* Full trail */}
      <ol className={cn("flex min-w-0 items-center gap-1.5 text-[13px]", collapsed && "hidden")}>
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.key}>
            {index > 0 ? <li aria-hidden className="flex"><Separator /></li> : null}
            <li className={cn("flex min-w-0 items-center", index === crumbs.length - 1 ? "shrink" : "shrink-0")}>
              <CrumbNode crumb={crumb} current={index === crumbs.length - 1} />
            </li>
          </Fragment>
        ))}
      </ol>
      {/* Collapsed trail: first › … › last */}
      {collapsed ? (
        <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <li className="flex shrink-0 items-center">
            <CrumbNode crumb={first} current={false} />
          </li>
          <li aria-hidden className="flex"><Separator /></li>
          <li className="flex shrink-0 items-center">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Show hidden breadcrumbs"
                className="grid size-6 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                {middle.map((crumb) =>
                  crumb.to ? (
                    <DropdownMenuItem key={crumb.key} asChild>
                      <Link to={crumb.to}>
                        {crumb.label ?? "Loading…"}
                      </Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem key={crumb.key} disabled>
                      {crumb.label ?? "Loading…"}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
          <li aria-hidden className="flex"><Separator /></li>
          <li className="flex min-w-0 items-center">
            <CrumbNode crumb={last} current />
          </li>
        </ol>
      ) : null}
    </nav>
  );
}
