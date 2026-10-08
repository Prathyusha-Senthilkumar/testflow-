import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";

const meta = {
  title: "Attest/Layout/PageHeader",
  component: PageHeader,
  parameters: { layout: "padded" },
  args: {
    title: "Projects",
    description: "Manage the applications and websites being tested.",
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
export const WithAction: Story = { args: { actions: <Button><Plus /> New project</Button> } };
export const WithMeta: Story = {
  args: {
    title: "Apply now button submits form",
    description: "TC-014 · Admissions",
    meta: <><Badge variant="primary">Functional</Badge><Badge variant="outline">High</Badge></>,
    actions: <><Button variant="outline">Edit</Button><Button>Run</Button></>,
  },
};
export const LongTitle: Story = {
  args: { title: "A very long test case name that keeps going to show truncation behaviour in narrow layouts" },
};

/** Level-3 section header with count, filters and actions. */
export const Section: Story = {
  render: () => (
    <SectionHeader
      title="Recent runs"
      count={24}
      description="Latest executions across all projects."
      actions={<Button size="sm" variant="outline">View all</Button>}
    />
  ),
};
