"use client";

import { Link, useLocation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { AttestLogo, AttestMark } from "@/components/brand/attest-logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountMenu } from "@/components/layout/account-menu";
import { useShell } from "@/components/layout/shell-context";
import { SETTINGS_NAV, WORKSPACE_NAV, isNavActive, projectNav, type NavItem } from "@/components/layout/nav-items";

function SidebarLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "relative flex h-8 items-center rounded-md text-[13px] font-medium transition-[background-color,color] duration-[120ms] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "w-9 justify-center" : "gap-2.5 px-2.5",
        active
          ? "bg-state-active text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
          : "text-sidebar-foreground hover:bg-state-hover hover:text-foreground active:bg-state-pressed"
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-brand-accent" : undefined)} aria-hidden />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="mx-auto my-2 h-px w-5 bg-border" aria-hidden />;
  return <div className="truncate px-2.5 pt-4 pb-1 text-[11px] font-medium tracking-[0.08em] text-faint uppercase">{children}</div>;
}

/** Brand lockup cell of the shell grid (top-left), aligned to the sidebar width. */
export function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn("flex h-14 items-center bg-sidebar", collapsed ? "justify-center" : "px-4")}>
      <Link to="/dashboard" aria-label="Attest home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {collapsed ? <AttestMark className="size-6" /> : <AttestLogo markClassName="size-6" />}
      </Link>
    </div>
  );
}

/** Navigation content, shared by the desktop sidebar and the mobile sheet. */
export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { project } = useShell();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav aria-label="Main" className={cn("min-h-0 flex-1 overflow-y-auto pb-3", collapsed ? "px-2.5" : "px-3")}>
        <SectionLabel collapsed={collapsed}>Workspace</SectionLabel>
        <ul className="space-y-0.5">
          {WORKSPACE_NAV.map((item) => (
            <li key={item.to}>
              <SidebarLink item={item} active={isNavActive(item, pathname)} collapsed={collapsed} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
        {project ? (
          <>
            <SectionLabel collapsed={collapsed}>
              {project.name || <Skeleton className="inline-block h-3 w-24 align-middle" />}
            </SectionLabel>
            <ul className="space-y-0.5" aria-label="Project">
              {projectNav(project.id).map((item) => (
                <li key={item.to}>
                  <SidebarLink item={item} active={isNavActive(item, pathname)} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </nav>
      <div className={cn("space-y-1 border-t border-border py-2", collapsed ? "flex flex-col items-center px-2.5" : "px-3")}>
        <SidebarLink item={SETTINGS_NAV} active={isNavActive(SETTINGS_NAV, pathname)} collapsed={collapsed} onNavigate={onNavigate} />
        <AccountMenu collapsed={collapsed} />
      </div>
    </div>
  );
}

/** Desktop sidebar navigation (the shell provides the column, border and sash). */
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return <SidebarNav collapsed={collapsed} />;
}
