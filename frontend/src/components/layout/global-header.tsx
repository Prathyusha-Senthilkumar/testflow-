"use client";

import { Suspense, useState } from "react";
import { CircleHelp, Menu, PanelLeft, Search } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AttestMark } from "@/components/brand/attest-logo";
import { GlobalSearch } from "@/components/search/global-search";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { BreadcrumbTrail } from "@/components/layout/breadcrumb-trail";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { RunnersIndicator } from "@/components/runners/runners-indicator";

function HelpMenu() {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Help and keyboard shortcuts">
              <CircleHelp />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Help</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="text-[13px] font-semibold">Keyboard shortcuts</p>
        <dl className="mt-2 space-y-1.5 text-[13px]">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Search</dt>
            <dd>
              <Kbd>⌘</Kbd> <Kbd>K</Kbd>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Quick actions</dt>
            <dd>
              <Kbd>⌘</Kbd> <Kbd>K</Kbd> then <Kbd>&gt;</Kbd>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Close</dt>
            <dd>
              <Kbd>Esc</Kbd>
            </dd>
          </div>
        </dl>
        <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
          Attest runs functional and responsive browser tests, no code required.
        </p>
      </PopoverContent>
    </Popover>
  );
}

type GlobalHeaderProps = {
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
  sidebarCollapsed: boolean;
};

/** Top bar: breadcrumbs, ⌘K search, theme toggle, help. */
export function GlobalHeader({ onToggleSidebar, onOpenMobileNav, sidebarCollapsed }: GlobalHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="grid h-14 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-chrome px-3 md:grid-cols-[minmax(0,1fr)_300px_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_480px_minmax(0,1fr)] md:gap-6 md:px-3">
      {/* Left: navigation + breadcrumbs */}
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open navigation" onClick={onOpenMobileNav}>
          <Menu />
        </Button>
        <Link to="/dashboard" aria-label="Attest home" className="shrink-0 md:hidden">
          <AttestMark className="size-6" />
        </Link>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden md:inline-flex"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={!sidebarCollapsed}
              onClick={onToggleSidebar}
            >
              <PanelLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
        </Tooltip>
        <div className="hidden h-4 w-px shrink-0 bg-border md:block" aria-hidden />
        <div className="min-w-0 flex-1 md:pl-1">
          <Suspense fallback={null}>
            <BreadcrumbTrail />
          </Suspense>
        </div>
      </div>

      {/* Center: global search (inline combobox) */}
      <div className="hidden min-w-0 md:block">
        <GlobalSearch />
      </div>

      {/* Right: actions; theme toggle is the right-most control */}
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Search" onClick={() => setSearchOpen(true)}>
          <Search />
        </Button>
        <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
          <SheetContent side="top" className="flex h-dvh flex-col gap-3 bg-chrome p-3 pt-12 md:hidden">
            <SheetTitle className="sr-only">Search</SheetTitle>
            <SheetDescription className="sr-only">Search projects, suites, test cases and runs</SheetDescription>
            {searchOpen ? <GlobalSearch variant="sheet" onNavigate={() => setSearchOpen(false)} /> : null}
          </SheetContent>
        </Sheet>
        <RunnersIndicator />
        <HelpMenu />
        <NotificationBell />
        <ThemeToggle />
      </div>
    </header>
  );
}
