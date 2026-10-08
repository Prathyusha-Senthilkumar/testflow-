import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "@/components/ui/input";

const meta = {
  title: "Attest/UI/Input",
  component: Input,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
  args: { label: "Project name", placeholder: "e.g. Student portal" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithHint: Story = { args: { label: "Base URL", placeholder: "https://", hint: "Tests navigate relative to this URL." } };
export const Required: Story = { args: { required: true } };
export const Focus: Story = { args: { autoFocus: true } };
export const Disabled: Story = { args: { disabled: true, defaultValue: "SRM Student Portal" } };
export const Error: Story = { args: { required: true, error: "Project name is required." } };
export const WithoutLabel: Story = { args: { label: undefined, placeholder: "Search test cases…", "aria-label": "Search" } };
