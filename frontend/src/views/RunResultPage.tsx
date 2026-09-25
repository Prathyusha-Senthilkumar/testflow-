"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@/lib/navigation";
import { api, type ReportRun } from "@/lib/api";
import { formatDuration, formatExecutedAt } from "@/lib/reportCsv";
import { TestResultPage } from "@/views/TestResultPage";

export function RunResultPage() {
  const navigate = useNavigate();
  const { id: projectId = "", runId = "" } = useParams();
  const [run, setRun] = useState<ReportRun | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const load = () => {
      api
        .reportRun(runId)
        .then((row) => {
          if (!cancelled) setRun(row);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          if (/not found/i.test(err.message)) setMissing(true);
          else setError(err.message || "Could not load this result.");
        });
    };
    load();
    const timer = window.setInterval(load, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runId]);

  if (missing) return <TestResultPage />;

  if (error) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-lg bg-white p-6 text-sm text-slate-500 shadow-sm">Loading result…</div>
      </div>
    );
  }

  const cancelled = run.status === "Not Run" && run.errorMessage === "Cancelled";
  const label = cancelled ? "Cancelled" : run.status;
  const failed = run.status === "Failed";
  const active = run.status === "Queued" || run.status === "Running";

  async function cancelRun() {
    setBusy(true);
    setError("");
    try {
      await api.cancelTestRun(runId);
      setRun(await api.reportRun(runId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel this run");
    } finally {
      setBusy(false);
    }
  }

  async function rerun() {
    setBusy(true);
    setError("");
    try {
      const started = await api.rerunTestRun(runId);
      if (started.testRunId) navigate(`/projects/${projectId || run?.projectId}/results/${started.testRunId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rerun");
      setBusy(false);
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${failed ? "bg-red-600" : cancelled ? "bg-orange-700" : "bg-teal-700"}`}>
            {label.toUpperCase()}
          </span>
          <span className="text-sm text-slate-500">{run.projectName || "Project"}</span>
          <span className="text-sm text-slate-500">{run.suiteName || "Suite"}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">
            {run.testCaseCode ? `${run.testCaseCode} · ` : ""}
            {run.testName || "Test run"}
          </h1>
          <div className="flex gap-2">
            {active && (
              <button type="button" disabled={busy} onClick={cancelRun} className="rounded-lg border border-orange-300 px-4 py-2 text-sm font-medium text-orange-800 disabled:opacity-60">
                Cancel
              </button>
            )}
            {!active && (
              <button type="button" disabled={busy} onClick={rerun} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60">
                Rerun
              </button>
            )}
            <Link to="/reports" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
              Back to Reports
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Execution result</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Status" value={label} />
          <Row label="Executed" value={formatExecutedAt(run.completedAt || run.startedAt) || "—"} />
          <Row label="Duration" value={formatDuration(run.durationMs) || "—"} />
          <Row label="Run by" value={run.runBy || "—"} />
        </dl>
        {run.errorMessage && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">{cancelled ? "Reason" : "Failure reason"}</p>
            <p className="mt-2 whitespace-pre-wrap">{run.errorMessage}</p>
          </div>
        )}
        {run.testCaseId && (
          <Link
            to={`/projects/${projectId || run.projectId}/test-cases/${run.testCaseId}`}
            className="mt-4 inline-block text-sm text-indigo-700 hover:underline"
          >
            Open test case
          </Link>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
