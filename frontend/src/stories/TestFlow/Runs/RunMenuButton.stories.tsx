import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { EnvironmentSummary } from "@/lib/api";
import { RunMenuButton } from "@/components/runs/RunMenuButton";

const environments: EnvironmentSummary[] = [
  { id: "staging", projectId: "p1", name: "Staging", baseUrl: "https://evolv-dev.revature.io", isDefault: true },
  { id: "qa", projectId: "p1", name: "QA", baseUrl: "https://qa.evolv.revature.io" },
  { id: "prod", projectId: "p1", name: "Production", baseUrl: "https://evolv.revature.io" },
];

const meta = {
  title: "TestFlow/Runs/RunMenuButton",
  component: RunMenuButton,
  args: { onRun: fn(), onRunOn: fn(), onSchedule: fn() },
} satisfies Meta<typeof RunMenuButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { environments, selectedEnvironmentId: "staging", defaultEnvironmentId: "staging", title: "Run on Staging" },
};

export const TestUsesOtherEnvironment: Story = {
  args: { environments, selectedEnvironmentId: "qa", defaultEnvironmentId: "staging" },
};

export const ProjectWithOptions: Story = {
  args: {
    label: "Run project",
    environments,
    selectedEnvironmentId: "staging",
    defaultEnvironmentId: "staging",
    onRunWithOptions: fn(),
  },
};

export const SuiteRowSmall: Story = {
  args: { label: "Run suite", size: "sm", variant: "outline", environments, selectedEnvironmentId: "staging", defaultEnvironmentId: "staging" },
};

export const ScheduleOnly: Story = { args: { onRunOn: undefined } };

export const Running: Story = { args: { environments, selectedEnvironmentId: "staging", running: true, disabled: true } };

export const Disabled: Story = { args: { environments, disabled: true } };

export const NoEnvironments: Story = { args: { environments: [], scheduleDisabled: true } };
