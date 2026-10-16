"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { WaitingHint } from "@/components/runs/WaitingHint";
import { friendlyRunError } from "@/lib/friendlyRunError";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ArrowLeft, CheckCircle2, FileCheck2, FileText, FolderKanban, History, Layers, RotateCcw, Search, Square, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate, useSearchParams } from "@/lib/navigation";
import { api, type GroupedRun, type ProjectDetail, type ReportRun, type ScheduledExecution, type SuiteSummary, type TestCaseSummary, type TestSuiteDetail } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScheduledRuns, type ScheduledRunRow } from "@/components/runs/ScheduledRuns";
import { useScheduledBatches } from "@/hooks/useScheduledBatches";
import { formatInTimeZone } from "@/lib/scheduleTime";
import { SUITE_CATEGORIES, SUITE_CATEGORY_LABELS, suiteCategoryLabel } from "@/lib/suiteCategory";
import { SuiteCategoryBadges } from "@/components/suites/SuiteCategoryBadge";
import { Stat, StatGroup } from "@/components/common/Stat";
import { pollWhileVisible } from "@/hooks/useExecutionPolling";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page-header";
import { DataTable, createDataTableColumns, type DataTableColumn } from "@/components/ui/data-table";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { Select } from "@/components/ui/select";

const POLL_MS = 4000;

const TYPE_ICON = {
  project: FolderKanban,
  suite: Layers,
  individual: FileText,
} as const;

const TYPE_LABELS: Record<GroupedRun["runType"], string> = {
  individual: "Individual",
  suite: "Suite",
  project: "Project",
};

const TYPE_OPTIONS = [
  { value: "all", label: "All runs" },
  { value: "individual", label: "Individual" },
  { value: "suite", label: "Suite" },
  { value: "project", label: "Project" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "Passed", label: "Passed" },
  { value: "Failed", label: "Failed" },
  { value: "Running", label: "Running" },
  { value: "Queued", label: "Queued" },
  { value: "Completed", label: "Completed" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "Skipped", label: "Skipped" },
];

const DATE_OPTIONS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
] as const;

type DatePreset = (typeof DATE_OPTIONS)[number]["value"];

function matchesDate(value: string | null | undefined, preset: DatePreset): boolean {
  if (preset === "all") return true;
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (preset !== "today") start.setDate(start.getDate() - (preset === "7" ? 6 : 29));
  return time >= start.getTime();
}

function isLive(run: GroupedRun): boolean {
  return run.status === "Queued" || run.status === "Running";
}

function formatDuration(durationMs?: number | null): string {
  if (durationMs === null || durationMs === undefined) return "—";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatWhen(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

type HistoryRun = GroupedRun & {
  projectName?: string | null;
  testCaseId?: string | null;
  suiteId?: string | null;
  times?: number;
  /** Built from saved case runs. There is no batch page for this row. */
  historyOnly?: boolean;
};

const CLUSTER_GAP_MS = 10 * 60 * 1000;

function startedMs(value?: string | null): number {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function clusterRuns(runs: ReportRun[], keyOf: (run: ReportRun) => string | null): ReportRun[][] {
  const byKey = new Map<string, ReportRun[]>();
  for (const run of runs) {
    const key = keyOf(run);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(run);
    byKey.set(key, list);
  }
  const clusters: ReportRun[][] = [];
  for (const list of byKey.values()) {
    const ordered = [...list].sort((a, b) => startedMs(a.startedAt) - startedMs(b.startedAt));
    let current: ReportRun[] = [];
    let last = 0;
    for (const run of ordered) {
      const time = startedMs(run.startedAt);
      if (current.length === 0 || time - last <= CLUSTER_GAP_MS) current.push(run);
      else {
        clusters.push(current);
        current = [run];
      }
      last = time;
    }
    if (current.length > 0) clusters.push(current);
  }
  return clusters;
}

function historyStatus(runs: Array<{ status: string; errorMessage?: string | null }>): string {
  const statuses = runs.map((run) => (run.status === "Not Run" && run.errorMessage === "Cancelled" ? "Cancelled" : run.status));
  if (statuses.some((status) => status === "Failed")) return "Failed";
  if (statuses.some((status) => status === "Running")) return "Running";
  if (statuses.some((status) => status === "Queued")) return "Queued";
  if (statuses.some((status) => status === "Passed")) return "Completed";
  if (statuses.every((status) => status === "Cancelled")) return "Cancelled";
  return "Skipped";
}

function historyRow(runType: "suite" | "project", cluster: ReportRun[]): HistoryRun | null {
  if (cluster.length < 2) return null;
  const ordered = [...cluster].sort((a, b) => startedMs(a.startedAt) - startedMs(b.startedAt));
  const first = ordered[0];
  const startedAt = first.startedAt || null;
  const end = ordered.reduce((latest, run) => Math.max(latest, startedMs(run.completedAt || run.startedAt)), 0);
  const start = startedMs(startedAt);
  const passed = ordered.filter((run) => run.status === "Passed").length;
  const failed = ordered.filter((run) => run.status === "Failed").length;
  const skipped = ordered.filter((run) => run.status !== "Passed" && run.status !== "Failed" && run.status !== "Running" && run.status !== "Queued").length;
  const idKey = runType === "suite" ? first.suiteId : first.projectId;
  return {
    id: `history-${runType}-${idKey}-${startedAt}`,
    runType,
    title: runType === "suite" ? first.suiteName || "Suite" : first.projectName || "Project",
    status: historyStatus(ordered),
    startedAt,
    durationMs: end > start ? end - start : null,
    projectId: first.projectId,
    projectName: first.projectName,
    suiteId: runType === "suite" ? first.suiteId : null,
    total: ordered.length,
    completed: ordered.length,
    passed,
    failed,
    skipped,
    historyOnly: true,
  };
}

function coveredByBatch(grouped: GroupedRun[], row: HistoryRun): boolean {
  const started = startedMs(row.startedAt);
  return grouped.some((run) => {
    if (run.runType !== row.runType || (run.projectId || "") !== (row.projectId || "")) return false;
    if (row.runType === "suite" && run.title !== row.title) return false;
    return Math.abs(startedMs(run.startedAt) - started) <= CLUSTER_GAP_MS;
  });
}

function countKey(run: HistoryRun): string {
  if (run.runType === "individual") return `case:${run.testCaseId || run.code || run.title}`;
  if (run.runType === "project") return `project:${run.projectId || run.title}`;
  return `suite:${run.projectId || ""}:${run.title}`;
}

function withExecutionCounts(rows: HistoryRun[]): HistoryRun[] {
  const counts = new Map<string, number>();
  for (const run of rows) counts.set(countKey(run), (counts.get(countKey(run)) ?? 0) + 1);
  return rows.map((run) => ({ ...run, times: counts.get(countKey(run)) ?? 1 }));
}

function mergeHistory(grouped: GroupedRun[], reports: ReportRun[]): HistoryRun[] {
  const reportById = new Map(reports.map((run) => [run.id, run]));
  const projectNames = new Map<string, string>();
  for (const run of reports) {
    if (run.projectId && run.projectName) projectNames.set(run.projectId, run.projectName);
  }
  const seen = new Set<string>();
  const rows: HistoryRun[] = grouped.map((run) => {
    seen.add(run.id);
    const saved = reportById.get(run.id);
    const projectName =
      run.runType === "project" ? run.title : saved?.projectName || (run.projectId ? projectNames.get(run.projectId) : null) || null;
    return {
      ...run,
      projectName,
      testCaseId: saved?.testCaseId || null,
      title: run.runType === "individual" ? saved?.testName || run.title : run.title,
      code: run.code || saved?.testCaseCode || null,
      startedAt: run.startedAt || saved?.startedAt || null,
    };
  });
  for (const run of reports) {
    if (seen.has(run.id)) continue;
    rows.push({
      id: run.id,
      runType: "individual",
      title: run.testName || "Test case",
      code: run.testCaseCode,
      testCaseId: run.testCaseId,
      status: run.status === "Not Run" && run.errorMessage === "Cancelled" ? "Cancelled" : run.status,
      startedAt: run.startedAt,
      durationMs: run.durationMs,
      projectId: run.projectId,
      projectName: run.projectName,
      errorMessage: run.errorMessage,
    });
  }
  for (const cluster of clusterRuns(reports, (run) => (run.projectId && run.suiteId ? `${run.projectId}:${run.suiteId}` : null))) {
    const row = historyRow("suite", cluster);
    if (row && !coveredByBatch(grouped, row)) rows.push(row);
  }
  for (const cluster of clusterRuns(reports, (run) => run.projectId || null)) {
    const row = historyRow("project", cluster);
    if (row && !coveredByBatch(grouped, row)) rows.push(row);
  }
  rows.sort((a, b) => {
    const left = new Date(b.startedAt || 0).getTime();
    const right = new Date(a.startedAt || 0).getTime();
    return (Number.isNaN(left) ? 0 : left) - (Number.isNaN(right) ? 0 : right);
  });
  return withExecutionCounts(rows);
}

function summary(run: GroupedRun): string {
  if (run.runType === "individual") return friendlyRunError(run.errorMessage) || "—";
  const parts = [
    `${run.passed ?? 0} Passed`,
    `${run.failed ?? 0} Failed`,
    `${run.skipped ?? 0} Skipped`,
  ];
  const waiting = (run.queued ?? 0) + (run.running ?? 0);
  if ((run.cancelled ?? 0) > 0) parts.push(`${run.cancelled} Cancelled`);
  if (waiting > 0) parts.push(`${waiting} Queued/Running`);
  return parts.join(" · ");
}

function progress(run: GroupedRun): string {
  if (run.runType === "individual" || run.total == null) return "—";
  return `${run.completed ?? 0} / ${run.total}`;
}

function RunActions({ run }: { run: HistoryRun }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const active = isLive(run);
  const canRerun = ["Passed", "Failed", "Skipped", "Cancelled", "Completed"].includes(run.status);

  async function cancel(event: MouseEvent) {
    event.stopPropagation();
    const ok = await confirm({
      title: "Cancel this run?",
      tone: "danger",
      confirmLabel: "Cancel run",
      cancelLabel: "Keep running",
      description: <p>Tests that haven’t finished will stop. Results already recorded are kept.</p>,
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (run.runType === "individual") await api.cancelTestRun(run.id);
      else await api.cancelBatchRun(run.id);
      toast.success("Cancellation requested", { description: run.title });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel this run");
    } finally {
      setBusy(false);
    }
  }

  async function rerun(event: MouseEvent) {
    event.stopPropagation();
    setBusy(true);
    try {
      if (run.runType === "individual") {
        await api.rerunTestRun(run.id);
        toast.success("Run started", { description: run.title });
        return;
      }
      await api.rerunBatch(run.id);
      toast.success("Run started", { description: run.title });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rerun");
    } finally {
      setBusy(false);
    }
  }

  if (!active && !canRerun) return null;
  return (
    <div className="flex justify-end gap-1.5">
      {active ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={cancel} aria-label={`Cancel run ${run.title}`}>
          <Square className="size-3" aria-hidden />
          Cancel
        </Button>
      ) : null}
      {canRerun ? (
        <Button variant="outline" size="sm" loading={busy} onClick={rerun} aria-label={`Rerun ${run.title}`}>
          {busy ? null : <RotateCcw className="size-3.5" aria-hidden />}
          Rerun
        </Button>
      ) : null}
    </div>
  );
}

function PassRateBar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-elevated" aria-hidden>
        <div className="h-full rounded-full bg-pass" style={{ width: `${width}%` }} />
      </div>
      <span className="w-9 text-right text-[13px] font-medium tabular-nums">{value}%</span>
    </div>
  );
}

const caseCol = createDataTableColumns<TestCaseSummary>();

const caseColumns: DataTableColumn<TestCaseSummary>[] = [
  caseCol.accessor("code", {
    header: "Code",
    meta: { className: "w-24" },
    cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue<string>()}</span>,
  }),
  caseCol.accessor("name", {
    header: "Name",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="font-medium text-foreground">{row.original.name}</div>
        {row.original.categories?.length ? (
          <div className="mt-1">
            <SuiteCategoryBadges categories={row.original.categories} />
          </div>
        ) : null}
      </div>
    ),
  }),
  caseCol.accessor((testCase) => testCase.category ?? "Functional", {
    id: "category",
    header: "Category",
    cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
  }),
  caseCol.accessor((testCase) => testCase.scenario ?? "Happy Path", {
    id: "scenario",
    header: "Scenario",
    cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
  }),
  caseCol.accessor("automationStatus", {
    header: "Automation",
    cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
  }),
];

const overviewCol = createDataTableColumns<SuiteSummary>();

const overviewColumns: DataTableColumn<SuiteSummary>[] = [
  overviewCol.accessor("name", {
    header: "Suite",
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="truncate font-medium text-foreground">{row.original.name}</span>
        <SuiteCategoryBadges categories={row.original.categories} category={row.original.category} />
      </div>
    ),
    meta: { className: "max-w-[28rem]" },
  }),
  overviewCol.accessor("cases", {
    header: "Cases",
    meta: { align: "right" },
    cell: ({ getValue }) => <span className="tabular-nums text-muted-foreground">{getValue<number>()}</span>,
  }),
  overviewCol.accessor("passRate", {
    header: "Pass rate",
    cell: ({ getValue }) => <PassRateBar value={getValue<number>()} />,
  }),
  overviewCol.display({
    id: "outcomes",
    header: "Passed / Failed / Not run",
    cell: ({ row }) => (
      <span className="text-[13px] tabular-nums">
        <span className="text-pass">{row.original.passed}</span>
        <span className="text-faint"> / </span>
        <span className={row.original.failed > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>{row.original.failed}</span>
        <span className="text-faint"> / </span>
        <span className="text-muted-foreground">{row.original.notRun}</span>
      </span>
    ),
  }),
  overviewCol.accessor("lastRun", {
    header: "Last run",
    sortFn: "datetime",
    cell: ({ row }) => (
      <div className="text-[13px] text-muted-foreground">
        <div className="tabular-nums">{row.original.lastRun ? new Date(row.original.lastRun).toLocaleString() : "Not run"}</div>
        {row.original.lastRunBy ? <div className="text-xs text-faint">by {row.original.lastRunBy}</div> : null}
      </div>
    ),
  }),
];

const col = createDataTableColumns<HistoryRun>();

const columns: DataTableColumn<HistoryRun>[] = [
  col.accessor("runType", {
    header: "Type",
    cell: ({ row }) => {
      const Icon = TYPE_ICON[row.original.runType];
      return (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
          {TYPE_LABELS[row.original.runType]}
        </span>
      );
    },
  }),
  col.accessor((run) => run.projectName || "", {
    id: "project",
    header: "Project",
    cell: ({ row }) => {
      const run = row.original;
      if (!run.projectId) return <span className="text-muted-foreground">{run.projectName || "—"}</span>;
      return (
        <Link
          to={`/runs?project=${run.projectId}`}
          className="text-foreground hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {run.projectName || "Open project"}
        </Link>
      );
    },
  }),
  col.accessor("title", {
    header: "Name",
    meta: { className: "max-w-[22rem] whitespace-normal" },
    cell: ({ row }) => {
      const run = row.original;
      return (
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            {run.projectId && run.testCaseId ? (
              <Link
                to={`/projects/${run.projectId}/test-cases/${run.testCaseId}`}
                className="truncate font-medium text-foreground hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {run.title}
              </Link>
            ) : (
              <span className="truncate font-medium text-foreground">{run.title}</span>
            )}
            {run.code ? <span className="shrink-0 font-mono text-xs text-muted-foreground">{run.code}</span> : null}
          </div>
          {(run.runType === "project" && run.suiteCategory) || run.environmentName ? (
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {run.runType === "project" && run.suiteCategory ? (
                <span>Category: {suiteCategoryLabel(run.suiteCategory)}</span>
              ) : null}
              {run.environmentName ? <span>Environment: {run.environmentName}</span> : null}
            </div>
          ) : null}
        </div>
      );
    },
  }),
  col.accessor("status", {
    header: "Status",
    cell: ({ row, getValue }) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <RunStatusBadge status={getValue()} />
        <WaitingHint status={getValue()} since={row.original.startedAt} />
      </span>
    ),
  }),
  col.accessor((run) => (run.runType === "individual" || run.total == null ? -1 : (run.completed ?? 0)), {
    id: "progress",
    header: "Progress",
    meta: { align: "right" },
    cell: ({ row }) => <span className="text-muted-foreground">{progress(row.original)}</span>,
  }),
  col.accessor((run) => run.startedAt ?? "", {
    id: "startedAt",
    header: "Started",
    cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{formatWhen(row.original.startedAt)}</span>,
  }),
  col.accessor((run) => run.times ?? 1, {
    id: "times",
    header: "Times run",
    meta: { align: "right" },
    cell: ({ getValue }) => <span className="tabular-nums text-foreground">{getValue<number>()}</span>,
  }),
  col.accessor((run) => run.durationMs ?? -1, {
    id: "duration",
    header: "Duration",
    meta: { align: "right" },
    cell: ({ row }) => formatDuration(row.original.durationMs),
  }),
  col.display({
    id: "summary",
    header: "Summary",
    meta: { className: "max-w-md whitespace-normal" },
    cell: ({ row }) => {
      const run = row.original;
      if (run.runType === "individual" && run.errorMessage) {
        return (
          <span className="line-clamp-2 text-xs break-words text-destructive" title={run.errorMessage}>
            {friendlyRunError(run.errorMessage)}
          </span>
        );
      }
      return (
        <span className={run.runType === "individual" ? "text-faint" : "text-muted-foreground tabular-nums"}>
          {summary(run)}
        </span>
      );
    },
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    meta: { align: "right" },
    cell: ({ row }) => (
      <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <RunActions run={row.original} />
      </div>
    ),
  }),
];

export function TestRunsPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const openedProjectId = searchParams.get("project");
  const openedSuiteId = searchParams.get("suite");
  const [tab, setTab] = useState(() => {
    if (searchParams.get("tab") === "scheduled") return "scheduled";
    if (searchParams.get("project")) return "overview";
    return "history";
  });
  const scopeKey = openedSuiteId ? `suite:${openedSuiteId}` : openedProjectId ? `project:${openedProjectId}` : "all";
  const previousScope = useRef(scopeKey);
  const batches = useScheduledBatches({});
  const [scheduledCases, setScheduledCases] = useState<ScheduledExecution[]>([]);
  const scheduledCount = scheduledCases.length + batches.items.length;

  useEffect(() => {
    api.scheduledExecutions().then(setScheduledCases).catch(() => setScheduledCases([]));
  }, []);

  async function cancelScheduled(row: ScheduledRunRow) {
    if (row.kind === "batch") {
      await batches.cancel(row.item);
      return;
    }
    const item = row.item;
    const label = item.testCaseCode || "this test";
    const when = item.scheduledFor ? formatInTimeZone(item.scheduledFor, item.timeZone || "UTC") : "";
    const cancelled = await confirm({
      title: "Cancel scheduled run?",
      description: `${label}${when ? ` will no longer run at ${when}` : " will no longer run"}.`,
      confirmLabel: "Cancel run",
      cancelLabel: "Keep it",
      tone: "danger",
      onConfirm: () => api.cancelScheduledExecution(item.jobId),
    });
    if (!cancelled) return;
    setScheduledCases((current) => current.filter((entry) => entry.jobId !== item.jobId));
    toast.success("Scheduled run cancelled");
  }
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DatePreset>("all");

  useEffect(() => {
    let cancelled = false;
    // Poll only while some run is queued/running; pauses while the tab is hidden.
    const stop = pollWhileVisible(async () => {
      try {
        const [items, reports] = await Promise.all([api.groupedRuns(), api.reportRuns().catch(() => [] as ReportRun[])]);
        if (cancelled) return false;
        setRuns(mergeHistory(items, reports));
        setError("");
        return items.some(isLive);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load test runs");
        return true;
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);

  useEffect(() => {
    if (previousScope.current === scopeKey) return;
    previousScope.current = scopeKey;
    if (!openedProjectId) {
      setTab((current) => (current === "overview" ? "history" : current));
      return;
    }
    setTab((current) => (current === "scheduled" ? current : "overview"));
  }, [openedProjectId, openedSuiteId, scopeKey]);

  useEffect(() => {
    if (!openedProjectId) {
      setProjectDetail(null);
      return;
    }
    let cancelled = false;
    setProjectLoading(true);
    api
      .project(openedProjectId)
      .then((project) => {
        if (!cancelled) setProjectDetail(project);
      })
      .catch(() => {
        if (!cancelled) setProjectDetail(null);
      })
      .finally(() => {
        if (!cancelled) setProjectLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openedProjectId]);

  const [suiteDetail, setSuiteDetail] = useState<TestSuiteDetail | null>(null);
  const [suiteLoading, setSuiteLoading] = useState(false);

  useEffect(() => {
    if (!openedProjectId || !openedSuiteId) {
      setSuiteDetail(null);
      return;
    }
    let cancelled = false;
    setSuiteLoading(true);
    api
      .testSuite(openedProjectId, openedSuiteId)
      .then((suite) => {
        if (!cancelled) setSuiteDetail(suite);
      })
      .catch(() => {
        if (!cancelled) setSuiteDetail(null);
      })
      .finally(() => {
        if (!cancelled) setSuiteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openedProjectId, openedSuiteId]);

  const openedProjectName = projectDetail?.name || runs.find((run) => run.projectId === openedProjectId)?.projectName || "Project";
  const openedSuite = projectDetail?.suitesList.find((suite) => suite.id === openedSuiteId);
  const openedSuiteName = suiteDetail?.name || openedSuite?.name || "Suite";
  const overviewSuites = projectDetail?.suitesList ?? [];
  const overviewCases = (suiteDetail?.testCases ?? []).filter((testCase) => !testCase.archived);
  const openedRuns = useMemo(
    () => (openedProjectId ? runs.filter((run) => run.projectId === openedProjectId) : []),
    [runs, openedProjectId]
  );
  const projectHistoryRuns = useMemo(() => openedRuns.filter((run) => run.runType === "project"), [openedRuns]);
  const suiteHistoryRuns = useMemo(() => {
    if (!openedSuiteId) return [];
    return openedRuns.filter(
      (run) => run.runType === "suite" && (run.suiteId === openedSuiteId || (openedSuite ? run.title === openedSuite.name : false))
    );
  }, [openedRuns, openedSuiteId, openedSuite]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return runs.filter((run) => {
      if (typeFilter !== "all" && run.runType !== typeFilter) return false;
      if (statusFilter !== "all" && run.status !== statusFilter) return false;
      if (categoryFilter !== "all" && run.suiteCategory !== categoryFilter) return false;
      if (!matchesDate(run.startedAt, dateFilter)) return false;
      if (!needle) return true;
      return [TYPE_LABELS[run.runType], run.projectName, run.title, run.code, run.status, summary(run)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [runs, query, typeFilter, statusFilter, categoryFilter, dateFilter]);

  function openRun(run: HistoryRun) {
    if (run.runType === "project" && run.projectId) {
      navigate(`/runs?project=${run.projectId}`);
      return;
    }
    if (run.historyOnly) {
      if (run.runType === "suite" && run.projectId && run.suiteId) {
        navigate(`/runs?project=${run.projectId}&suite=${run.suiteId}`);
        return;
      }
      if (run.projectId) navigate(`/runs?project=${run.projectId}`);
      return;
    }
    if (run.runType === "individual") {
      if (run.projectId) navigate(`/projects/${run.projectId}/results/${run.id}?from=runs`);
      return;
    }
    navigate(`/runs/batches/${run.id}`);
  }

  const filtered =
    query.trim() !== "" || typeFilter !== "all" || statusFilter !== "all" || categoryFilter !== "all" || dateFilter !== "all";

  function clearFilters() {
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setCategoryFilter("all");
    setDateFilter("all");
  }

  return (
    <PageContainer>
      <PageHeader title="Test Runs" description="Execution history and upcoming scheduled runs for test cases, suites and projects." />

      {error ? <Alert variant="error" title="Could not refresh test runs">{error}</Alert> : null}

      <Tabs
        value={openedProjectId ? tab : tab === "overview" ? "history" : tab}
        onValueChange={setTab}
        className="gap-4"
      >
        <TabsList variant="line" className="h-auto w-full justify-start gap-1 rounded-none border-b border-border p-0">
          {openedProjectId ? (
            <TabsTrigger value="overview" className="h-9 flex-none rounded-none px-3 text-[13px] after:bottom-[-1px]">
              Overview
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="history" className="h-9 flex-none rounded-none px-3 text-[13px] after:bottom-[-1px]">
            History
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="h-9 flex-none rounded-none px-3 text-[13px] after:bottom-[-1px]">
            Scheduled
            {scheduledCount > 0 ? (
              <span className="ml-1.5 rounded-sm bg-elevated px-1.5 text-xs font-medium text-muted-foreground tabular-nums">{scheduledCount}</span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        {openedProjectId ? (
          <TabsContent value="overview">
            {openedSuiteId ? (
              <div className="flex flex-col gap-8">
                <SectionHeader
                  title={openedSuiteName}
                  actions={
                    <Button variant="outline" size="sm" onClick={() => navigate(`/runs?project=${openedProjectId}`)}>
                      <ArrowLeft />
                      Back to project
                    </Button>
                  }
                />
                <section className="flex flex-col gap-3">
                  <SectionHeader title="Test cases" count={suiteLoading ? undefined : overviewCases.length} />
                  <DataTable
                    columns={caseColumns}
                    data={overviewCases}
                    getRowId={(testCase) => testCase.id}
                    loading={suiteLoading}
                    loadingLabel="Loading test cases…"
                    minWidth={760}
                    empty={<EmptyState size="sm" icon={FileCheck2} title="No test cases in this suite" />}
                  />
                </section>
              </div>
            ) : (
            <div className="flex flex-col gap-8">
              <SectionHeader
                title={openedProjectName}
                actions={
                  <Button variant="outline" size="sm" onClick={() => navigate("/runs")}>
                    <ArrowLeft />
                    Back to test runs
                  </Button>
                }
              />
              {projectDetail ? (
                <StatGroup columns={4}>
                  <Stat label="Suites" icon={Layers} value={projectDetail.suites} />
                  <Stat label="Test cases" icon={FileCheck2} value={projectDetail.cases} />
                  <Stat label="Passed" icon={CheckCircle2} value={projectDetail.passed} hint={`${projectDetail.passRate}% pass rate`} />
                  <Stat label="Failed" icon={XCircle} value={projectDetail.failed} tone={projectDetail.failed > 0 ? "destructive" : "default"} />
                </StatGroup>
              ) : null}
              <section className="flex flex-col gap-3">
                <SectionHeader title="Test suites" count={projectLoading ? undefined : overviewSuites.length} />
                <DataTable
                  columns={overviewColumns}
                  data={overviewSuites}
                  getRowId={(suite) => suite.id}
                  loading={projectLoading}
                  loadingLabel="Loading test suites…"
                  minWidth={820}
                  onRowClick={(suite) => navigate(`/runs?project=${openedProjectId}&suite=${suite.id}`)}
                  rowLabel={(suite) => `Open suite ${suite.name}`}
                  empty={<EmptyState size="sm" icon={Layers} title="No test suites in this project" />}
                />
              </section>
            </div>
            )}
          </TabsContent>
        ) : null}

        <TabsContent value="scheduled">
          <ScheduledRuns cases={scheduledCases} batches={batches.items} onCancel={(row) => void cancelScheduled(row)} />
        </TabsContent>

        <TabsContent value="history">
      {openedSuiteId && openedProjectId ? (
        <div className="flex flex-col gap-8">
          <SectionHeader
            title={openedSuiteName}
            actions={
              <Button variant="outline" size="sm" onClick={() => navigate(`/runs?project=${openedProjectId}`)}>
                <ArrowLeft />
                Back to project
              </Button>
            }
          />
          <section className="flex flex-col gap-3">
            <SectionHeader title="Run history" count={loading ? undefined : suiteHistoryRuns.length} />
            <DataTable
              columns={columns}
              data={suiteHistoryRuns}
              getRowId={(run) => `${run.runType}-${run.id}`}
              loading={loading}
              loadingLabel="Loading suite run history…"
              minWidth={960}
              onRowClick={openRun}
              rowLabel={(run) => `Open suite run ${run.title}`}
              empty={<EmptyState size="sm" icon={Layers} title="No suite runs yet" />}
            />
          </section>
        </div>
      ) : openedProjectId ? (
        <div className="flex flex-col gap-8">
          <SectionHeader
            title={openedProjectName}
            actions={
              <Button variant="outline" size="sm" onClick={() => navigate("/runs")}>
                <ArrowLeft />
                Back to test runs
              </Button>
            }
          />
          <section className="flex flex-col gap-3">
            <SectionHeader title="Run history" count={loading ? undefined : projectHistoryRuns.length} />
            <DataTable
              columns={columns}
              data={projectHistoryRuns}
              getRowId={(run) => `${run.runType}-${run.id}`}
              loading={loading}
              loadingLabel="Loading project run history…"
              minWidth={960}
              onRowClick={openRun}
              rowLabel={(run) => `Open project run ${run.title}`}
              empty={<EmptyState size="sm" icon={History} title="No project runs yet" />}
            />
          </section>
        </div>
      ) : (
      <div className="flex flex-col">
        <Toolbar
          sticky
          className="mb-1"
          search={
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search by name, code, or status…"
              shortcut="/"
              bindShortcut
            />
          }
          filters={
            <>
              <Select aria-label="Status" size="sm" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
              <Select
                aria-label="Category"
                size="sm"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[
                  { value: "all", label: "All categories" },
                  ...SUITE_CATEGORIES.map((category) => ({ value: category, label: SUITE_CATEGORY_LABELS[category] })),
                ]}
              />
              <Select
                aria-label="Date"
                size="sm"
                value={dateFilter}
                onChange={(value) => setDateFilter(value as DatePreset)}
                options={DATE_OPTIONS.map(({ value, label }) => ({ value, label }))}
              />
              <Select aria-label="Run type" size="sm" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
            </>
          }
          actions={
            !loading && runs.length > 0 ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                Showing {visible.length} of {runs.length} run{runs.length === 1 ? "" : "s"}
              </p>
            ) : null
          }
        />

        <DataTable
          columns={columns}
          data={visible}
          getRowId={(run) => `${run.runType}-${run.id}`}
          loading={loading}
          loadingLabel="Loading test runs…"
          minWidth={960}
          onRowClick={openRun}
          rowLabel={(run) => `Open ${TYPE_LABELS[run.runType]} run ${run.title}`}
          empty={
            runs.length === 0 ? (
              <EmptyState
                icon={History}
                title="No test runs yet"
                description="Run a test case, suite or project to see it here."
              />
            ) : (
              <EmptyState
                icon={Search}
                size="sm"
                title="No matching runs"
                action={
                  filtered ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearFilters}
                    >
                      Clear filters
                    </Button>
                  ) : null
                }
              />
            )
          }
        />
      </div>
      )}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

export default TestRunsPage;
