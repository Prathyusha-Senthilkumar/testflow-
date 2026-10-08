import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardArrow, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";

const meta = {
  title: "Attest/UI/Card",
  component: Card,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: <CardContent className="text-muted-foreground">Project summary content goes here.</CardContent> },
};

/** Legacy `title` / `description` props render a CardHeader. */
export const WithTitle: Story = {
  args: {
    title: "Admissions regression",
    description: "Core student portal coverage.",
    children: <CardContent className="text-muted-foreground tabular-nums">84 test cases · 96% pass rate</CardContent>,
  },
};

export const Composed: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Environments</CardTitle>
          <CardDescription>Base URLs tests run against.</CardDescription>
        </div>
        <CardAction><Button size="sm" variant="outline">Add</Button></CardAction>
      </CardHeader>
      <CardContent className="font-mono text-[13px] text-muted-foreground">https://staging.example.com</CardContent>
      <CardFooter><Button size="sm">Save</Button></CardFooter>
    </Card>
  ),
};

/** Clickable card: hover/focus brightens the border, fills, tints the title and reveals the arrow. Tab to see focus. */
export const Interactive: Story = {
  render: () => (
    <div className="grid gap-3">
      <Card interactive asChild>
        <a href="#evolv" className="block p-4">
          <p data-card-title className="text-sm font-semibold">Evolv</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">https://evolv.example.com</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
            <RunStatusBadge status="failed" /> 18 test cases · 4 suites
          </div>
          <CardArrow />
        </a>
      </Card>
      <Card interactive selected asChild>
        <a href="#srm" className="block p-4">
          <p data-card-title className="text-sm font-semibold">SRM Website Testing (selected)</p>
          <p className="mt-1 text-xs text-muted-foreground">8 test cases</p>
          <CardArrow />
        </a>
      </Card>
      <Card>
        <CardContent className="text-muted-foreground">Non-interactive card: no hover change.</CardContent>
      </Card>
    </div>
  ),
};
