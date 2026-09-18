import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const meta = {
  title: "TestFlow UI/Modal",
  component: Modal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    open: true,
    onClose: fn(),
    title: "Create Project",
    description: "Define the application that your QA team will test.",
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: null,
  },
  render: (args) => (
    <Modal
      {...args}
      footer={
        <>
          <Button variant="secondary" onClick={args.onClose}>Cancel</Button>
          <Button variant="primary">Create Project</Button>
        </>
      }
    >
      <Input label="Project Name" placeholder="Enter project name" required />
    </Modal>
  ),
};
