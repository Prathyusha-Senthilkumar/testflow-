import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Command as CommandPrimitive } from "cmdk";
import { fn } from "storybook/test";
import { Monitor, Moon, Sun } from "lucide-react";
import type { SearchResponse } from "@/lib/api";
import type { RecentItem } from "@/lib/search";
import { GlobalSearch, GlobalSearchResults } from "@/components/search/global-search";
import type { QuickAction } from "@/components/search/quick-actions";
import { StaticShellProvider } from "@/components/layout/shell-context";
import type { GlobalSearchState } from "@/hooks/useGlobalSearch";

const recent: RecentItem[] = [
  { type: "test_case", id: "tc1", title: "TC-007 Open assessments", subtitle: "Evolv", projectId: "p1", at: 0 },
  { type: "suite", id: "s1", title: "Assessments", subtitle: "Evolv", projectId: "p1", at: 0 },
  { type: "project", id: "p1", title: "Evolv", at: 0 },
  { type: "run", id: "r1", title: "Run 14:03, 8 Oct", subtitle: "Evolv", projectId: "p1", at: 0 },
];

const actions: QuickAction[] = [
  { id: "theme:light", label: "Switch to light theme", group: "Theme", icon: Sun, perform: fn() },
  { id: "theme:dark", label: "Switch to dark theme", group: "Theme", icon: Moon, perform: fn() },
  { id: "theme:system", label: "Use system theme", group: "Theme", icon: Monitor, perform: fn() },
];

const results: SearchResponse = {
  query: "login",
  type: "all",
  groups: [
    {
      type: "test_case",
      label: "Test cases",
      total: 12,
      items: [
        { id: "tc2", type: "test_case", title: "TC-001 Login with valid credentials", subtitle: "Evolv · Authentication", projectId: "p1", projectName: "Evolv", status: "passed" },
        { id: "tc3", type: "test_case", title: "TC-002 Login shows error for wrong password", subtitle: "Evolv · Authentication", projectId: "p1", projectName: "Evolv", status: "failed" },
        { id: "tc4", type: "test_case", title: "TC-014 SSO login redirect", subtitle: "SRM Website", projectId: "p2", projectName: "SRM Website", status: "not_run" },
      ],
    },
    { type: "suite", label: "Test suites", total: 1, items: [{ id: "s2", type: "suite", title: "Login & Authentication", subtitle: "6 test cases · Evolv", projectId: "p1" }] },
    { type: "run", label: "Test runs", total: 4, items: [{ id: "r2", type: "run", title: "TC-002 Login shows error for wrong password", subtitle: "Run 14:03, 8 Oct · Evolv", projectId: "p1", status: "running" }] },
  ],
};

function Panel({ query, state, withRecent = true }: { query: string; state: GlobalSearchState; withRecent?: boolean }) {
  return (
    <div className="w-[520px] overflow-hidden rounded-md border border-border bg-popover shadow-float">
      <CommandPrimitive shouldFilter={false} loop>
        <GlobalSearchResults query={query} scope="all" state={state} recent={withRecent ? recent : []} actions={actions} onOpen={fn()} onAction={fn()} />
      </CommandPrimitive>
    </div>
  );
}

const meta = {
  title: "Attest/Search/GlobalSearch",
  component: Panel,
  parameters: { layout: "centered" },
  args: { query: "", state: { status: "idle", data: null, error: null } },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyWithRecent: Story = {};
export const EmptyNoRecent: Story = { args: { withRecent: false } };
export const Loading: Story = { args: { query: "login", state: { status: "loading", data: null, error: null } } };
export const Results: Story = { args: { query: "login", state: { status: "success", data: results, error: null } } };
export const NoMatches: Story = { args: { query: "xyzzy", state: { status: "success", data: { query: "xyzzy", type: "all", groups: [] }, error: null } } };
export const Error: Story = { args: { query: "login", state: { status: "error", data: null, error: "Could not reach the API." } } };
export const QuickActionsMode: Story = { args: { query: ">theme" } };

/** The live field in the header, scoped to a project ("This project" chip). Focus it to open the panel. */
export const ScopedToProject: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/projects/p1/test-cases" } } },
  render: () => (
    <StaticShellProvider project={{ id: "p1", name: "Evolv" }}>
      <div className="w-[520px]">
        <GlobalSearch />
      </div>
    </StaticShellProvider>
  ),
};
