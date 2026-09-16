import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';

const meta = {
  title: 'TestFlow/Common/PageHeader',
  component: PageHeader,
  parameters: {
    layout: 'padded',
  },
  args: {
    title: 'Projects',
    description: 'Manage the applications and websites being tested.',
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
export const WithEyebrowAndAction: Story = {
  args: {
    eyebrow: 'Test management',
    actions: <Button>New Project</Button>,
  },
};
