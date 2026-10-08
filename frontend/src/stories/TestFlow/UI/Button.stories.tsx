import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Attest/UI/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: { onClick: fn(), children: "Create project" },
  argTypes: {
    variant: { control: "select", options: ["default", "outline", "destructive", "ghost", "link", "primary", "secondary", "danger"] },
    size: { control: "inline-radio", options: ["sm", "default", "lg", "icon", "icon-sm"] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: "default" } };
export const Secondary: Story = { args: { variant: "outline", children: "Cancel" } };
export const Destructive: Story = { args: { variant: "destructive", children: <><Trash2 /> Delete</> } };
export const Ghost: Story = { args: { variant: "ghost", children: "More options" } };
export const Link: Story = { args: { variant: "link", children: "View all runs" } };
export const WithIcon: Story = { args: { children: <><Plus /> New test case</> } };
export const IconOnly: Story = { args: { variant: "outline", size: "icon", "aria-label": "Run test", children: <Play /> } };
export const Small: Story = { args: { size: "sm", children: "Rerun" } };
export const Loading: Story = { args: { loading: true, children: "Saving…" } };
export const Disabled: Story = { args: { disabled: true, children: "Run suite" } };
/** Keyboard focus ring (focus-visible). Press Tab in the canvas to see it on the others. */
export const Focus: Story = { args: { autoFocus: true, children: "Focused" } };

/** Legacy variant names still accepted: primary = default, secondary = outline, danger = destructive. */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(["default", "outline", "destructive", "ghost", "link"] as const).map((variant) => (
        <div key={variant} className="flex items-center gap-2">
          <span className="w-24 text-xs text-muted-foreground">{variant}</span>
          <Button variant={variant}>Button</Button>
          <Button variant={variant} size="sm">Small</Button>
          <Button variant={variant} loading>Loading</Button>
          <Button variant={variant} disabled>Disabled</Button>
        </div>
      ))}
    </div>
  ),
};
