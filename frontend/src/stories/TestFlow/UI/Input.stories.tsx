import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "@/components/ui/input";

const meta = {
  title: "TestFlow UI/Input",
  component: Input,
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
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Project Name",
    placeholder: "Enter project name",
  },
};

export const Required: Story = {
  args: {
    label: "Project Name",
    placeholder: "Enter project name",
    required: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "Project Name",
    placeholder: "Enter project name",
    disabled: true,
    value: "SRM Student Portal",
  },
};

export const Error: Story = {
  args: {
    label: "Project Name",
    placeholder: "Enter project name",
    error: "Project name is required.",
    value: "",
  },
};
