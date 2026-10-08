import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ComponentProps } from "react";
import { CircleDot, PencilLine } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";

const scenarios = [
  { value: "happy", label: "Happy path" },
  { value: "negative", label: "Negative" },
  { value: "edge", label: "Edge case" },
];

function Dot({ className }: { className: string }) {
  return <span aria-hidden className={`size-2 rounded-full ${className}`} />;
}

const priorities = [
  { value: "critical", label: "Critical", icon: <Dot className="bg-destructive" /> },
  { value: "high", label: "High", icon: <Dot className="bg-warning" /> },
  { value: "medium", label: "Medium", icon: <Dot className="bg-info" /> },
  { value: "low", label: "Low", icon: <Dot className="bg-muted-foreground" /> },
];

const meta = {
  title: "Attest/UI/SegmentedControl",
  component: SegmentedControl,
  parameters: { layout: "padded" },
  args: { options: scenarios, value: "happy", onChange: () => {}, "aria-label": "Scenario type" },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

type SingleProps = Omit<Extract<ComponentProps<typeof SegmentedControl>, { multiple?: false }>, "value" | "onChange"> & { value?: string };

function Single({ value: initial, ...props }: SingleProps) {
  const [value, setValue] = useState(initial ?? props.options[0]?.value ?? "");
  return <SegmentedControl {...props} value={value} onChange={setValue} />;
}

function Multiple({ initial = [] as string[], ...props }: { initial?: string[]; label?: string; options: typeof scenarios; error?: string }) {
  const [value, setValue] = useState<string[]>(initial);
  return <SegmentedControl multiple {...props} value={value} onChange={setValue} />;
}

export const Default: Story = { render: () => <Single aria-label="Scenario type" options={scenarios} /> };
export const WithLabel: Story = { render: () => <Single label="Scenario type" options={scenarios} hint="Arrow keys move between options." /> };
export const Sizes: Story = {
  render: () => (
    <div className="space-y-4">
      <Single label="Small" size="sm" options={scenarios} />
      <Single label="Medium" size="md" options={scenarios} />
    </div>
  ),
};
export const PriorityWithDots: Story = { render: () => <Single label="Priority" options={priorities} value="high" /> };
export const MultipleToggle: Story = {
  render: () => (
    <Multiple
      label="Capabilities"
      initial={["functional"]}
      options={[
        { value: "functional", label: "Functional" },
        { value: "responsive", label: "Responsive" },
      ]}
    />
  ),
};
export const WithIcons: Story = {
  render: () => (
    <Single
      label="Start with"
      options={[
        { value: "record", label: "Record in browser", icon: <CircleDot /> },
        { value: "write", label: "Write steps", icon: <PencilLine /> },
      ]}
    />
  ),
};
export const Disabled: Story = { render: () => <Single label="Scenario type" options={scenarios} disabled /> };
export const DisabledOption: Story = {
  render: () => <Single label="Scenario type" options={scenarios.map((option) => (option.value === "edge" ? { ...option, disabled: true } : option))} />,
};
export const Error: Story = { render: () => <Multiple label="Suite categories" options={scenarios} error="Pick at least one category." /> };
export const FullWidth: Story = {
  render: () => (
    <div className="max-w-md">
      <Single label="Start with" fullWidth options={[{ value: "record", label: "Record" }, { value: "write", label: "Write steps" }]} />
    </div>
  ),
};
