import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DemoStatus } from '@/lib/demoData';
import { StatusBadge } from '@/components/common/StatusBadge';

const meta = {
  title: 'TestFlow/Common/StatusBadge',
  component: StatusBadge,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

const statusStory = (status: DemoStatus): Story => ({ args: { status } });

export const Passed = statusStory('Passed');
export const Failed = statusStory('Failed');
export const Running = statusStory('Running');
export const Untested = statusStory('Untested');
export const Skipped = statusStory('Skipped');
