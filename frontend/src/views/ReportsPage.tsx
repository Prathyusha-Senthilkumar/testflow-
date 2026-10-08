"use client";

import { friendlyRunError } from "@/lib/friendlyRunError";
import { LoadingArea } from "@/components/common/LoadingArea";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Download, Folder, RotateCcw } from "lucide-react";
import { useNavigate } from "@/lib/navigation";
import { api, TEST_CASE_CATEGORIES, type ProjectSummary, type ReportRun, type TestSuiteSummary } from "@/lib/api";
import { downloadReportCsv, formatExecutedAt } from "@/lib/reportCsv";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { SearchInput } from "@/components/ui/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { Select } from "@/components/ui/select";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page-header";
import { ChartLegend } from "@/components/charts/chart-tooltip";
import { chartColors } from "@/components/charts/chart-theme";
import { PassFailTrendChart } from "@/components/charts/pass-fail-trend-chart";

type DatePreset = "today" | "7" | "14" | "30" | "90" | "all";
type StatusFilter = "all" | "Passed" | "Failed" | "Running" | "Queued";

const DATE_OPTIONS: { value: DatePreset; label: string; days: number | null }[] = [
  { value: "today", label: "Today", days: 0 },
  { value: "7", label: "Last 7 days", days: 6 },
  { value: "14", label: "Last 14 days", days: 13 },
  { value: "30", label: "Last 30 days", days: 29 },
  { value: "90", label: "Last 90 days", days: 89 },
  { value: "all", label: "All time", days: null },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "Passed", label: "Passed" },
  { value: "Failed", label: "Failed" },
  { value: "Running", label: "Running" },
  { value: "Queued", label: "Queued" },
];

type SuiteRow = { id: string; name: string; projectName: string; passed: number; failed: number; passRate: number };

const suiteColumn = createDataTableColumns<SuiteRow>();
const failureColumn = createDataTableColumns<ReportRun>();

function suiteColumns(showProject: boolean) {
  return suiteColumn.columns([
    suiteColumn.accessor("name", {
      header: "Suite",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-start gap-2">
          <Folder aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{row.original.name}</div>
            {showProject && row.original.projectName ? (
              <div className="truncate text-xs text-muted-foreground">{row.original.projectName}</div>
            ) : null}
          </div>
        </div>
      ),
    }),
    suiteColumn.accessor((row) => row.passed + row.failed, {
      id: "runs",
      header: "Runs",
      meta: { align: "right" },
    }),
    suiteColumn.accessor("passed", {
      header: "Passed",
      meta: { align: "right" },
    }),
    suiteColumn.accessor("failed", {
      header: "Failed",
      meta: { align: "right" },
      cell: ({ getValue }) => {
        const value = Number(getValue());
        return <span className={value > 0 ? "font-medium text-destructive" : undefined}>{value}</span>;
      },
    }),
    suiteColumn.accessor("passRate", {
      header: "Pass rate",
      meta: { align: "right", className: "w-64" },
      cell: ({ getValue }) => {
        const value = Number(getValue());
        return (
          <div className="flex items-center justify-end gap-3">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-elevated" aria-hidden>
              <div className="h-full rounded-full bg-pass" style={{ width: `${value}%` }} />
            </div>
            <span className="w-14 font-medium tabular-nums">{value.toFixed(1)}%</span>
          </div>
        );
      },
    }),
  ]);
}

const failureColumns = failureColumn.columns([
  failureColumn.accessor((run) => `${run.testCaseCode ?? ""} ${run.testName ?? ""}`, {
    id: "test",
    header: "Test case",
    meta: { className: "whitespace-normal" },
    cell: ({ row }) => {
      const run = row.original;
      return (
        <div className="min-w-0 py-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-sm bg-elevated px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {run.testCaseCode || "—"}
            </span>
            <span className="truncate font-medium text-foreground">{run.testName || "Unknown test"}</span>
          </div>
          {run.errorMessage ? (
            <p className="mt-1 line-clamp-2 max-w-xl text-xs break-words text-destructive" title={run.errorMessage}>
              {friendlyRunError(run.errorMessage)}
            </p>
          ) : null}
        </div>
      );
    },
  }),
  failureColumn.accessor((run) => run.suiteName ?? "", {
    id: "suite",
    header: "Suite",
    cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue()) || "—"}</span>,
  }),
  failureColumn.accessor((run) => new Date(run.completedAt || run.startedAt || 0).getTime(), {
    id: "failedAt",
    header: "Failure date",
    meta: { className: "font-mono text-xs text-muted-foreground tabular-nums" },
    cell: ({ row }) => formatExecutedAt(row.original.completedAt || row.original.startedAt) || "—",
  }),
  failureColumn.accessor((run) => run.runBy ?? "", {
    id: "runBy",
    header: "Run by",
    cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue()) || "—"}</span>,
  }),
  failureColumn.display({
    id: "status",
    header: "Status",
    cell: () => <RunStatusBadge status="failed" />,
  }),
]);

export function ReportsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [suites, setSuites] = useState<TestSuiteSummary[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [suiteId, setSuiteId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState("all");
  const navigate = useNavigate();
  const [datePreset, setDatePreset] = useState<DatePreset>("14");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Projects and report runs load in parallel; per-project suites (only used
    // for the suite filter) follow without blocking the report itself.
    Promise.all([api.projects(), api.reportRuns()])
      .then(async ([projectRows, reportRows]) => {
        if (cancelled) return;
        setProjects(projectRows);
        setRuns(reportRows);
        setLoading(false);
        const suiteGroups = await Promise.all(
          projectRows.map((project) => api.testSuites(project.id).catch(() => [] as TestSuiteSummary[]))
        );
        if (!cancelled) setSuites(suiteGroups.flat());
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Could not load reports.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const suiteOptions = useMemo(
    () => suites.filter((suite) => projectId === "all" || suite.projectId === projectId),
    [projectId, suites]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const start = rangeStart(datePreset);
    return runs.filter((run) => {
      if (projectId !== "all" && run.projectId !== projectId) return false;
      if (suiteId !== "all" && run.suiteId !== suiteId) return false;
      if (status !== "all" && run.status !== status) return false;
      if (category !== "all" && caseCategory(run) !== category) return false;
      if (start) {
        const when = new Date(run.completedAt || run.startedAt || "");
        if (Number.isNaN(when.getTime()) || when < start) return false;
      }
      if (!needle) return true;
      return [run.testCaseCode, run.testName, run.suiteName, run.projectName]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [category, datePreset, projectId, query, runs, status, suiteId]);

  const passed = filtered.filter((run) => run.status === "Passed").length;
  const failed = filtered.filter((run) => run.status === "Failed").length;
  const completed = passed + failed;
  const passRate = completed ? (passed / completed) * 100 : 0;
  const previous = useMemo(
    () => previousPeriodRuns(runs, { projectId, suiteId, status, category, query, datePreset }),
    [runs, projectId, suiteId, status, category, query, datePreset]
  );
  const delta = passRateDelta(filtered, previous);
  const filtersActive =
    projectId !== "all" || suiteId !== "all" || status !== "all" || category !== "all" || datePreset !== "14" || query !== "";
  const trend = useMemo(() => dailyTrend(filtered, datePreset), [filtered, datePreset]);
  const suiteRows = useMemo(() => suiteSummary(filtered), [filtered]);
  const failures = useMemo(() => filtered.filter((run) => run.status === "Failed"), [filtered]);
  const selectedProject = projects.find((project) => project.id === projectId) ?? null;
  const suiteTableColumns = useMemo(() => suiteColumns(projectId === "all"), [projectId]);
  const hasTrendRuns = trend.some((day) => day.passed + day.failed > 0);

  function resetFilters() {
    setProjectId("all");
    setSuiteId("all");
    setStatus("all");
    setCategory("all");
    setDatePreset("14");
    setQuery("");
  }

  function onProjectChange(value: string) {
    setProjectId(value);
    setSuiteId("all");
  }

  return (
    <PageContainer>
      <PageHeader
        title="Reports"
        description="Execution history from saved test runs. Times use your browser timezone."
        actions={
          <Button
            variant="outline"
            disabled={loading || filtered.length === 0}
            onClick={() => downloadReportCsv(filtered, selectedProject?.name ?? null)}
          >
            <Download />
            Download summary (.csv)
          </Button>
        }
      />

      <Toolbar
        sticky
        className="border-b border-border"
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search code, name, suite, or project"
            aria-label="Search reports"
            shortcut="/"
            bindShortcut
          />
        }
        filters={
          <>
            <Select
              aria-label="Project"
              value={projectId}
              onChange={onProjectChange}
              options={[
                { value: "all", label: "All projects" },
                ...projects.map((project) => ({ value: project.id, label: project.name })),
              ]}
            />
            <Select
              aria-label="Suite"
              value={suiteOptions.some((suite) => suite.id === suiteId) ? suiteId : "all"}
              onChange={setSuiteId}
              options={[
                { value: "all", label: "All suites" },
                ...suiteOptions.map((suite) => ({
                  value: suite.id,
                  label:
                    projectId === "all"
                      ? `${suite.name} · ${projects.find((project) => project.id === suite.projectId)?.name ?? ""}`
                      : suite.name,
                })),
              ]}
            />
            <Select
              aria-label="Status"
              value={status}
              onChange={(value) => setStatus(value as StatusFilter)}
              options={STATUS_OPTIONS}
            />
            <Select
              aria-label="Test case category"
              value={category}
              onChange={setCategory}
              options={[{ value: "all", label: "All categories" }, ...categoryOptions(runs).map((option) => ({ value: option, label: option }))]}
            />
            <Select
              aria-label="Date range"
              value={datePreset}
              onChange={(value) => setDatePreset(value as DatePreset)}
              options={DATE_OPTIONS.map(({ value, label }) => ({ value, label }))}
            />
          </>
        }
        actions={
          filtersActive ? (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw />
              Reset filters
            </Button>
          ) : null
        }
      />

      {error ? <Alert variant="error">Could not load the report. {error}</Alert> : null}


      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Pass vs fail trend</CardTitle>
            {/* One-line summary of the current filter (replaces the old stat tiles, which duplicated the Dashboard). */}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground tabular-nums">
              {loading ? (
                <Skeleton className="h-3.5 w-56" />
              ) : (
                <>
                  <span>
                    <span className="font-medium text-foreground">{filtered.length}</span> runs ·{" "}
                    <span className="font-medium text-foreground">{passRate.toFixed(1)}%</span> passed ·{" "}
                    <span className="font-medium text-foreground">{failed}</span> failed
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-5 items-center rounded-sm bg-elevated px-1.5 text-xs font-medium",
                      delta.diff == null || delta.diff === 0 ? "text-muted-foreground" : delta.diff > 0 ? "text-brand-accent" : "text-destructive"
                    )}
                  >
                    {delta.text}
                  </span>
                </>
              )}
            </p>
          </div>
          <ChartLegend
            items={[
              { label: "Passed", color: chartColors.passed },
              { label: "Failed", color: chartColors.failed },
            ]}
          />
        </CardHeader>
        <CardContent>
          {!loading && !hasTrendRuns ? (
            <EmptyState
              size="sm"
              icon={BarChart3}
              title="No test runs in this range"
              description="Widen the date range or clear filters to see the trend."
            />
          ) : (
            <LoadingArea loading={loading} label="Loading report…" skeleton={<PassFailTrendChart data={[]} loading />}>
              <PassFailTrendChart data={trend} />
            </LoadingArea>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <SectionHeader
          title="Results by test suite"
          description="Passed and failed runs in the current filters."
          count={loading ? undefined : suiteRows.length}
        />
        <DataTable
          columns={suiteTableColumns}
          data={suiteRows}
          getRowId={(row) => row.id}
          loading={loading}
          loadingLabel="Loading suite results…"
          skeletonRows={3}
          minWidth={640}
          empty={<EmptyState size="sm" icon={Folder} title="No suite results" description="No test runs found for the selected filters." />}
        />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Recent failures"
          description="Open one to see its result."
        />
        <DataTable
          columns={failureColumns}
          data={failures}
          getRowId={(run) => run.id}
          loading={loading}
          loadingLabel="Loading failures…"
          skeletonRows={3}
          minWidth={820}
          initialSorting={[{ id: "failedAt", desc: true }]}
          onRowClick={(run) => {
            if (run.projectId) navigate(`/projects/${run.projectId}/results/${run.id}`);
          }}
          rowLabel={(run) => `Open result for ${run.testName || "test"}`}
          empty={<EmptyState size="sm" icon={CheckCircle2} title="No failures" description="No failed runs for the selected filters." />}
        />
      </section>
    </PageContainer>
  );
}

function caseCategory(run: ReportRun): string {
  return run.category || "Functional";
}

function categoryOptions(runs: ReportRun[]): string[] {
  const found = new Set<string>(TEST_CASE_CATEGORIES);
  for (const run of runs) found.add(caseCategory(run));
  return [...found];
}

function rangeStart(preset: DatePreset, now = new Date()): Date | null {
  const option = DATE_OPTIONS.find((item) => item.value === preset);
  if (!option || option.days == null) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - option.days);
  return start;
}

type ReportFilters = { projectId: string; suiteId: string; status: StatusFilter; category: string; query: string; datePreset: DatePreset };

/** Runs in the equally long period before the selected range, same filters. `null` for "All time". */
function previousPeriodRuns(allRuns: ReportRun[], filters: ReportFilters): ReportRun[] | null {
  const start = rangeStart(filters.datePreset);
  if (!start) return null;
  const length = Date.now() - start.getTime();
  const previousEnd = start;
  const previousStart = new Date(start.getTime() - length);
  const needle = filters.query.trim().toLowerCase();
  return allRuns.filter((run) => {
    if (filters.projectId !== "all" && run.projectId !== filters.projectId) return false;
    if (filters.suiteId !== "all" && run.suiteId !== filters.suiteId) return false;
    if (filters.status !== "all" && run.status !== filters.status) return false;
    if (filters.category !== "all" && caseCategory(run) !== filters.category) return false;
    const when = new Date(run.completedAt || run.startedAt || "");
    if (Number.isNaN(when.getTime()) || when < previousStart || when >= previousEnd) return false;
    if (!needle) return true;
    return [run.testCaseCode, run.testName, run.suiteName, run.projectName]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle));
  });
}

/** Pass-rate change vs the previous period: text plus the signed difference (null when not comparable). */
function passRateDelta(current: ReportRun[], previous: ReportRun[] | null): { text: string; diff: number | null } {
  if (!previous) return { text: "All recorded runs", diff: null };
  const currentRate = rate(current);
  const previousRate = rate(previous);
  if (previousRate == null || currentRate == null) return { text: "No earlier runs to compare", diff: null };
  const diff = currentRate - previousRate;
  const sign = diff > 0 ? "+" : "";
  return { text: `${sign}${diff.toFixed(1)}% vs previous period`, diff };
}

function rate(rows: ReportRun[]): number | null {
  const passed = rows.filter((row) => row.status === "Passed").length;
  const failed = rows.filter((row) => row.status === "Failed").length;
  if (passed + failed === 0) return null;
  return (passed / (passed + failed)) * 100;
}

function dailyTrend(rows: ReportRun[], preset: DatePreset): { key: string; label: string; passed: number; failed: number; isToday: boolean }[] {
  const start = rangeStart(preset);
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const first = start ?? new Date(end);
  if (!start) first.setDate(end.getDate() - 6);
  const days: { key: string; label: string; passed: number; failed: number; isToday: boolean }[] = [];
  for (let cursor = new Date(first); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = cursor.toDateString();
    days.push({
      key,
      label: cursor.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      passed: 0,
      failed: 0,
      isToday: key === end.toDateString(),
    });
  }
  for (const run of rows) {
    const when = new Date(run.completedAt || run.startedAt || "");
    if (Number.isNaN(when.getTime())) continue;
    const bucket = days.find((day) => day.key === new Date(when.getFullYear(), when.getMonth(), when.getDate()).toDateString());
    if (!bucket) continue;
    if (run.status === "Passed") bucket.passed += 1;
    if (run.status === "Failed") bucket.failed += 1;
  }
  return days;
}

function suiteSummary(rows: ReportRun[]): { id: string; name: string; projectName: string; passed: number; failed: number; passRate: number }[] {
  const groups = new Map<string, { id: string; name: string; projectName: string; passed: number; failed: number }>();
  for (const run of rows) {
    if (run.status !== "Passed" && run.status !== "Failed") continue;
    const id = run.suiteId || "unassigned";
    const current = groups.get(id) ?? {
      id,
      name: run.suiteName || "Unassigned",
      projectName: run.projectName || "",
      passed: 0,
      failed: 0,
    };
    if (run.status === "Passed") current.passed += 1;
    if (run.status === "Failed") current.failed += 1;
    groups.set(id, current);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      passRate: group.passed + group.failed ? (group.passed / (group.passed + group.failed)) * 100 : 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default ReportsPage;
