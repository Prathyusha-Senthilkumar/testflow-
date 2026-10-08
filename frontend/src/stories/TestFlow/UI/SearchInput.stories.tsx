import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { SearchInput } from "@/components/ui/search-input";

const meta = {
  title: "Attest/UI/SearchInput",
  component: SearchInput,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
  args: { value: "", onChange: () => {}, placeholder: "Search by name, code, or status…" },
} satisfies Meta<typeof SearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled(props: Partial<React.ComponentProps<typeof SearchInput>>) {
  const [value, setValue] = useState(props.value ?? "");
  return <SearchInput placeholder="Search by name, code, or status…" {...props} value={value} onChange={setValue} />;
}

export const Default: Story = { render: () => <Controlled /> };
export const WithValue: Story = { render: () => <Controlled value="login" /> };
export const WithShortcut: Story = { render: () => <Controlled shortcut="/" bindShortcut /> };
export const Focus: Story = { render: () => <Controlled autoFocus /> };
export const Disabled: Story = { render: () => <Controlled disabled /> };
