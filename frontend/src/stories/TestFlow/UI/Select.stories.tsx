import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Select } from "@/components/ui/select";

const sampleOptions = [
  { value: "functional", label: "Functional" },
  { value: "responsive", label: "Responsive" },
  { value: "happy-path", label: "Happy Path" },
];

const meta = {
  title: "TestFlow UI/Select",
  component: Select,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
  args: {
    options: sampleOptions,
    value: "functional",
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Category",
  },
};

export const Required: Story = {
  args: {
    label: "Category",
    required: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "Category",
    disabled: true,
  },
};

export const Error: Story = {
  args: {
    label: "Category",
    error: "Select a category.",
    value: "",
  },
};
