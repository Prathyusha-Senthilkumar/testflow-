import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const meta = {
  title: "Attest/UI/Modal",
  component: Modal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onClose: fn(),
    title: "Create project",
    description: "Define the application your QA team will test.",
    children: null,
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Modal
      {...args}
      footer={
        <>
          <Button variant="outline" onClick={args.onClose}>Cancel</Button>
          <Button>Create project</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Project name" placeholder="Student portal" required />
        <Input label="Base URL" placeholder="https://" required />
      </div>
    </Modal>
  ),
};

export const Saving: Story = {
  render: (args) => (
    <Modal {...args} footer={<><Button variant="outline" disabled>Cancel</Button><Button loading>Creating…</Button></>}>
      <Input label="Project name" defaultValue="Student portal" disabled />
    </Modal>
  ),
};

export const ValidationError: Story = {
  render: (args) => (
    <Modal {...args} footer={<><Button variant="outline">Cancel</Button><Button>Create project</Button></>}>
      <Input label="Project name" required error="Project name is required." />
    </Modal>
  ),
};

export const DestructiveConfirm: Story = {
  args: { title: "Delete test suite?", description: "Test cases stay in the project; only the grouping is removed." },
  render: (args) => (
    <Modal {...args} footer={<><Button variant="outline">Cancel</Button><Button variant="destructive">Delete suite</Button></>}>
      <p className="text-muted-foreground">This cannot be undone.</p>
    </Modal>
  ),
};

/** Long content scrolls inside the body; header and footer stay put. */
export const LongContent: Story = {
  render: (args) => (
    <Modal {...args} footer={<Button>Done</Button>}>
      <div className="space-y-3">
        {Array.from({ length: 30 }, (_, index) => (
          <p key={index} className="text-muted-foreground">Step {index + 1}: click “Apply now”.</p>
        ))}
      </div>
    </Modal>
  ),
};

export const Closed: Story = { args: { open: false } };
