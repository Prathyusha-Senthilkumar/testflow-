import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BellButton } from "@/components/notifications/notification-bell";

const meta = {
  title: "Attest/Notifications/Bell",
  component: BellButton,
  parameters: { layout: "centered" },
  decorators: [(Story) => <div className="rounded-md bg-chrome p-3"><Story /></div>],
  args: { count: 0 },
} satisfies Meta<typeof BellButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoUnread: Story = { args: { count: 0 } };
export const ThreeUnread: Story = { args: { count: 3 } };
/** Counts above 9 show "9+". */
export const ManyUnread: Story = { args: { count: 12 } };
