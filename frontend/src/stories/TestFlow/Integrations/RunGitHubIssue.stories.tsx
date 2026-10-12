import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { RunGitHubIssue } from "@/components/integrations/RunGitHubIssue";

const issue = { number: 142, url: "https://github.com/revature/evolv-web/issues/142", createdAt: "2026-10-12T09:31:00Z" };

const meta = {
  title: "TestFlow/Integrations/RunGitHubIssue",
  component: RunGitHubIssue,
  args: { onCreate: fn(), status: { connected: true, issue: null } },
  decorators: [
    (Story) => (
      <div className="w-72 rounded-lg border border-border bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RunGitHubIssue>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoIssueYet: Story = {};

export const Creating: Story = { args: { creating: true } };

export const Pending: Story = { args: { status: { connected: true, issue: { ...issue, state: "pending" } } } };

export const Open: Story = { args: { status: { connected: true, issue: { ...issue, state: "open" } } } };

export const Closed: Story = { args: { status: { connected: true, issue: { ...issue, state: "closed" } } } };

export const Error: Story = { args: { status: { connected: true, issue: { ...issue, state: "error", error: "The token isn't allowed to create issues in acme/shop-web. On GitHub, edit the token and set Repository permissions › Issues: Read and write." } } } };

/** Renders nothing: the project has no GitHub connection. */
export const NotConnected: Story = { args: { status: { connected: false, issue: null } } };
