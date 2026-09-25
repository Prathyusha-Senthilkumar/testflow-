"use client";

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@/lib/navigation";
import { api, type BatchCaseResult, type BatchExecutionStatus } from "@/lib/api";
import { suiteCategoryLabel } from "@/lib/suiteCategory";

const OUTCOME_LABEL: Record<BatchCaseResult["outcome"], string> = {
  passed: "Passed",
  failed: "Failed",
  running: "Running",
  queued: "Queued",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

const OUTCOME_BADGE: Record<BatchCaseResult["outcome"], string> = {
  passed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  running: "bg-blue-100 text-blue-800",
  queued: "bg-amber-100 text-amber-800",
  skipped: "bg-slate-100 text-slate-600",
  cancelled: "bg-orange-100 text-orange-800",
};

function formatDuration(durationMs?: number | null): string {
  if (durationMs === null || durationMs === undefined) return "—";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function parentStatus(run: BatchExecutionStatus): string {
  if (!run.finished) {
    return run.passed === 0 && run.failed === 0 && run.running === 0 && (run.cancelled ?? 0) === 0
      ? "Queued"
      : "Running";
  }
  if (run.cancelRequested) return "Cancelled";
  if (run.failed > 0) return "Failed";
  if (run.passed > 0) return "Completed";
  return "Skipped";
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

type SuiteSlice = {
  id: string;
  name: string;
  cases: BatchCaseResult[];
};

function suiteStatus(cases: BatchCaseResult[]): string {
  if (cases.some((item) => item.outcome === "running")) return "Running";
  if (cases.some((item) => item.outcome === "queued")) {
    return cases.some((item) => item.outcome !== "queued") ? "Running" : "Queued";
  }
  if (cases.some((item) => item.outcome === "failed")) return "Failed";
  if (cases.some((item) => item.outcome === "cancelled")) return "Cancelled";
  if (cases.some((item) => item.outcome === "passed")) return "Passed";
  return "Skipped";
}

export function BatchRunPage() {
  const navigate = useNavigate();
  const { batchId = "" } = useParams();
  const [run, setRun] = useState<BatchExecutionStatus | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    const load = () => {
      api
        .getBatchRun(batchId)
        .then((next) => {
          if (!cancelled) {
            setRun(next);
            setError("");
          }
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message || "Could not load this run.");
        });
    };
    load();
    const timer = window.setInterval(load, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [batchId]);

  const suites = useMemo(() => groupSuites(run), [run]);
  const selectedSuite = suites.find((suite) => suite.id === selectedSuiteId) ?? null;

  if (error && !run) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-lg bg-white p-6 text-sm text-slate-500 shadow-sm">Loading run…</div>
      </div>
    );
  }

  const title = run.batchType === "suite" ? run.suiteName || "Suite" : run.projectName || "Project";
  const done = run.passed + run.failed + run.skipped + (run.cancelled ?? 0);
  const status = parentStatus(run);
  const active = status === "Queued" || status === "Running";
  const suitesDone = suites.filter((suite) => suite.cases.every((item) => item.outcome !== "queued" && item.outcome !== "running")).length;

  async function cancelRun() {
    setBusy(true);
    setActionError("");
    try {
      setRun(await api.cancelBatchRun(run!.batchId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not cancel this run");
    } finally {
      setBusy(false);
    }
  }

  async function rerun() {
    setBusy(true);
    setActionError("");
    try {
      const started = await api.rerunBatch(run!.batchId);
      navigate(`/runs/batches/${started.batchId}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not rerun");
      setBusy(false);
    }
  }

  const caseRows = run.batchType === "project" && selectedSuite ? selectedSuite.cases : run.batchType === "suite" ? run.cases : [];

  return (
    <div className="p-6 lg:p-8">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">
            {run.batchType === "suite" ? "Test Suite Run" : "Project Run"}
          </span>
          <StatusPill
            label={status}
            tone={
              status === "Failed"
                ? "bg-red-100 text-red-800"
                : status === "Running"
                  ? "bg-blue-100 text-blue-800"
                  : status === "Queued"
                    ? "bg-amber-100 text-amber-800"
                    : status === "Cancelled"
                      ? "bg-orange-100 text-orange-800"
                      : status === "Completed"
                        ? "bg-indigo-100 text-indigo-800"
                        : "bg-slate-100 text-slate-600"
            }
          />
          <span className="text-sm text-slate-500">
            {done} / {run.total} completed
          </span>
          {run.batchType === "project" && (
            <span className="text-sm text-slate-500">
              Suites: {suitesDone} / {suites.length} completed
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">{title}</h1>
          <div className="flex flex-wrap gap-2">
            {active && (
              <button
                type="button"
                disabled={busy}
                onClick={cancelRun}
                className="rounded-lg border border-orange-300 px-4 py-2 text-sm font-medium text-orange-800 disabled:opacity-60"
              >
                Cancel run
              </button>
            )}
            {!active && (
              <button
                type="button"
                disabled={busy}
                onClick={rerun}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Rerun
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate("/runs")}
              className="rounded-lg border px-4 py-2 text-sm font-medium"
            >
              Back to Test Runs
            </button>
          </div>
        </div>
        {run.batchType === "project" && run.suiteCategory && (
          <p className="mt-3 text-sm text-slate-600">Category: {suiteCategoryLabel(run.suiteCategory)}</p>
        )}
        {run.environmentName && (
          <p className="mt-1 text-sm text-slate-600">Environment: {run.environmentName}</p>
        )}
        <p className="mt-3 text-sm text-slate-600">
          {run.passed} Passed · {run.failed} Failed · {run.skipped} Skipped
          {(run.cancelled ?? 0) > 0 ? ` · ${run.cancelled} Cancelled` : ""}
          {run.running > 0 ? ` · ${run.running} Running` : ""}
          {run.queued > 0 ? ` · ${run.queued} Queued` : ""}
        </p>
        {actionError && <p className="mt-3 text-sm text-red-700">{actionError}</p>}
      </div>

      {run.batchType === "project" && !selectedSuite && (
        <div className="mt-5 overflow-hidden rounded-lg bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">Suite</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Progress</th>
                <th className="px-4 py-3 text-left">Summary</th>
              </tr>
            </thead>
            <tbody>
              {suites.map((suite) => {
                const finished = suite.cases.filter((item) => item.outcome !== "queued" && item.outcome !== "running").length;
                const label = suiteStatus(suite.cases);
                return (
                  <tr
                    key={suite.id}
                    className="cursor-pointer border-t hover:bg-slate-50"
                    tabIndex={0}
                    onClick={() => setSelectedSuiteId(suite.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedSuiteId(suite.id);
                      }
                    }}
                  >
                    <td className="px-4 py-4 font-medium">{suite.name}</td>
                    <td className="px-4 py-4">
                      <StatusPill label={label} tone={OUTCOME_BADGE[label.toLowerCase() as BatchCaseResult["outcome"]] ?? "bg-slate-100 text-slate-700"} />
                    </td>
                    <td className="px-4 py-4 font-mono text-xs">
                      {finished} / {suite.cases.length}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{countLine(suite.cases)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(run.batchType === "suite" || selectedSuite) && (
        <div className="mt-5 overflow-hidden rounded-lg bg-white shadow-sm">
          {selectedSuite && (
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-semibold">{selectedSuite.name}</h2>
              <button type="button" className="text-sm font-medium text-indigo-700" onClick={() => setSelectedSuiteId(null)}>
                Back to suites
              </button>
            </div>
          )}
          <CaseTable cases={caseRows} projectId={run.projectId} />
        </div>
      )}
    </div>
  );
}

function CaseTable({ cases, projectId }: { cases: BatchCaseResult[]; projectId: string }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-slate-600">
        <tr>
          <th className="px-4 py-3 text-left">Test case</th>
          <th className="px-4 py-3 text-left">Status</th>
          <th className="px-4 py-3 text-left">Duration</th>
          <th className="px-4 py-3 text-left">Details</th>
        </tr>
      </thead>
      <tbody>
        {cases.map((testCase) => (
          <tr key={testCase.testCaseId} className="border-t align-top">
            <td className="px-4 py-4">
              <div className="font-medium">{testCase.name}</div>
              {testCase.testCaseCode && <div className="font-mono text-xs text-slate-500">{testCase.testCaseCode}</div>}
            </td>
            <td className="px-4 py-4">
              <StatusPill label={OUTCOME_LABEL[testCase.outcome]} tone={OUTCOME_BADGE[testCase.outcome]} />
            </td>
            <td className="px-4 py-4 font-mono text-xs">{formatDuration(testCase.durationMs)}</td>
            <td className="max-w-md px-4 py-4">
              {testCase.reason ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-700">{testCase.reason}</pre>
              ) : (
                <span className="text-slate-400">—</span>
              )}
              {testCase.testRunId && projectId && (
                <div className="mt-2">
                  <a
                    href={`/projects/${projectId}/results/${testCase.testRunId}`}
                    className="text-sm font-medium text-indigo-700 hover:underline"
                  >
                    View result
                  </a>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function groupSuites(run: BatchExecutionStatus | null): SuiteSlice[] {
  if (!run) return [];
  const groups = new Map<string, SuiteSlice>();
  for (const testCase of run.cases) {
    const id = testCase.suiteId || "suite";
    const current = groups.get(id) ?? { id, name: testCase.suiteName || "Suite", cases: [] };
    current.cases.push(testCase);
    groups.set(id, current);
  }
  return Array.from(groups.values());
}

function countLine(cases: BatchCaseResult[]): string {
  const count = (outcome: BatchCaseResult["outcome"]) => cases.filter((item) => item.outcome === outcome).length;
  const parts = [`${count("passed")} Passed`, `${count("failed")} Failed`, `${count("skipped")} Skipped`];
  if (count("cancelled") > 0) parts.push(`${count("cancelled")} Cancelled`);
  if (count("running") > 0) parts.push(`${count("running")} Running`);
  if (count("queued") > 0) parts.push(`${count("queued")} Queued`);
  return parts.join(" · ");
}

export default BatchRunPage;
