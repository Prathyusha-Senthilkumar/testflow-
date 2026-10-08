import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { WorkerInfo, WorkersResponse } from "@/lib/api";
import { RunnersPanel } from "@/components/dashboard/runners-panel";
import { fn } from "storybook/test";
import type { GroupedRun, ProjectSummary, ReportRun } from "@/lib/api";
import {
  flakiestTests,
  kpiSeries,
  needsAttention,
  onboardingSteps,
  periodMetrics,
  projectHealth,
  recentRuns,
  slowestTests,
  trendBuckets,
  windowsFor,
} from "@/lib/dashboard";
import { PassFailTrendChart } from "@/components/charts/pass-fail-trend-chart";
import { Panel } from "@/components/dashboard/panel";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { NeedsAttentionList } from "@/components/dashboard/needs-attention";
import { RecentRunsTable } from "@/components/dashboard/recent-runs";
import { ProjectHealthList } from "@/components/dashboard/project-health";
import { FlakiestTestsList, SlowestTestsList } from "@/components/dashboard/test-lists";
import { OnboardingChecklist } from "@/components/dashboard/onboarding";

/* ---------------------------------------------------------------- fixtures */

const NOW = Date.UTC(2026, 9, 8, 14, 0);
const HOUR = 3_600_000;

const projects: ProjectSummary[] = [
  { id: "p1", name: "Evolv", baseUrl: "https://evolv.example.com", suites: 4, cases: 18, passed: 15, failed: 3, passRate: 83, lastRun: null, lastRunBy: null },
  { id: "p2", name: "SRM Website", baseUrl: "https://srm.example.com", suites: 5, cases: 8, passed: 8, failed: 0, passRate: 100, lastRun: null, lastRunBy: null },
  { id: "p3", name: "Auth Profile Project", baseUrl: "https://example.com", suites: 0, cases: 0, passed: 0, failed: 0, passRate: 0, lastRun: null, lastRunBy: null },
  { id: "p4", name: "Suite Test Project", baseUrl: "https://example.com", suites: 0, cases: 0, passed: 0, failed: 0, passRate: 0, lastRun: null, lastRunBy: null },
];

const tests = [
  { id: "t1", code: "TC-007", name: "Open Assessments", project: projects[0], pattern: "PFPFPPF", ms: 3200 },
  { id: "t2", code: "TC-002", name: "Check curricula button", project: projects[0], pattern: "PPPPPPP", ms: 2100 },
  { id: "t3", code: "TC-011", name: "Apply now submits form", project: projects[0], pattern: "PPPPPFF", ms: 8400 },
  { id: "t4", code: "TC-001", name: "Open admissions page", project: projects[1], pattern: "PPPPPPP", ms: 1400 },
  { id: "t5", code: "TC-004", name: "International admissions form", project: projects[1], pattern: "PFPPFPP", ms: 5600 },
];

const reportRuns: ReportRun[] = tests.flatMap((test, testIndex) =>
  test.pattern.split("").map((char, index) => ({
    id: `${test.id}-r${index}`,
    projectId: test.project.id,
    projectName: test.project.name,
    testCaseId: test.id,
    testCaseCode: test.code,
    testName: test.name,
    status: char === "P" ? "Passed" : "Failed",
    startedAt: new Date(NOW - (6 - index) * 22 * HOUR - testIndex * HOUR).toISOString(),
    durationMs: test.ms + index * 120,
    errorMessage: char === "F" ? `Expected text not found: ${test.name.split(" ").pop()}\nat step 4` : null,
  }))
);

const groupedRuns: GroupedRun[] = [
  { id: "live", runType: "suite", title: "Assessments", status: "Running", startedAt: new Date(NOW - 60_000).toISOString(), projectId: "p1", environmentName: "Staging" },
  ...reportRuns.slice(-12).map((run) => ({
    id: run.id,
    runType: "individual" as const,
    title: run.testName ?? "",
    code: run.testCaseCode,
    status: run.status,
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    projectId: run.projectId,
    environmentName: "Staging",
  })),
];

const { current, previous } = windowsFor("7d", NOW);
const buckets = trendBuckets(reportRuns, "7d", NOW);
const health = projectHealth(projects, reportRuns, current);
const names = Object.fromEntries(projects.map((project) => [project.id, project.name]));

/* ---------------------------------------------------------------- story */

type Args = { state: "loaded" | "loading" | "empty" };

function Panels({ state }: Args) {
  const loading = state === "loading";
  if (state === "empty") {
    return (
      <OnboardingChecklist
        steps={onboardingSteps({ firstProjectId: "p1", hasProject: true, hasEnvironment: true, hasAuthProfile: false, hasTestCase: false, hasRun: false })}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <KpiStrip
        current={loading ? null : periodMetrics(reportRuns, current)}
        previous={loading ? null : periodMetrics(reportRuns, previous)}
        series={loading ? null : kpiSeries(buckets)}
        periodLabel="7 days"
        loading={loading}
        onFailingClick={fn()}
      />
      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-8" title="Pass / fail trend" description="Finished runs per day" viewAllHref="/reports" viewAllLabel="Reports" bodyClassName="p-3">
          <PassFailTrendChart
            loading={loading}
            height={260}
            data={buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, passed: bucket.passed, failed: bucket.failed, isToday: bucket.isCurrent }))}
          />
        </Panel>
        <Panel className="xl:col-span-4" title="Needs attention" viewAllHref="/runs" bodyClassName="max-h-[318px] overflow-y-auto">
          <NeedsAttentionList items={needsAttention(reportRuns, current)} now={NOW} loading={loading} rerun={{ [`t3`]: "running" }} onRerun={fn()} />
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-8" title="Recent runs" viewAllHref="/runs" bodyClassName="border-0 bg-transparent">
          <RecentRunsTable runs={recentRuns(groupedRuns, 12)} projectNames={names} now={NOW} loading={loading} onOpen={fn()} />
        </Panel>
        <Panel className="xl:col-span-4" title="Project health" viewAllHref="/projects" bodyClassName="border-0 bg-transparent">
          <ProjectHealthList active={health.active} idle={health.idle} now={NOW} loading={loading} />
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Slowest tests" description="Median duration, last 7 days">
          <SlowestTestsList items={slowestTests(reportRuns, current)} loading={loading} />
        </Panel>
        <Panel title="Flakiest tests" description="Pass ↔ fail flips, last 7 days">
          <FlakiestTestsList items={flakiestTests(reportRuns, current)} loading={loading} />
        </Panel>
      </div>
    </div>
  );
}

const meta = {
  title: "Attest/Dashboard/Panels",
  component: Panels,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [(Story) => <div className="bg-background p-6"><Story /></div>],
  args: { state: "loaded" },
  argTypes: { state: { control: "inline-radio", options: ["loaded", "loading", "empty"] } },
} satisfies Meta<typeof Panels>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const Loading: Story = { args: { state: "loading" } };
/** First run: onboarding checklist replaces the panels until there is a run. */
export const Empty: Story = { args: { state: "empty" } };
/** Needs attention with nothing failing. */
export const AllClear: Story = {
  render: () => (
    <Panel title="Needs attention" className="max-w-md">
      <NeedsAttentionList items={[]} now={NOW} />
    </Panel>
  ),
};

/* ---------------------------------------------------------------- Runners */

const runnerWorker = (id: string, busySlots: number, concurrency = 3, warm = true): WorkerInfo => ({
  id,
  hostname: `runner-${id}`,
  pid: 100,
  version: "2.0.0",
  startedAt: new Date(NOW - 7_200_000).toISOString(),
  lastHeartbeatAt: new Date(NOW - 3_000).toISOString(),
  heartbeatAgeSec: 3,
  status: "online",
  concurrency,
  busy: busySlots,
  idle: concurrency - busySlots,
  slots: Array.from({ length: concurrency }, (_, index) =>
    index < busySlots
      ? { index, state: "running" as const, runId: `job-${id}-${index}`, testCaseId: `tc${index}`, projectId: "p1", testName: `TC-00${index + 1}`, testCaseName: "Open assessments", startedAt: new Date(NOW - 45_000 * (index + 1)).toISOString() }
      : { index, state: "idle" as const }
  ),
  browser: { connected: true, version: "130.0", contexts: busySlots + 1 },
  process: { rssMb: 640, heapUsedMb: 120, uptimeSec: 7200, loadAvg1: 1.2, cpuCount: 4 },
  processedTotal: 412,
  failedTotal: 9,
  warm: warm ? { browserReady: true, spareContexts: 1, browserLaunchedAt: new Date(NOW - 8_000_000).toISOString(), testsSinceLaunch: 63, coldStartsAvoided: 128 } : null,
});

const runnersResponse = (workers: WorkerInfo[], queued = 0): WorkersResponse => {
  const slots = workers.reduce((sum, worker) => sum + worker.concurrency, 0);
  const busy = workers.reduce((sum, worker) => sum + worker.busy, 0);
  return {
    generatedAt: new Date(NOW).toISOString(),
    totals: { workers: workers.length, online: workers.length, draining: 0, stale: 0, slots, busy, idle: slots - busy },
    queue: { queued, scheduled: 1, processing: busy, batchesPending: null },
    workers,
  };
};

const runnerDecorator = (Story: () => React.ReactElement) => <div className="max-w-sm">{Story()}</div>;

export const RunnersOnlineWarm: Story = {
  render: () => runnerDecorator(() => <RunnersPanel data={runnersResponse([runnerWorker("a", 1), runnerWorker("b", 2)])} />),
};
export const RunnersSaturated: Story = {
  render: () => runnerDecorator(() => <RunnersPanel data={runnersResponse([runnerWorker("a", 3, 3, false), runnerWorker("b", 3, 3, false)], 4)} />),
};
export const RunnersNoneReporting: Story = {
  render: () => runnerDecorator(() => <RunnersPanel data={{ ...runnersResponse([], 4), totals: { workers: 0, online: 0, draining: 0, stale: 0, slots: 0, busy: 0, idle: 0 } }} />),
};
export const RunnersUnavailable: Story = { render: () => runnerDecorator(() => <RunnersPanel data={null} unavailable />) };
export const RunnersLoading: Story = { render: () => runnerDecorator(() => <RunnersPanel data={null} loading />) };
