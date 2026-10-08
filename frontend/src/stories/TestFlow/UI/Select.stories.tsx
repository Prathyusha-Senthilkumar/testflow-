import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Select } from "@/components/ui/select";

const sampleOptions = [
  { value: "functional", label: "Functional" },
  { value: "responsive", label: "Responsive" },
  { value: "happy-path", label: "Happy Path" },
];

const meta = {
  title: "Attest/UI/Select",
  component: Select,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-xs"><Story /></div>],
  args: { options: sampleOptions, value: "functional" },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled(props: React.ComponentProps<typeof Select>) {
  const [value, setValue] = useState(props.value ?? "");
  return <Select {...props} value={value} onChange={setValue} />;
}

export const Default: Story = { render: (args) => <Controlled {...args} aria-label="Category" /> };
export const WithLabel: Story = { render: (args) => <Controlled {...args} label="Category" /> };
export const Placeholder: Story = { render: (args) => <Controlled {...args} label="Category" value="" placeholder="Choose a category" /> };
/** "" is a valid option value (e.g. "All runs"); it's mapped to a sentinel internally. */
export const EmptyValueOption: Story = {
  render: () => <Controlled aria-label="Run type" value="" options={[{ value: "", label: "All runs" }, { value: "suite", label: "Suite" }, { value: "project", label: "Project" }]} />,
};
export const Required: Story = { render: (args) => <Controlled {...args} label="Category" required /> };
export const Disabled: Story = { render: (args) => <Controlled {...args} label="Category" disabled /> };
export const Error: Story = { render: (args) => <Controlled {...args} label="Category" value="" placeholder="Choose a category" error="Select a category." /> };
export const Small: Story = { render: (args) => <Controlled {...args} aria-label="Category" size="sm" /> };
export const ManyOptions: Story = {
  render: () => (
    <Controlled
      label="Timezone"
      value="Asia/Kolkata"
      options={["UTC", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "Africa/Johannesburg", "Pacific/Auckland"].map((zone) => ({ value: zone, label: zone }))}
    />
  ),
};
