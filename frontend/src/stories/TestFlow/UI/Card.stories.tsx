import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card } from "@/components/ui/card";

const meta = {
  title: "TestFlow UI/Card",
  component: Card,
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
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: "p-6",
    children: <p className="text-sm text-slate-600">Project summary content goes here.</p>,
  },
};

export const WithTitle: Story = {
  args: {
    title: "Admissions Regression",
    className: "p-5 pt-0",
    children: <p className="px-5 pb-5 text-sm text-slate-600">12 test cases in this suite.</p>,
  },
};

export const WithDescription: Story = {
  args: {
    title: "SRM Website",
    description: "Core student portal regression coverage.",
    className: "p-5 pt-0",
    children: <p className="px-5 pb-5 text-sm text-slate-600">84 test cases · 96% pass rate</p>,
  },
};
