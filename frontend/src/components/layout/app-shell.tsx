"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "@/lib/navigation";
import { useAuthGate } from "@/hooks/useAuthGate";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { RunnersProvider } from "@/components/runners/runners-context";
import { RunnersSheet } from "@/components/runners/runners-panel";
import { AttestLogo } from "@/components/brand/attest-logo";
import { AttestLoaderIntro } from "@/components/brand/attest-loader";
import { ShellProvider } from "@/components/layout/shell-context";
import { GlobalHeader } from "@/components/layout/global-header";
import { Sidebar, SidebarBrand, SidebarNav } from "@/components/layout/sidebar";
import { Sash } from "@/components/layout/sash";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "testflow.sidebar.collapsed";
const WIDTH_KEY = "testflow.sidebar.width";
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 360;
export const SIDEBAR_DEFAULT = 240;
const SIDEBAR_COLLAPSED = 56;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode); the choice just isn't remembered.
  }
}

function readWidth(): number {
  const value = Number(readStorage(WIDTH_KEY));
  return Number.isFinite(value) && value >= SIDEBAR_MIN && value <= SIDEBAR_MAX ? value : SIDEBAR_DEFAULT;
}

type ShellFrameProps = {
  /** Sidebar width in px (desktop). */
  sidebarWidth: number;
  /** Disable the width transition (while dragging the sash). */
  resizing?: boolean;
  header: ReactNode;
  brand: ReactNode;
  sidebar: ReactNode;
  /** Resize handle rendered on the sidebar's right edge (full height). */
  resizer?: ReactNode;
  children: ReactNode;
};

/**
 * VS Code-style shell: square regions separated by full-length 1px lines.
 * Left: one full-height sidebar column (brand row + nav) whose right border
 * runs from the top of the window to the bottom, with a resize sash on it.
 * Right: the top bar (bottom border) over the scrolling content.
 */
export function ShellFrame({ sidebarWidth, resizing = false, header, brand, sidebar, resizer, children }: ShellFrameProps) {
  return (
    <div
      style={{ "--sidebar-w": `${sidebarWidth}px` } as CSSProperties}
      className={cn(
        "grid h-dvh grid-cols-[minmax(0,1fr)] bg-chrome text-foreground md:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]",
        !resizing && "transition-[grid-template-columns] duration-200 ease-out"
      )}
    >
      <aside aria-label="Sidebar" className="relative hidden min-h-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="h-14 shrink-0">{brand}</div>
        <div className="min-h-0 flex-1">{sidebar}</div>
        {resizer}
      </aside>
      <div className="grid min-h-0 min-w-0 grid-rows-[56px_minmax(0,1fr)]">
        {header}
        <main id="main" className="min-w-0 overflow-y-auto bg-canvas">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Content-area skeleton while the session is checked (chrome stays rendered). */
function ContentSkeleton() {
  return (
    <div className="relative flex flex-col gap-6 p-4 sm:p-6" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <AttestLoaderIntro />
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Authenticated application shell: global header, collapsible sidebar, ⌘K palette. */
export function AppShell({ children }: { children?: ReactNode }) {
  const { ready } = useAuthGate();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);
  const [resizing, setResizing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // localStorage is only readable after mount (keeps SSR and hydration identical).
    setCollapsed(readStorage(COLLAPSE_KEY) === "1");
    setWidth(readWidth());
  }, []);

  const resize = useCallback((next: number) => {
    setWidth(next);
    writeStorage(WIDTH_KEY, String(Math.round(next)));
  }, []);

  useEffect(() => {
    // Close the mobile drawer after navigation.
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      writeStorage(COLLAPSE_KEY, !current ? "1" : "0");
      return !current;
    });
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <ShellProvider>
        <ConfirmProvider>
        <RunnersProvider>
        <>
          <RunnersSheet />
          <ShellFrame
            sidebarWidth={collapsed ? SIDEBAR_COLLAPSED : width}
            resizing={resizing}
            brand={<SidebarBrand collapsed={collapsed} />}
            header={
              <GlobalHeader
                sidebarCollapsed={collapsed}
                onToggleSidebar={toggleCollapsed}
                onOpenMobileNav={() => setMobileOpen(true)}
              />
            }
            sidebar={<Sidebar collapsed={collapsed} />}
            resizer={
              collapsed ? null : (
                <Sash
                  value={width}
                  min={SIDEBAR_MIN}
                  max={SIDEBAR_MAX}
                  defaultValue={SIDEBAR_DEFAULT}
                  onChange={resize}
                  onDraggingChange={setResizing}
                />
              )
            }
          >
            {ready ? children : <ContentSkeleton />}
          </ShellFrame>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetContent side="left" className="w-72 gap-0 border-r border-border bg-sidebar p-0">
              <SheetHeader className="h-14 justify-center border-b border-border px-4 py-0">
                <SheetTitle asChild>
                  <div>
                    <AttestLogo markClassName="size-6" />
                  </div>
                </SheetTitle>
                <SheetDescription className="sr-only">Main navigation</SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </>
        </RunnersProvider>
        </ConfirmProvider>
      </ShellProvider>
    </TooltipProvider>
  );
}
