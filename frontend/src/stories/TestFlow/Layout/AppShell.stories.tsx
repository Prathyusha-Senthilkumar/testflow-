import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { ShellFrame, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN } from "@/components/layout/app-shell";
import { Sidebar, SidebarBrand } from "@/components/layout/sidebar";
import { GlobalHeader } from "@/components/layout/global-header";
import { Sash } from "@/components/layout/sash";
import { StaticShellProvider } from "@/components/layout/shell-context";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/app/_ui/PageSkeleton";
import { Button } from "@/components/ui/button";

const PROJECT = { id: "p1", name: "Evolv" };

function Shell({ collapsed: initialCollapsed = false, project = true, loading = false }: { collapsed?: boolean; project?: boolean; loading?: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [width, setWidth] = useState(SIDEBAR_DEFAULT);
  const [resizing, setResizing] = useState(false);
  return (
    <StaticShellProvider project={project ? PROJECT : null} names={{ "testCase:tc1": { name: "TC-007 Open assessments page and verify the cohort filter persists" } }}>
      <ShellFrame
        sidebarWidth={collapsed ? 56 : width}
        resizing={resizing}
        brand={<SidebarBrand collapsed={collapsed} />}
        header={<GlobalHeader sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed((value) => !value)} onOpenMobileNav={() => {}} />}
        sidebar={<Sidebar collapsed={collapsed} />}
        resizer={collapsed ? null : <Sash value={width} min={SIDEBAR_MIN} max={SIDEBAR_MAX} defaultValue={SIDEBAR_DEFAULT} onChange={setWidth} onDraggingChange={setResizing} />}
      >
        {loading ? (
          <PageSkeleton />
        ) : (
          <PageContainer>
            <PageHeader title="Test cases" description="18 test cases across 4 suites." actions={<Button>New test case</Button>} />
            <div className="h-[900px] rounded-lg border border-dashed border-border" />
          </PageContainer>
        )}
      </ShellFrame>
    </StaticShellProvider>
  );
}

const meta = {
  title: "Attest/Layout/AppShell",
  component: Shell,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/projects/p1/test-cases/tc1" } },
  },
} satisfies Meta<typeof Shell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Drag the line between sidebar and content (200–360px), double-click to reset, or focus it and use the arrow keys. */
export const Default: Story = {};
export const CollapsedSidebar: Story = { args: { collapsed: true } };
export const WorkspacePage: Story = {
  args: { project: false },
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/dashboard" } } },
};
export const Loading: Story = { args: { loading: true } };
