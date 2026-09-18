import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "@/components/ui/badge";

const meta = {
  title: "TestFlow UI/Badge",
  component: Badge,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { variant: "default", children: "Untested" },
};

export const Success: Story = {
  args: { variant: "success", children: "Passed" },
};

export const Error: Story = {
  args: { variant: "error", children: "Failed" },
};

export const Warning: Story = {
  args: { variant: "warning", children: "Skipped" },
};

export const Info: Story = {
  args: { variant: "info", children: "Automated" },
};
