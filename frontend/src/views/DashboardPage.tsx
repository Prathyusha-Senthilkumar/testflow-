"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "@/lib/navigation";
import { api, type DashboardData, type GroupedRun, type ProjectSummary, type ReportRun } from "@/lib/api";
import {
  DASHBOARD_RANGES,
  filterByProject,
  flakiestTests,
  groupedRunHref,
  isActiveStatus,
  isDashboardRange,
  kpiSeries,
  needsAttention,
  onboardingSteps,
  periodMetrics,
  projectHealth,
  recentRuns,
  slowestTests,
  trendBuckets,
  windowsFor,
  type AttentionItem,
  type DashboardRange,
} from "@/lib/dashboard";
import { pollWhileVisible } from "@/hooks/useExecutionPolling";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Alert } from "@/components/ui/alert";
import { PageSkeleton } from "@/app/_ui/PageSkeleton";
import { Panel } from "@/components/dashboard/panel";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { NeedsAttentionList, type RerunState } from "@/components/dashboard/needs-attention";
import { RecentRunsTable } from "@/components/dashboard/recent-runs";
import { ProjectHealthList } from "@/components/dashboard/project-health";
import { FlakiestTestsList, SlowestTestsList } from "@/components/dashboard/test-lists";
import { OnboardingChecklist } from "@/components/dashboard/onboarding";
import { RunnersPanel } from "@/components/dashboard/runners-panel";
import { useRunners } from "@/components/runners/runners-context";
import { useConfirm } from "@/components/ui/confirm-dialog";

const RANGE_LABEL: Record<DashboardRange, string> = { "24h": "24h", "7d": "7 days", "30d": "30 days" };
const EMPTY_RUNS: ReportRun[] = [];
const EMPTY_GROUPED: GroupedRun[] = [];
const EMPTY_PROJECTS: ProjectSummary[] = [];

type Loaded = {
  dashboard: DashboardData | null;
  projects: ProjectSummary[];
  reportRuns: ReportRun[];
  groupedRuns: GroupedRun[];
  errors: string[];
};

function message(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

/** Loads every source independently so one failing endpoint doesn't blank the page. */
async function loadAll(): Promise<Loaded> {
  const [dashboard, projects, reportRuns, groupedRuns] = await Promise.allSettled([
    api.dashboard(),
    api.projects(),
    api.reportRuns(),
    api.groupedRuns(),
  ]);
  const errors: string[] = [];
  if (projects.status === "rejected") errors.push(`Projects: ${message(projects.reason, "could not load")}`);
  if (reportRuns.status === "rejected") errors.push(`Run history: ${message(reportRuns.reason, "could not load")}`);
  if (groupedRuns.status === "rejected") errors.push(`Recent runs: ${message(groupedRuns.reason, "could not load")}`);
  return {
    dashboard: dashboard.status === "fulfilled" ? dashboard.value : null,
    projects: projects.status === "fulfilled" ? projects.value : EMPTY_PROJECTS,
    reportRuns: reportRuns.status === "fulfilled" ? reportRuns.value : EMPTY_RUNS,
    groupedRuns: groupedRuns.status === "fulfilled" ? groupedRuns.value : EMPTY_GROUPED,
    errors,
  };
}

function DashboardContent() {
  const params = useSearchParams();
  const navigate = useNavigate();
  // Runner status: shares polling + 404 handling with /workers (10s here, paused while hidden).
  const { state: runners, openPanel: openRunners } = useRunners();
  const range: DashboardRange = isDashboardRange(params?.get("range")) ? (params?.get("range") as DashboardRange) : "7d";
  const projectId = params?.get("project") ?? "";

  const [data, setData] = useState<Loaded | null>(null);
  const [now, setNow] = useState(0);
  const [rerun, setRerun] = useState<Record<string, RerunState>>({});
  const [setup, setSetup] = useState<{ env: boolean; auth: boolean } | null>(null);
  const stopRerunPolls = useRef<(() => void)[]>([]);

  const refresh = useCallback(async () => {
    const loaded = await loadAll();
    setData(loaded);
    setNow(Date.now());
    return loaded;
  }, []);

  const confirm = useConfirm();
  /** Cancel a run that has been waiting in the queue for a long time. */
  const cancelStaleRun = useCallback(
    async (run: GroupedRun) => {
      const cancelled = await confirm({
        title: "Cancel this queued run?",
        confirmLabel: "Cancel run",
        cancelLabel: "Keep waiting",
        description: (
          <p>
            <strong>{run.title}</strong> has been waiting in the queue for a long time. Cancelling removes it from the queue.
          </p>
        ),
        onConfirm: async () => {
          if (run.runType === "individual") await api.cancelTestRun(run.id);
          else await api.cancelBatchRun(run.id);
        },
      });
      if (!cancelled) return;
      toast.success("Run cancelled");
      void refresh();
    },
    [confirm, refresh]
  );

  useEffect(() => {
    void refresh();
    const stops = stopRerunPolls.current;
    return () => stops.forEach((stop) => stop());
  }, [refresh]);

  // Poll recent runs while anything is queued/running; refresh history once they settle.
  const hasLive = Boolean(data?.groupedRuns.some((run) => isActiveStatus(run.status)));
  useEffect(() => {
    if (!hasLive) return;
    return pollWhileVisible(async () => {
      try {
        const grouped = await api.groupedRuns();
        const stillLive = grouped.some((run) => isActiveStatus(run.status));
        if (stillLive) {
          setData((current) => (current ? { ...current, groupedRuns: grouped } : current));
          setNow(Date.now());
          return true;
        }
        await refresh();
        return false;
      } catch {
        return true;
      }
    }, 4000);
  }, [hasLive, refresh]);

  function setParam(key: "range" | "project", value: string) {
    const next = new URLSearchParams(params?.toString() ?? "");
    if (!value || (key === "range" && value === "7d")) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    navigate(`/dashboard${query ? `?${query}` : ""}`, { replace: true });
  }

  const projects = data?.projects ?? EMPTY_PROJECTS;
  const allRuns = data?.reportRuns ?? EMPTY_RUNS;
  const runs = useMemo(() => filterByProject(allRuns, projectId), [allRuns, projectId]);
  const grouped = useMemo(() => filterByProject(data?.groupedRuns ?? EMPTY_GROUPED, projectId), [data?.groupedRuns, projectId]);
  const scopedProjects = useMemo(() => (projectId ? projects.filter((item) => item.id === projectId) : projects), [projects, projectId]);
  const projectNames = useMemo(() => Object.fromEntries(projects.map((item) => [item.id, item.name])), [projects]);

  const derived = useMemo(() => {
    if (!data || !now) return null;
    const { current, previous } = windowsFor(range, now);
    const buckets = trendBuckets(runs, range, now);
    return {
      current: periodMetrics(runs, current),
      previous: periodMetrics(runs, previous),
      series: kpiSeries(buckets),
      trend: buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, passed: bucket.passed, failed: bucket.failed, isToday: bucket.isCurrent })),
      attention: needsAttention(runs, current),
      health: projectHealth(scopedProjects, runs, current),
      slowest: slowestTests(runs, current),
      flakiest: flakiestTests(runs, current),
      recent: recentRuns(grouped.filter((run) => isActiveStatus(run.status) || (run.startedAt && new Date(run.startedAt).getTime() >= current.start)), 15),
    };
  }, [data, now, range, runs, grouped, scopedProjects]);

  const loading = !data;
  const firstRun = Boolean(data) && (projects.length === 0 || allRuns.length === 0);
  const firstProjectId = projects[0]?.id ?? null;

  // Onboarding needs environment/auth presence for the first project; only fetched in that state.
  useEffect(() => {
    if (!firstRun || !firstProjectId) return;
    let cancelled = false;
    Promise.allSettled([api.environments(firstProjectId), api.authProfiles(firstProjectId)]).then(([envs, auths]) => {
      if (cancelled) return;
      setSetup({
        env: envs.status === "fulfilled" && envs.value.length > 0,
        auth: auths.status === "fulfilled" && auths.value.length > 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [firstRun, firstProjectId]);

  function startRerun(item: AttentionItem) {
    setRerun((current) => ({ ...current, [item.testKey]: "starting" }));
    api
      .rerunTestRun(item.runId)
      .then((started) => {
        toast.success(`Rerun started: ${item.code ? `${item.code} ` : ""}${item.name}`);
        setRerun((current) => ({ ...current, [item.testKey]: started.state === "running" ? "running" : "queued" }));
        const stop = pollWhileVisible(async () => {
          try {
            const status = await api.getExecution(started.jobId);
            if (status.state === "queued" || status.state === "running" || status.state === "scheduled") {
              setRerun((current) => ({ ...current, [item.testKey]: status.state === "running" ? "running" : "queued" }));
              return true;
            }
            const passed = status.state === "completed" && (status.result?.success ?? status.result?.status?.toLowerCase() === "passed");
            setRerun((current) => ({ ...current, [item.testKey]: passed ? "passed" : "failed" }));
            void refresh();
            return false;
          } catch {
            return true;
          }
        }, 2000);
        stopRerunPolls.current.push(stop);
      })
      .catch((error: unknown) => {
        toast.error(message(error, "Could not start the rerun"));
        setRerun((current) => ({ ...current, [item.testKey]: "error" }));
      });
  }

  const steps = onboardingSteps({
    firstProjectId,
    hasProject: projects.length > 0,
    hasEnvironment: Boolean(setup?.env),
    hasAuthProfile: Boolean(setup?.auth),
    hasTestCase: (data?.dashboard?.testCases ?? 0) > 0 || projects.some((item) => item.cases > 0),
    hasRun: allRuns.length > 0,
  });

  const projectOptions = [{ value: "", label: "All projects" }, ...projects.map((item) => ({ value: item.id, label: item.name }))];
  const periodLabel = RANGE_LABEL[range];

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Test health across your projects: what's failing, what's flaky and what ran recently."
        actions={
          <>
            <SegmentedControl
              aria-label="Time range"
              size="sm"
              options={DASHBOARD_RANGES}
              value={range}
              onChange={(value) => setParam("range", value)}
            />
            <Select
              aria-label="Project"
              className="w-44"
              triggerClassName="h-8"
              value={projectId}
              onChange={(value) => setParam("project", value)}
              options={projectOptions}
              disabled={loading}
            />
          </>
        }
      />

      {data?.errors.length ? (
        <Alert variant="error" title="Some dashboard data could not load">
          {data.errors.join(" · ")}
        </Alert>
      ) : null}

      {firstRun ? (
        <OnboardingChecklist steps={steps} />
      ) : (
        <>
          <KpiStrip
            current={derived?.current ?? null}
            previous={derived?.previous ?? null}
            series={derived?.series ?? null}
            periodLabel={periodLabel}
            loading={loading}
            onFailingClick={() => document.getElementById("needs-attention")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />

          {/* Dashboard = now/attention. Trends and per-suite analysis live in Reports. */}
          <div className="grid gap-4 xl:grid-cols-12">
            <Panel id="needs-attention" className="xl:col-span-8" title="Needs attention" viewAllHref="/runs" bodyClassName="max-h-[360px] overflow-y-auto">
              <NeedsAttentionList items={derived?.attention ?? []} now={now} loading={loading} rerun={rerun} onRerun={startRerun} />
            </Panel>
            <RunnersPanel
              className="xl:col-span-4"
              data={runners.data}
              loading={runners.loading}
              unavailable={runners.unavailable}
              error={runners.error}
              projectNames={runners.projectNames}
              onViewAll={openRunners}
              />
          </div>

          <div className="grid gap-4 xl:grid-cols-12">
            <Panel className="xl:col-span-8" title="Recent runs" viewAllHref="/runs" bodyClassName="border-0 bg-transparent">
              <RecentRunsTable
                runs={derived?.recent ?? []}
                projectNames={projectNames}
                now={now}
                loading={loading}
                onOpen={(run) => {
                  const href = groupedRunHref(run);
                  if (href) navigate(href);
                }}
                onCancel={cancelStaleRun}
              />
            </Panel>
            <Panel className="xl:col-span-4" title="Project health" viewAllHref="/projects" bodyClassName="border-0 bg-transparent">
              <ProjectHealthList active={derived?.health.active ?? []} idle={derived?.health.idle ?? []} now={now} loading={loading} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Slowest tests" description={`Median duration, last ${periodLabel}`}>
              <SlowestTestsList items={derived?.slowest ?? []} loading={loading} />
            </Panel>
            <Panel title="Flakiest tests" description={`Pass ↔ fail flips, last ${periodLabel}`}>
              <FlakiestTestsList items={derived?.flakiest ?? []} loading={loading} />
            </Panel>
          </div>
        </>
      )}
    </PageContainer>
  );
}

/** QA command centre. URL state: `?range=24h|7d|30d&project=<id>`. */
export function DashboardPage() {
  // useSearchParams needs a Suspense boundary on statically rendered routes.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

export default DashboardPage;
