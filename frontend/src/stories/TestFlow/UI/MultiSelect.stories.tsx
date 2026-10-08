import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { MultiSelect } from "@/components/ui/multi-select";

const categories = [
  { value: "smoke", label: "Smoke" },
  { value: "regression", label: "Regression" },
  { value: "sanity", label: "Sanity" },
  { value: "e2e", label: "End to end" },
];

const meta = {
  title: "Attest/UI/MultiSelect",
  component: MultiSelect,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
  args: { options: categories, value: [], onChange: () => {}, label: "Categories" },
} satisfies Meta<typeof MultiSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled(props: Partial<React.ComponentProps<typeof MultiSelect>>) {
  const [value, setValue] = useState<string[]>(props.value ?? []);
  return <MultiSelect options={categories} label="Categories" {...props} value={value} onChange={setValue} />;
}

export const Empty: Story = { render: () => <Controlled placeholder="Choose categories" /> };
export const WithSelection: Story = { render: () => <Controlled value={["smoke", "regression"]} /> };
export const Searchable: Story = {
  render: () => <Controlled label="Environments" options={Array.from({ length: 12 }, (_, index) => ({ value: `env-${index}`, label: `Environment ${index + 1}` }))} />,
};
export const Disabled: Story = { render: () => <Controlled disabled placeholder="No environments configured" /> };
export const Error: Story = { render: () => <Controlled required error="Pick at least one category." /> };
