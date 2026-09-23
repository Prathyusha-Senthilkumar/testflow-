"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Folder } from "lucide-react";
import { Link } from "@/lib/navigation";
import { api, type ProjectSummary, type ReportRun, type TestSuiteSummary } from "@/lib/api";
import { downloadReportCsv, formatExecutedAt } from "@/lib/reportCsv";

type DatePreset = "today" | "7" | "14" | "30" | "all";
type StatusFilter = "all" | "Passed" | "Failed" | "Running" | "Queued";

const DATE_OPTIONS: { value: DatePreset; label: string; days: number | null }[] = [
  { value: "today", label: "Today", days: 0 },
  { value: "7", label: "Last 7 Days", days: 6 },
  { value: "14", label: "Last 14 Days", days: 13 },
  { value: "30", label: "Last 30 Days", days: 29 },
  { value: "all", label: "All Time", days: null },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "Passed", label: "Passed" },
  { value: "Failed", label: "Failed" },
  { value: "Running", label: "Running" },
  { value: "Queued", label: "Queued" },
];

export function ReportsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [suites, setSuites] = useState<TestSuiteSummary[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [suiteId, setSuiteId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("14");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .projects()
      .then(async (projectRows) => {
        const suiteGroups = await Promise.all(
          projectRows.map((project) => api.testSuites(project.id).catch(() => [] as TestSuiteSummary[]))
        );
        const reportRows = await api.reportRuns();
        if (cancelled) return;
        setProjects(projectRows);
        setSuites(suiteGroups.flat());
        setRuns(reportRows);
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
      if (start) {
        const when = new Date(run.completedAt || run.startedAt || "");
        if (Number.isNaN(when.getTime()) || when < start) return false;
      }
      if (!needle) return true;
      return [run.testCaseCode, run.testName, run.suiteName, run.projectName]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [datePreset, projectId, query, runs, status, suiteId]);

  const passed = filtered.filter((run) => run.status === "Passed").length;
  const failed = filtered.filter((run) => run.status === "Failed").length;
  const completed = passed + failed;
  const passRate = completed ? (passed / completed) * 100 : 0;
  const delta = passRateDelta(runs, filtered, {
    projectId,
    suiteId,
    status,
    query,
    datePreset,
  });
  const trend = dailyTrend(filtered, datePreset);
  const maxTrend = Math.max(1, ...trend.map((day) => day.passed + day.failed));
  const suiteRows = suiteSummary(filtered);
  const failures = filtered.filter((run) => run.status === "Failed");
  const selectedProject = projects.find((project) => project.id === projectId) ?? null;

  function onProjectChange(value: string) {
    setProjectId(value);
    setSuiteId("all");
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Analytics overview</p>
          <h1 className="mt-1 text-3xl font-bold">Reports & Test Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Execution history from saved test runs. Times use your browser timezone.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={loading || filtered.length === 0}
          onClick={() => downloadReportCsv(filtered, selectedProject?.name ?? null)}
        >
          <Download size={15} className="mr-1 inline" />
          Download Summary (.csv)
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg bg-white p-3 text-sm shadow-sm">
        <span className="mr-2 py-2 text-xs font-semibold uppercase text-slate-500">Filters:</span>
        <select
          aria-label="Project"
          className="rounded-lg bg-indigo-50 px-3 py-2 text-sm"
          value={projectId}
          onChange={(event) => onProjectChange(event.target.value)}
        >
          <option value="all">All Projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Suite"
          className="rounded-lg bg-indigo-50 px-3 py-2 text-sm"
          value={suiteOptions.some((suite) => suite.id === suiteId) ? suiteId : "all"}
          onChange={(event) => setSuiteId(event.target.value)}
        >
          <option value="all">All Suites</option>
          {suiteOptions.map((suite) => (
            <option key={suite.id} value={suite.id}>
              {projectId === "all" ? `${suite.name} · ${projects.find((project) => project.id === suite.projectId)?.name ?? ""}` : suite.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          className="rounded-lg bg-indigo-50 px-3 py-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Date"
          className="rounded-lg bg-indigo-50 px-3 py-2 text-sm"
          value={datePreset}
          onChange={(event) => setDatePreset(event.target.value as DatePreset)}
        >
          {DATE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          aria-label="Search reports"
          className="min-w-56 flex-1 rounded-lg bg-indigo-50 px-3 py-2 text-sm"
          placeholder="Search code, name, suite, or project"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load the report. {error}
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        <StatCard label="TOTAL RUNS" value={loading ? "…" : String(filtered.length)} detail="Matching the selected filters" />
        <StatCard label="PASSED" value={loading ? "…" : String(passed)} detail="Successful executions" tone="pass" />
        <StatCard label="FAILED" value={loading ? "…" : String(failed)} detail="Action required" tone="fail" />
        <StatCard
          label="PASS RATE"
          value={loading ? "…" : `${passRate.toFixed(1)}%`}
          detail={loading ? "Calculating" : delta}
        />
      </div>

      <div className="mt-6 rounded-lg bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Pass vs Fail Trend</h2>
            <p className="text-xs text-slate-500">Saved execution results per day in this filter</p>
          </div>
          <div className="text-xs">
            <span className="text-teal-700">● Passed ({completed ? Math.round((passed / completed) * 100) : 0}%)</span>
            {" "}
            <span className="text-red-600">● Failed ({completed ? Math.round((failed / completed) * 100) : 0}%)</span>
          </div>
        </div>
        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading report…</p>
        ) : trend.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">No test runs found for the selected filters.</p>
        ) : (
          <div className="mt-6 flex h-48 items-end gap-3 border-b border-dashed">
            {trend.map((day) => (
              <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                <div
                  className="mx-auto flex w-10 flex-col justify-end overflow-hidden rounded-t"
                  style={{ height: `${Math.max(4, ((day.passed + day.failed) / maxTrend) * 150)}px` }}
                >
                  <div className="bg-red-600" style={{ flex: day.failed }} />
                  <div className="bg-teal-700" style={{ flex: Math.max(day.passed, day.passed + day.failed === 0 ? 1 : 0) }} />
                </div>
                <div className={`mt-2 truncate text-xs ${day.isToday ? "font-semibold text-indigo-600" : "text-slate-500"}`}>
                  {day.label}
                  {day.isToday ? " (Today)" : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-lg bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Results by Test Suite</h2>
        <p className="text-xs text-slate-500">Passed and failed runs in the current filters</p>
        <table className="mt-4 w-full text-sm">
          <thead className="bg-indigo-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Suite Name</th>
              <th className="px-4 py-3 text-left">Passed</th>
              <th className="px-4 py-3 text-left">Failed</th>
              <th className="px-4 py-3 text-left">Pass Rate</th>
            </tr>
          </thead>
          <tbody>
            {suiteRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No test runs found for the selected filters.
                </td>
              </tr>
            ) : (
              suiteRows.map((suite) => (
                <tr key={suite.id} className="border-t">
                  <td className="px-4 py-4">
                    <Folder size={16} className="mr-2 inline text-indigo-600" />
                    <b>{suite.name}</b>
                    {projectId === "all" && suite.projectName && (
                      <div className="ml-6 text-xs text-slate-400">{suite.projectName}</div>
                    )}
                  </td>
                  <td className="px-4 font-semibold text-teal-700">{suite.passed}</td>
                  <td className="px-4 font-semibold text-red-600">{suite.failed}</td>
                  <td className="px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 rounded bg-indigo-100">
                        <div className="h-full rounded bg-teal-700" style={{ width: `${suite.passRate}%` }} />
                      </div>
                      <b className="w-14 text-right">{suite.passRate.toFixed(1)}%</b>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-lg bg-white p-5 shadow-sm">
        <div className="flex justify-between gap-3">
          <div>
            <h2 className="font-semibold">Recent / Top Failures</h2>
            <p className="text-xs text-slate-500">Failed runs in the current filters</p>
          </div>
          <span className="rounded-lg bg-red-100 px-2 py-1 text-xs text-red-700">
            {failures.length} Failure{failures.length === 1 ? "" : "s"}
          </span>
        </div>
        <table className="mt-4 w-full text-sm">
          <thead className="bg-indigo-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Test Case</th>
              <th className="px-4 py-3 text-left">Suite</th>
              <th className="px-4 py-3 text-left">Failure Date</th>
              <th className="px-4 py-3 text-left">Run By</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {failures.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No failed runs for the selected filters.
                </td>
              </tr>
            ) : (
              failures.map((run) => (
                <tr key={run.id} className="border-t align-top">
                  <td className="px-4 py-4">
                    <span className="mr-2 rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs">
                      {run.testCaseCode || "—"}
                    </span>
                    <b>{run.testName || "Unknown test"}</b>
                    {run.errorMessage && (
                      <p className="mt-1 max-w-md whitespace-pre-wrap break-words text-xs text-red-700">
                        {run.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">{run.suiteName || "—"}</td>
                  <td className="px-4 py-4 font-mono text-xs">
                    {formatExecutedAt(run.completedAt || run.startedAt) || "—"}
                  </td>
                  <td className="px-4 py-4">{run.runBy || "—"}</td>
                  <td className="px-4 py-4">
                    <span className="rounded-lg bg-red-100 px-2 py-1 text-xs text-red-700">Failed</span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      to={`/projects/${run.projectId}/results/${run.id}`}
                      className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700"
                    >
                      View Result
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "pass" | "fail";
}) {
  const color = tone === "pass" ? "text-teal-700" : tone === "fail" ? "text-red-600" : "";
  return (
    <div className="rounded-lg bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-4 text-3xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function rangeStart(preset: DatePreset, now = new Date()): Date | null {
  const option = DATE_OPTIONS.find((item) => item.value === preset);
  if (!option || option.days == null) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - option.days);
  return start;
}

function passRateDelta(
  allRuns: ReportRun[],
  current: ReportRun[],
  filters: { projectId: string; suiteId: string; status: StatusFilter; query: string; datePreset: DatePreset }
): string {
  const start = rangeStart(filters.datePreset);
  if (!start) return "All recorded runs";
  const length = Date.now() - start.getTime();
  const previousEnd = start;
  const previousStart = new Date(start.getTime() - length);
  const needle = filters.query.trim().toLowerCase();
  const previous = allRuns.filter((run) => {
    if (filters.projectId !== "all" && run.projectId !== filters.projectId) return false;
    if (filters.suiteId !== "all" && run.suiteId !== filters.suiteId) return false;
    if (filters.status !== "all" && run.status !== filters.status) return false;
    const when = new Date(run.completedAt || run.startedAt || "");
    if (Number.isNaN(when.getTime()) || when < previousStart || when >= previousEnd) return false;
    if (!needle) return true;
    return [run.testCaseCode, run.testName, run.suiteName, run.projectName]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle));
  });
  const currentRate = rate(current);
  const previousRate = rate(previous);
  if (previousRate == null || currentRate == null) return "No earlier runs to compare";
  const diff = currentRate - previousRate;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)}% vs previous period`;
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
