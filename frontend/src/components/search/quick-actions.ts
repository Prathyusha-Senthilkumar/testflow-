"use client";

import { FilePlus2, LogOut, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate } from "@/lib/navigation";
import { useCreateDraftTestCase } from "@/hooks/useCreateDraftTestCase";
import { useSignOut } from "@/components/layout/account-menu";
import { useShell } from "@/components/layout/shell-context";
import { RUNNERS_NAV, SETTINGS_NAV, WORKSPACE_NAV, projectNav } from "@/components/layout/nav-items";
import { useRunners } from "@/components/runners/runners-context";

export type QuickAction = {
  id: string;
  label: string;
  group: "Go to" | "Project" | "Theme" | "Account";
  icon: LucideIcon;
  /** Extra words that should match when filtering (">theme dark"). */
  keywords?: string;
  perform: () => void;
};

/** Commands offered by global search (empty state, or a query starting with ">"). */
export function useQuickActions(): QuickAction[] {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const signOut = useSignOut();
  const { project } = useShell();
  const createDraft = useCreateDraftTestCase();
  const { openPanel: openRunners } = useRunners();

  const pages: QuickAction[] = [...WORKSPACE_NAV, SETTINGS_NAV].map((item) => ({
    id: `go:${item.to}`,
    label: `Go to ${item.label}`,
    group: "Go to",
    icon: item.icon,
    keywords: "navigate open page",
    perform: () => navigate(item.to),
  }));
  // Runners open as the slide-over, not a page.
  pages.push({
    id: "go:runners",
    label: `Go to ${RUNNERS_NAV.label}`,
    group: "Go to",
    icon: RUNNERS_NAV.icon,
    keywords: "workers runners slots queue capacity",
    perform: openRunners,
  });

  const projectPages: QuickAction[] = project
    ? [
        {
          id: `project:${project.id}:create-test`,
          label: `${project.name || "Project"}: Create test case`,
          group: "Project" as const,
          icon: FilePlus2,
          keywords: "new add test case draft record",
          perform: () => void createDraft.create(project.id),
        },
        ...projectNav(project.id).map((item) => ({
        id: `project:${item.to}`,
        label: `${project.name || "Project"}: ${item.label}`,
        group: "Project" as const,
        icon: item.icon,
        keywords: "project navigate",
        perform: () => navigate(item.to),
      })),
      ]
    : [];

  const theme: QuickAction[] = [
    { id: "theme:light", label: "Switch to light theme", group: "Theme", icon: Sun, keywords: "appearance mode", perform: () => setTheme("light") },
    { id: "theme:dark", label: "Switch to dark theme", group: "Theme", icon: Moon, keywords: "appearance mode", perform: () => setTheme("dark") },
    { id: "theme:system", label: "Use system theme", group: "Theme", icon: Monitor, keywords: "appearance mode auto", perform: () => setTheme("system") },
  ];

  const account: QuickAction[] = [
    { id: "account:sign-out", label: "Sign out", group: "Account", icon: LogOut, keywords: "log out logout", perform: signOut },
  ];

  return [...pages, ...projectPages, ...theme, ...account];
}

export function filterQuickActions(actions: QuickAction[], query: string): QuickAction[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return actions;
  return actions.filter((action) => `${action.label} ${action.group} ${action.keywords ?? ""}`.toLowerCase().includes(needle));
}
