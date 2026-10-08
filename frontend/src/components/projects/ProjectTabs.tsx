"use client";

import { Link, useLocation, useParams } from "@/lib/navigation";
import { isNavActive, projectNav } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

/** Project sections as a tab bar across the top of every project page. */
export function ProjectTabs() {
  const { id: projectId = "" } = useParams();
  const { pathname } = useLocation();
  if (!projectId) return null;
  return (
    <nav aria-label="Project" className="border-b border-border px-4 sm:px-6">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {projectNav(projectId).map((item) => {
          const active = isNavActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.to} className="shrink-0">
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 items-center gap-1.5 px-3 text-[13px] font-medium whitespace-nowrap outline-none transition-colors duration-[120ms]",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0",
                  active ? "text-foreground after:opacity-100" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
