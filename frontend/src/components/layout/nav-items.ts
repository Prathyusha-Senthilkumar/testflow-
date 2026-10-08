import {
  BarChart3,
  FileCheck2,
  FolderKanban,
  Gauge,
  Globe,
  History,
  Layers,
  LayoutDashboard,
  Server,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Only active on an exact pathname match. */
  exact?: boolean;
};

export const WORKSPACE_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: Gauge, exact: true },
  // Stays active inside a project; its sections are tabs on the project pages.
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/runs", label: "Test Runs", icon: History },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

/** Runners open as a slide-over from the top bar; `/workers` is the full-page view. */
export const RUNNERS_NAV: NavItem = { to: "/workers", label: "Runners", icon: Server };

export const SETTINGS_NAV: NavItem = { to: "/settings", label: "Settings", icon: Settings };

export function projectNav(projectId: string): NavItem[] {
  const base = `/projects/${projectId}`;
  return [
    { to: base, label: "Overview", icon: LayoutDashboard, exact: true },
    { to: `${base}/test-cases`, label: "Test Cases", icon: FileCheck2 },
    { to: `${base}/suites`, label: "Suites", icon: Layers },
    { to: `${base}/environments`, label: "Environments", icon: Globe },
    { to: `${base}/auth-profiles`, label: "Auth Profiles", icon: ShieldCheck },
  ];
}

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
