import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PassFailTrendChart, type PassFailPoint } from "@/components/charts/pass-fail-trend-chart";
import { ProjectHealthChart } from "@/components/charts/project-health-chart";
import { Sparkline } from "@/components/charts/sparkline";

const days: PassFailPoint[] = Array.from({ length: 14 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 8, 25 + index));
  const passed = index % 5 === 3 ? 0 : 20 + ((index * 37) % 60);
  const failed = index % 5 === 3 ? 0 : (index * 13) % 12;
  return { key: date.toISOString().slice(0, 10), label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), passed, failed, isToday: index === 13 };
});

const meta = {
  title: "Attest/Charts",
  component: PassFailTrendChart,
  parameters: { layout: "padded" },
  args: { data: days },
} satisfies Meta<typeof PassFailTrendChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Passed = success token, Failed = destructive; empty days stay empty; Today is highlighted. */
export const PassFailTrend: Story = {};
export const PassFailTrendLoading: Story = { args: { loading: true } };
export const ProjectHealth: Story = {
  render: () => (
    <ProjectHealthChart
      data={[
        { id: "p1", name: "Evolv", passed: 14, failed: 4 },
        { id: "p2", name: "SRM Website Testing", passed: 7, failed: 1 },
        { id: "p3", name: "test", passed: 1, failed: 0 },
      ]}
    />
  ),
};
export const Sparklines: Story = {
  render: () => (
    <div className="flex gap-6">
      <div className="h-8 w-24"><Sparkline data={[3, 5, 4, 8, 6, 9, 12]} label="Runs" /></div>
      <div className="h-8 w-24"><Sparkline data={[9, 7, 8, 6, 5, 6, 4]} color="var(--destructive)" label="Failures" /></div>
    </div>
  ),
};
