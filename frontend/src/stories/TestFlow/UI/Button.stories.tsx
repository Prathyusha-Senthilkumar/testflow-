import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'TestFlow/UI/Button',
  component: Button,
  args: {
    children: 'Create project',
  },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Outline: Story = { args: { variant: 'outline', children: 'Cancel' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'More options' } };
export const Disabled: Story = { args: { disabled: true, children: 'Saving...' } };
