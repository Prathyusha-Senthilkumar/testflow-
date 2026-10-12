import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { GitHubConnection } from "@/lib/api";
import { GitHubConnectionCard } from "@/components/integrations/GitHubConnectionCard";

const notConnected: GitHubConnection = {
  connected: false,
  owner: null,
  repo: null,
  repoUrl: null,
  tokenHint: null,
  autoCreateIssues: true,
  connectedAt: null,
};

const connected: GitHubConnection = {
  connected: true,
  owner: "revature",
  repo: "evolv-web",
  repoUrl: "https://github.com/revature/evolv-web",
  tokenHint: "…9f2c",
  autoCreateIssues: true,
  connectedAt: "2026-10-12T09:30:00Z",
};

const meta = {
  title: "TestFlow/Integrations/GitHubConnectionCard",
  component: GitHubConnectionCard,
  args: { onSave: fn(), onDisconnect: fn(), connection: notConnected },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GitHubConnectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotConnected: Story = {};

export const Connected: Story = { args: { connection: connected } };

export const AutoIssuesOff: Story = { args: { connection: { ...connected, autoCreateIssues: false } } };

export const Saving: Story = { args: { connection: connected, saving: true } };

export const Error: Story = {
  args: {
    error: "This token can't read revature/evolv-web. Give it Issues and Contents: read & write on this repository.",
  },
};

export const Loading: Story = { args: { connection: null } };
