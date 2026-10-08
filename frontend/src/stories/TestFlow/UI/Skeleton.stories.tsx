import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "@/app/_ui/PageSkeleton";

const meta = {
  title: "Attest/UI/Skeleton",
  component: Skeleton,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lines: Story = {
  render: () => (
    <div className="max-w-md space-y-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-4 w-64" />
    </div>
  ),
};

/** The route-level loading state used by every `loading.tsx`. */
export const Page: Story = { parameters: { layout: "fullscreen" }, render: () => <PageSkeleton /> };
