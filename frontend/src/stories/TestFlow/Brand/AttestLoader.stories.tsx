import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AttestLoader, AttestLoaderScreen } from "@/components/brand/attest-loader";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { PageSkeleton } from "@/app/_ui/PageSkeleton";

const meta = {
  title: "Attest/Brand/Loader",
  component: AttestLoader,
  parameters: { layout: "centered" },
  args: { size: "md" },
} satisfies Meta<typeof AttestLoader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Medium: Story = {};
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <AttestLoader size="sm" />
      <AttestLoader size="md" />
      <AttestLoader size="lg" />
    </div>
  ),
};
/** Buttons with `loading` render the sm loader in currentColor. */
export const InButton: Story = {
  render: () => (
    <div className="flex gap-2">
      <Button loading>Running…</Button>
      <Button variant="outline" loading>Saving…</Button>
    </div>
  ),
};
/** Sequence: legs draw in, the tick draws in, a short hold, a quiet fade, loop. No glow or colour flash. */
export const Sequence: Story = { render: () => <AttestLoader size="lg" /> };
export const InlineStatus: Story = { render: () => <LoadingSpinner label="Loading screenshots…" /> };
export const FullScreen: Story = { parameters: { layout: "fullscreen" }, render: () => <AttestLoaderScreen /> };
/** Route loading: loader over the skeleton for ~300ms, then the skeleton. Re-render the story to replay. */
export const RouteLoading: Story = { parameters: { layout: "fullscreen" }, render: () => <PageSkeleton /> };
/** Enable "prefers-reduced-motion" in your OS/devtools to see the static pulsing mark. */
export const ReducedMotionNote: Story = { render: () => <AttestLoader size="lg" label="Loading (reduced motion shows a gentle pulse)" /> };
