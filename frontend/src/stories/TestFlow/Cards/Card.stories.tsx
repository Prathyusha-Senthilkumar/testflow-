import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Card } from '@/components/ui/card';

const meta = {
  title: 'TestFlow/Cards/Card',
  component: Card,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    className: 'max-w-md p-6',
    children: (
      <>
        <h2 className="text-lg font-semibold text-slate-900">Admissions project</h2>
        <p className="mt-2 text-sm text-slate-500">12 suites, 84 test cases, and 96% pass rate.</p>
      </>
    ),
  },
};

export const WithMetrics: Story = {
  args: {
    className: 'max-w-md p-6',
    children: (
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div><p className="text-xs text-slate-400">Suites</p><p className="mt-1 font-semibold">12</p></div>
        <div><p className="text-xs text-slate-400">Cases</p><p className="mt-1 font-semibold">84</p></div>
        <div><p className="text-xs text-slate-400">Failed</p><p className="mt-1 font-semibold">3</p></div>
      </div>
    ),
  },
};
