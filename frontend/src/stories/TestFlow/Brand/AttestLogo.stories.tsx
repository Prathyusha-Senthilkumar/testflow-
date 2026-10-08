import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AttestLogo, AttestMark } from "@/components/brand/attest-logo";

const meta = {
  title: "Attest/Brand/Logo",
  component: AttestLogo,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AttestLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Use the toolbar theme switch to see light and dark. */
export const FullLogo: Story = { args: { markClassName: "size-8", wordmarkClassName: "text-xl" } };
export const Mark: Story = { render: () => <AttestMark className="size-12" title="Attest" /> };
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6">
      {["size-4", "size-6", "size-8", "size-12", "size-16"].map((size) => (
        <AttestMark key={size} className={size} />
      ))}
    </div>
  ),
};
/** On a primary fill (app icon, splash). */
export const OnPrimary: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <span className="grid size-16 place-items-center rounded-[14px] bg-primary">
        <AttestMark variant="onPrimary" className="size-10" />
      </span>
      <span className="rounded-lg bg-primary px-4 py-3">
        <AttestLogo variant="onPrimary" markClassName="size-7" wordmarkClassName="text-lg" />
      </span>
    </div>
  ),
};
/** Light and dark side by side regardless of the toolbar theme. */
export const LightAndDark: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="grid grid-cols-2">
      {(["light", "dark"] as const).map((theme) => (
        <div key={theme} data-theme={theme} className="grid h-48 place-items-center bg-background">
          <AttestLogo markClassName="size-8" wordmarkClassName="text-xl" />
        </div>
      ))}
    </div>
  ),
};
