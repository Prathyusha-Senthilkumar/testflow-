import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import type { WorkerInfo, WorkersResponse } from "@/lib/api";
import type { WorkersState } from "@/hooks/useWorkers";
import { RunnersIndicatorView } from "@/components/runners/runners-indicator";
import { RunnersPanelView } from "@/components/runners/runners-panel";

const NOW = Date.UTC(2026, 9, 8, 14, 0);

const runner = (id: string, busy: number, concurrency = 3, overrides: Partial<WorkerInfo> = {}): WorkerInfo => ({
  id: `${id}-8f3a2c91`,
  hostname: `runner-${id}`,
  pid: 101,
  version: "2.1.0",
  startedAt: new Date(NOW - 7_200_000).toISOString(),
  lastHeartbeatAt: new Date(NOW - 3_000).toISOString(),
  heartbeatAgeSec: 3,
  status: "online",
  concurrency,
  busy,
  idle: concurrency - busy,
  slots: Array.from({ length: concurrency }, (_, index) =>
    index < busy
      ? { index, state: "running" as const, runId: `job-${id}-${index}`, testCaseId: `tc-${index}`, projectId: "p1", testName: `TC-00${index + 1}`, testCaseName: "Open assessments", startedAt: new Date(NOW - 40_000 * (index + 1)).toISOString() }
      : { index, state: "idle" as const }
  ),
  browser: { connected: true, version: "130.0", contexts: busy + 1 },
  process: { rssMb: 640, heapUsedMb: 120, uptimeSec: 7200, loadAvg1: 1.1, cpuCount: 4 },
  processedTotal: 412,
  failedTotal: 5,
  warm: { browserReady: true, spareContexts: 1, browserLaunchedAt: new Date(NOW - 8_000_000).toISOString(), testsSinceLaunch: 63, coldStartsAvoided: 128 },
  ...overrides,
});

const response = (workers: WorkerInfo[], queued = 0): WorkersResponse => {
  const live = workers.filter((worker) => worker.status !== "stale");
  const slots = live.reduce((sum, worker) => sum + worker.concurrency, 0);
  const busy = live.reduce((sum, worker) => sum + worker.busy, 0);
  return {
    generatedAt: new Date(NOW).toISOString(),
    totals: { workers: workers.length, online: live.length, draining: 0, stale: workers.length - live.length, slots, busy, idle: slots - busy },
    queue: { queued, scheduled: 1, processing: busy, batchesPending: null },
    workers,
  };
};

const state = (data: WorkersResponse | null, extra: Partial<WorkersState> = {}): WorkersState => ({
  data,
  loading: false,
  unavailable: false,
  error: null,
  updatedAt: NOW,
  paused: false,
  projectNames: { p1: "Evolv" },
  ...extra,
});

const ONLINE = response([runner("a", 1), runner("b", 0, 2)]);
const SATURATED = response([runner("a", 3), runner("b", 2, 2, { warm: { browserReady: true, spareContexts: 0, coldStartsAvoided: 12 } })], 4);
const NONE: WorkersResponse = { ...response([], 3), message: "No test runners are online right now. Tests you start will wait in the queue until a runner is available." };

/* ------------------------------------------------------------- indicator */

const meta = {
  title: "Attest/Runners/Indicator",
  component: RunnersIndicatorView,
  parameters: { layout: "centered" },
  args: { data: ONLINE, onClick: fn() },
} satisfies Meta<typeof RunnersIndicatorView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Online: Story = {};
export const Saturated: Story = { args: { data: SATURATED } };
export const NoRunners: Story = { args: { data: NONE } };
export const Loading: Story = { args: { data: null, loading: true } };

/* ------------------------------------------------------------- slide-over */

function Panel({ initial, selected: initialSelected = "__all__", tab: initialTab = "overview" }: { initial: WorkersState; selected?: string; tab?: "overview" | "runner" | "running" | "queue" }) {
  const [selected, setSelected] = useState(initialSelected);
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="h-[640px] w-[960px] overflow-hidden rounded-lg border border-border bg-surface">
      <RunnersPanelView state={initial} selected={selected} onSelect={setSelected} tab={tab} onTabChange={setTab} onClose={fn()} onExpand={fn()} />
    </div>
  );
}

export const SlideOverOverview: Story = { parameters: { layout: "padded" }, render: () => <Panel initial={state(ONLINE)} /> };
export const SlideOverRunnerSelected: Story = {
  parameters: { layout: "padded" },
  render: () => <Panel initial={state(ONLINE)} selected={ONLINE.workers[0].id} tab="runner" />,
};
export const SlideOverNoRunners: Story = { parameters: { layout: "padded" }, render: () => <Panel initial={state(NONE)} /> };
export const SlideOverLoading: Story = { parameters: { layout: "padded" }, render: () => <Panel initial={state(null, { loading: true, updatedAt: null })} /> };
