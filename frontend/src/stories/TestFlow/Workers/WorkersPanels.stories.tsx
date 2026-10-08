import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { WorkerInfo, WorkersResponse } from "@/lib/api";
import { WorkersOverview } from "@/components/workers/workers-overview";
import { LiveIndicator } from "@/components/workers/live-indicator";

const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();

function worker(overrides: Partial<WorkerInfo> & Pick<WorkerInfo, "id" | "hostname">): WorkerInfo {
  const concurrency = overrides.concurrency ?? 4;
  const slots =
    overrides.slots ??
    Array.from({ length: concurrency }, (_, index) =>
      index < 2
        ? { index, state: "running" as const, jobId: `job-${index}`, runId: `run-${index}`, testCaseId: `tc-${index}`, projectId: "p1", testName: index === 0 ? "TC-007 Open assessments" : "TC-012 Apply now submits form", startedAt: ago(40 + index * 75) }
        : { index, state: "idle" as const }
    );
  const busy = slots.filter((slot) => slot.state === "running").length;
  return {
    pid: 4182,
    version: "1.8.0",
    startedAt: ago(8040),
    lastHeartbeatAt: ago(3),
    heartbeatAgeSec: 3,
    status: "online",
    concurrency,
    busy,
    idle: concurrency - busy,
    browser: { connected: true, version: "131.0.6778.33", contexts: busy + 2 },
    process: { rssMb: 612, heapUsedMb: 188, uptimeSec: 8040, loadAvg1: 1.34, cpuCount: 4 },
    processedTotal: 1284,
    failedTotal: 37,
    warm: { browserReady: true, spareContexts: 2, browserLaunchedAt: ago(8040), testsSinceLaunch: 63, lastRecycleAt: ago(8040), coldStartsAvoided: 128 },
    ...overrides,
    slots,
  };
}

function response(workers: WorkerInfo[], queue: WorkersResponse["queue"] = { queued: 0, scheduled: 3, processing: 2, batchesPending: 1 }, message?: string): WorkersResponse {
  const slots = workers.reduce((sum, item) => sum + item.concurrency, 0);
  const busy = workers.reduce((sum, item) => sum + item.busy, 0);
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      workers: workers.length,
      online: workers.filter((item) => item.status === "online").length,
      stale: workers.filter((item) => item.status === "stale").length,
      slots,
      busy,
      idle: slots - busy,
    },
    queue,
    message,
    workers,
  };
}

const projectNames = { p1: "Evolv" };

const meta = {
  title: "Attest/Workers/Panels",
  component: WorkersOverview,
  parameters: { layout: "padded" },
  args: { data: null, projectNames },
} satisfies Meta<typeof WorkersOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Hover or click a running (blue) slot for details and links. */
export const OnlineWithBusySlots: Story = {
  args: { data: response([worker({ id: "w1-8f3a2c91", hostname: "runner-1" }), worker({ id: "w2-1b77d0e4", hostname: "runner-2", slots: undefined, concurrency: 2, warm: { browserReady: true, spareContexts: 0, testsSinceLaunch: 12, coldStartsAvoided: 9 } })]) },
};

const busySlots = (prefix: string) =>
  Array.from({ length: 4 }, (_, index) => ({ index, state: "running" as const, runId: `${prefix}-r${index}`, testCaseId: `tc${index}`, projectId: "p1", testName: `TC-00${index + 1} Regression step ${index + 1}`, startedAt: ago(20 + index * 30) }));

/** Work is waiting and no slot is idle: warning tone + "Saturated". */
export const Saturated: Story = {
  args: {
    data: response(
      [worker({ id: "w1-sat", hostname: "runner-1", slots: busySlots("a"), process: { rssMb: 1890, heapUsedMb: 400, uptimeSec: 3600, loadAvg1: 3.9, cpuCount: 4 } }), worker({ id: "w2-sat", hostname: "runner-2", slots: busySlots("b") })],
      { queued: 14, scheduled: 2, processing: 8, batchesPending: 2 }
    ),
  },
};

export const StaleWorker: Story = {
  args: {
    data: response([
      worker({ id: "w1-ok", hostname: "runner-1" }),
      worker({ id: "w3-stale", hostname: "runner-3", status: "stale", heartbeatAgeSec: 47, lastHeartbeatAt: ago(47), browser: { connected: false, version: null, contexts: 0 }, slots: Array.from({ length: 4 }, (_, index) => ({ index, state: "idle" as const })) }),
    ]),
  },
};

export const WarmAndCold: Story = {
  args: {
    data: response([
      worker({ id: "w1-warm", hostname: "warm-runner" }),
      worker({ id: "w2-warming", hostname: "warming-runner", warm: { browserReady: false, spareContexts: 0 } }),
      worker({ id: "w3-cold", hostname: "cold-runner", warm: { browserReady: true, spareContexts: 0, browserLaunchedAt: ago(600), testsSinceLaunch: 2, coldStartsAvoided: 0 } }),
      worker({ id: "w4-old", hostname: "old-build-runner", version: "1.6.2", warm: undefined }),
    ]),
  },
};

export const EmptyNoHeartbeats: Story = { args: { data: response([], null, "No worker heartbeats yet.") } };
/** The backend predates `/workers` (404). */
export const OldBuild: Story = { args: { data: null, unavailable: true } };
export const Loading: Story = { args: { data: null, loading: true } };
export const RefreshError: Story = { args: { data: response([worker({ id: "w1", hostname: "runner-1" })]), error: "Could not reach the API." } };

export const LiveIndicatorStates: Story = {
  render: () => (
    <div className="space-y-3">
      <LiveIndicator updatedAt={Date.now() - 3000} />
      <LiveIndicator updatedAt={Date.now() - 20000} paused />
      <LiveIndicator updatedAt={null} />
    </div>
  ),
};
