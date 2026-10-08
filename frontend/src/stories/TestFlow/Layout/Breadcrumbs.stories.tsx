import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BreadcrumbTrail } from "@/components/layout/breadcrumb-trail";
import { StaticShellProvider, type EntityInfo } from "@/components/layout/shell-context";

const names: Record<string, EntityInfo> = {
  "suite:s1": { name: "Assessments" },
  "testCase:tc1": { name: "TC-007 Open assessments page and verify the cohort filter persists after reload" },
  "run:r1": { name: "Run 14:03, 8 Oct", testCaseId: "tc1" },
};

function Trail({ pathname, width = 640, loading = false }: { pathname: string; width?: number; loading?: boolean }) {
  return (
    <StaticShellProvider project={{ id: "p1", name: loading ? "" : "Evolv" }} names={loading ? {} : names}>
      <div style={{ width }} className="rounded-md border border-dashed border-border px-3 py-2">
        <BreadcrumbTrail pathname={pathname} />
      </div>
    </StaticShellProvider>
  );
}

const meta = {
  title: "Attest/Layout/Breadcrumbs",
  component: Trail,
  parameters: { layout: "padded" },
  args: { pathname: "/reports" },
} satisfies Meta<typeof Trail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Short: Story = { args: { pathname: "/reports" } };
export const Project: Story = { args: { pathname: "/projects/p1" } };
export const Deep: Story = { args: { pathname: "/projects/p1/results/r1", width: 900 } };
/** Names not yet published: an 80px skeleton, never a generic "Project". */
export const LoadingNames: Story = { args: { pathname: "/projects/p1/suites/s1", loading: true } };
/** Too narrow: middle crumbs collapse into "…", then the last crumb ellipsizes (tooltip on hover). */
export const Collapsed: Story = { args: { pathname: "/projects/p1/results/r1", width: 260 } };
