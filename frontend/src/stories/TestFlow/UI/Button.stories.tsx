import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";

const meta = {
  title: "TestFlow UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: "primary", children: "Create Project" },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Cancel" },
};

export const Danger: Story = {
  args: { variant: "danger", children: "Delete" },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "More options" },
};

export const Disabled: Story = {
  args: { variant: "primary", children: "Saving...", disabled: true },
};
