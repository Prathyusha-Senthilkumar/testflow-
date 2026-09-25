"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { FileText, FolderKanban, Layers, Search } from "lucide-react";
import { useNavigate } from "@/lib/navigation";
import { api, type GroupedRun } from "@/lib/api";
import { suiteCategoryLabel } from "@/lib/suiteCategory";

const STATUS_BADGE: Record<string, string> = {
  Passed: "bg-green-100 text-green-800",
  Completed: "bg-indigo-100 text-indigo-800",
  Running: "bg-blue-100 text-blue-800",
  Queued: "bg-amber-100 text-amber-800",
  Failed: "bg-red-100 text-red-800",
  Skipped: "bg-slate-100 text-slate-600",
  Cancelled: "bg-orange-100 text-orange-800",
};

const TYPE_ICON = {
  project: FolderKanban,
  suite: Layers,
  individual: FileText,
} as const;

function StatusPill({ status }: { status: string }) {
  const tone = STATUS_BADGE[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

const TYPE_LABELS: Record<GroupedRun["runType"], string> = {
  individual: "Individual",
  suite: "Suite",
  project: "Project",
};

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

function summary(run: GroupedRun): string {
  if (run.runType === "individual") return run.errorMessage || "—";
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

function TypeIcon({ type }: { type: GroupedRun["runType"] }) {
  const Icon = TYPE_ICON[type];
  return <Icon size={15} className="text-slate-500" aria-hidden />;
}

function RunActions({ run }: { run: GroupedRun }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = run.status === "Queued" || run.status === "Running";
  const canRerun = ["Passed", "Failed", "Skipped", "Cancelled", "Completed"].includes(run.status);

  async function cancel(event: MouseEvent) {
    event.stopPropagation();
    setBusy(true);
    setMessage("");
    try {
      if (run.runType === "individual") await api.cancelTestRun(run.id);
      else await api.cancelBatchRun(run.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not cancel this run");
    } finally {
      setBusy(false);
    }
  }

  async function rerun(event: MouseEvent) {
    event.stopPropagation();
    setBusy(true);
    setMessage("");
    try {
      if (run.runType === "individual") {
        const started = await api.rerunTestRun(run.id);
        if (started.testRunId && (started.projectId || run.projectId)) {
          navigate(`/projects/${started.projectId || run.projectId}/results/${started.testRunId}`);
        }
        return;
      }
      const started = await api.rerunBatch(run.id);
      navigate(`/runs/batches/${started.batchId}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not rerun");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-2">
        {active && (
          <button
            type="button"
            disabled={busy}
            onClick={cancel}
            className="rounded border px-2 py-1 text-xs font-medium text-orange-800 disabled:opacity-60"
          >
            Cancel
          </button>
        )}
        {canRerun && (
          <button
            type="button"
            disabled={busy}
            onClick={rerun}
            className="rounded border px-2 py-1 text-xs font-medium text-indigo-800 disabled:opacity-60"
          >
            Rerun
          </button>
        )}
      </div>
      {message && <span className="text-xs text-red-700">{message}</span>}
    </div>
  );
}

function progress(run: GroupedRun): string {
  if (run.runType === "individual" || run.total == null) return "—";
  return `${run.completed ?? 0} / ${run.total}`;
}

export function TestRunsPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<GroupedRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const load = () => {
      if (inFlight) return;
      inFlight = true;
      api
        .groupedRuns()
        .then((items) => {
          if (!cancelled) {
            setRuns(items);
            setError("");
          }
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message);
        })
        .finally(() => {
          inFlight = false;
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return runs.filter((run) => {
      if (typeFilter !== "all" && run.runType !== typeFilter) return false;
      if (!needle) return true;
      return [TYPE_LABELS[run.runType], run.title, run.code, run.status, summary(run)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [runs, query, typeFilter]);

  function openRun(run: GroupedRun) {
    if (run.runType === "individual") {
      if (run.projectId) navigate(`/projects/${run.projectId}/results/${run.id}`);
      return;
    }
    navigate(`/runs/batches/${run.id}`);
  }

  return (
    <div className="p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold">
          Test Runs <span className="font-medium text-slate-500">(Execution History)</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Individual, suite, and project executions, newest first.
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              className="w-full rounded bg-indigo-50 py-2 pl-9 pr-3 text-sm"
              placeholder="Search by name, code, or status..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            aria-label="Run type"
            className="rounded-lg border bg-indigo-50 px-3 py-2 text-sm"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="all">All Runs</option>
            <option value="individual">Individual</option>
            <option value="suite">Suite</option>
            <option value="project">Project</option>
          </select>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Run type</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Progress</th>
              <th className="px-4 py-3 text-left">Started</th>
              <th className="px-4 py-3 text-left">Duration</th>
              <th className="px-4 py-3 text-left">Summary</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  Loading run history...
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  {runs.length === 0
                    ? "No test runs recorded yet. Run a test case, suite, or project to see it here."
                    : "No test runs match these filters."}
                </td>
              </tr>
            ) : (
              visible.map((run) => (
                <tr
                  key={`${run.runType}-${run.id}`}
                  className="cursor-pointer border-t align-top hover:bg-slate-50"
                  tabIndex={0}
                  aria-label={`Open ${TYPE_LABELS[run.runType]} run ${run.title}`}
                  onClick={() => openRun(run)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openRun(run);
                    }
                  }}
                >
                  <td className="px-4 py-4 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <TypeIcon type={run.runType} />
                      {TYPE_LABELS[run.runType]}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-medium">{run.title}</span>
                    {run.code && <span className="ml-2 font-mono text-xs text-slate-500">{run.code}</span>}
                    {run.runType === "project" && run.suiteCategory && (
                      <div className="mt-1 text-xs text-slate-500">Category: {suiteCategoryLabel(run.suiteCategory)}</div>
                    )}
                    {run.environmentName && (
                      <div className="mt-1 text-xs text-slate-500">Environment: {run.environmentName}</div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <StatusPill status={run.status} />
                  </td>
                  <td className="px-4 py-4 font-mono text-xs">{progress(run)}</td>
                  <td className="px-4 py-4 text-slate-600">{formatWhen(run.startedAt)}</td>
                  <td className="px-4 py-4 font-mono text-xs">{formatDuration(run.durationMs)}</td>
                  <td className="max-w-md px-4 py-4">
                    {run.runType === "individual" && run.errorMessage ? (
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-red-700">
                        {run.errorMessage}
                      </pre>
                    ) : (
                      <span className={run.runType === "individual" ? "text-slate-400" : "text-slate-700"}>
                        {summary(run)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}>
                    <RunActions run={run} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && visible.length > 0 && (
          <div className="border-t px-4 py-3 text-sm text-slate-500">
            Showing {visible.length} of {runs.length} run{runs.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
}

export default TestRunsPage;
