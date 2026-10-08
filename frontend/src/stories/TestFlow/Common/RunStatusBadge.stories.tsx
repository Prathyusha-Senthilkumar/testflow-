import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";

const meta = {
  title: "Attest/Common/RunStatusBadge",
  component: RunStatusBadge,
  parameters: { layout: "centered" },
  args: { status: "passed" },
} satisfies Meta<typeof RunStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Queued: Story = { args: { status: "queued" } };
export const Running: Story = { args: { status: "running" } };
export const Passed: Story = { args: { status: "passed" } };
export const Failed: Story = { args: { status: "failed" } };
export const Cancelled: Story = { args: { status: "cancelled" } };
export const TimedOut: Story = { args: { status: "timed_out" } };
/** Status strings are case-insensitive ("Timed out", "TIMED_OUT"). Unknown values render neutral. */
export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {["queued", "running", "passed", "failed", "cancelled", "timed_out", "completed", "skipped", "untested", "scheduled", "Something else"].map((status) => (
        <RunStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
