import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Attest/UI/Alert",
  component: Alert,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
  args: { children: "Could not refresh dashboard data." },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Error: Story = { args: { variant: "error", title: "Could not load test runs", children: "Network request failed.", action: <Button size="sm" variant="outline">Retry</Button> } };
export const Warning: Story = { args: { variant: "warning", children: "This auth profile's session expires in 2 days." } };
export const Info: Story = { args: { variant: "info", children: "Recording in progress. Interact with the browser window, then stop recording." } };
export const Success: Story = { args: { variant: "success", children: "Session restored." } };
