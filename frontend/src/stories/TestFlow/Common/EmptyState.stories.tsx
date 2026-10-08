import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FileCheck2, FolderKanban, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";

const meta = {
  title: "Attest/Common/EmptyState",
  component: EmptyState,
  parameters: { layout: "padded" },
  args: {
    icon: FolderKanban,
    title: "Create your first project",
    description: "Add the application URL first. Suites and test cases live inside a project.",
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { action: <Button>New project</Button> } };
export const Panel: Story = { args: { variant: "panel", action: <Button>New project</Button> } };
export const NoResults: Story = {
  args: { icon: SearchX, title: "No matches for “login”", description: "Try a different term or clear the filters.", action: <Button variant="outline">Clear filters</Button> },
};
export const Small: Story = { args: { icon: FileCheck2, title: "No test cases in this suite", description: undefined, size: "sm" } };
