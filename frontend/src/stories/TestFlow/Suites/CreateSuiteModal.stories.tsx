import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CreateSuiteModal } from '@/components/suites/CreateSuiteModal';

const meta = {
  title: 'TestFlow/Suites/CreateSuiteModal',
  component: CreateSuiteModal,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    onClose: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof CreateSuiteModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Closed: Story = { args: { open: false } };
