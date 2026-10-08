import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CheckCircle2, FlaskConical, FolderKanban, XCircle } from "lucide-react";
import { Stat, StatGroup } from "@/components/common/Stat";
import { Sparkline } from "@/components/charts/sparkline";

const meta = {
  title: "Attest/Common/Stat",
  component: Stat,
  parameters: { layout: "padded" },
  args: { label: "Total runs", value: 645 },
} satisfies Meta<typeof Stat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = { render: (args) => <StatGroup columns={2}><Stat {...args} /><Stat label="Pass rate" value="87.6%" /></StatGroup> };

export const Group: Story = {
  render: () => (
    <StatGroup>
      <Stat label="Projects" value={12} icon={FolderKanban} hint="Applications under test" />
      <Stat label="Test cases" value={384} icon={FlaskConical} hint="Across all projects" />
      <Stat label="Passed" value={341} icon={CheckCircle2} hint="Latest recorded outcome" />
      <Stat label="Failed" value={43} icon={XCircle} tone="destructive" hint="Needs attention" />
    </StatGroup>
  ),
};

export const LargeWithSparkline: Story = {
  render: () => (
    <StatGroup>
      <Stat size="lg" label="Total runs" value={645} hint="+12% vs previous period" chart={<Sparkline data={[3, 5, 4, 8, 6, 9, 12]} />} />
      <Stat size="lg" label="Failed" value={80} tone="destructive" hint="−4 vs previous period" chart={<Sparkline data={[9, 7, 8, 6, 5, 6, 4]} color="var(--destructive)" />} />
      <Stat size="lg" label="Pass rate" value="87.6%" hint={<span className="text-success">+2.1 pts</span>} />
      <Stat size="lg" label="Avg duration" value="4.2s" />
    </StatGroup>
  ),
};

export const Loading: Story = {
  render: () => (
    <StatGroup>
      {["Projects", "Test cases", "Passed", "Failed"].map((label) => (
        <Stat key={label} label={label} value={0} loading />
      ))}
    </StatGroup>
  ),
};
