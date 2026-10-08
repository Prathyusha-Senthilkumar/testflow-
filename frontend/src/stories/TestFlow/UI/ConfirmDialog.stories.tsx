import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ConfirmProvider, useConfirm } from "@/components/ui/confirm-dialog";

const meta = {
  title: "Attest/UI/ConfirmDialog",
  component: ConfirmDialog,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onResolve: fn(),
    title: "Delete test case?",
    tone: "danger",
    confirmLabel: "Delete test case",
    description: (
      <p>
        <strong>Open assessments</strong> and its run history will be permanently deleted.
      </p>
    ),
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Danger: Cancel is focused by default, so Enter never deletes by accident. */
export const Danger: Story = {};
export const Default: Story = {
  args: { tone: "default", title: "Publish this version?", confirmLabel: "Publish", description: <p>Runs will use <strong>version 4</strong> from now on.</p> },
};
/** High-impact delete: type the project name to enable the button. */
export const RequireText: Story = {
  args: {
    title: "Delete project?",
    confirmLabel: "Delete project",
    requireText: "Evolv",
    description: (
      <>
        <p>
          <strong>Evolv</strong> will be permanently deleted, including:
        </p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>its test suites and test cases</li>
          <li>all run history, screenshots and reports</li>
        </ul>
      </>
    ),
  },
};
export const Loading: Story = { args: { busy: true } };
export const Error: Story = { args: { error: "Couldn’t delete the test case. Please try again." } };

/** The hook API: `await confirm({...})` resolves true/false. */
export const WithHook: Story = {
  render: function Render() {
    return (
      <ConfirmProvider>
        <Trigger />
      </ConfirmProvider>
    );
  },
};

function Trigger() {
  const confirm = useConfirm();
  return (
    <div className="p-6">
      <Button
        variant="destructive"
        onClick={async () => {
          await confirm({
            title: "Delete suite?",
            tone: "danger",
            confirmLabel: "Delete suite",
            description: <p>The suite <strong>Assessments</strong> will be deleted. Test cases in this suite are kept.</p>,
            onConfirm: () => new Promise((resolve) => setTimeout(resolve, 1200)),
          });
        }}
      >
        Delete suite…
      </Button>
    </div>
  );
}
