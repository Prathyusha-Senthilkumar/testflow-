import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge } from "@/components/ui/badge";

const meta = {
  title: "Attest/UI/Badge",
  component: Badge,
  parameters: { layout: "centered" },
  args: { children: "Functional" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { variant: "default", children: "Untested" } };
export const Outline: Story = { args: { variant: "outline", children: "Medium" } };
export const Primary: Story = { args: { variant: "primary", children: "Responsive" } };
export const Success: Story = { args: { variant: "success", children: "Passed", dot: true } };
export const Error: Story = { args: { variant: "error", children: "Failed", dot: true } };
export const Warning: Story = { args: { variant: "warning", children: "Skipped" } };
export const Info: Story = { args: { variant: "info", children: "Automated" } };
/** Legacy `status` prop maps status strings to variants. */
export const LegacyStatus: Story = { args: { status: "Failed", children: "42%" } };

/** Live/health states (session Active, runner Online, browser Ready): muted green. Run results stay brand blue / coral. */
export const Ok: Story = { args: { variant: "ok", children: "Active", dot: true } };
export const StateSet: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="ok" dot>Active</Badge>
      <Badge variant="ok" dot>Online</Badge>
      <Badge variant="warning" dot>Expiring</Badge>
      <Badge variant="error" dot>Expired</Badge>
      <Badge variant="default" dot>Offline</Badge>
    </div>
  ),
};
