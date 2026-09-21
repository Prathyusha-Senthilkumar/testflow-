"use client";

import { useEffect } from "react";
import { Link, useNavigate, useParams } from "@/lib/navigation";
import { useExecutionPolling } from "@/hooks/useExecutionPolling";
import { testCases } from "@/lib/demoData";

const stateLabel: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

export function LiveExecutionPage() {
  const { id = "demo-project", runId } = useParams();
  const navigate = useNavigate();
  const { execution, error } = useExecutionPolling(runId);
  const testCaseCode = execution?.testCaseCode;
  const tc = testCases.find((t) => t.id === testCaseCode);

  useEffect(() => {
    if (!execution || !runId) return;
    if (execution.state === "completed" || execution.state === "failed") {
      navigate(`/projects/${id}/results/${runId}`);
    }
  }, [execution, id, navigate, runId]);

  const state = execution?.state ?? "queued";
  const title = execution?.result?.title ?? tc?.name ?? testCaseCode ?? "Test case";

  return (
    <div className="p-6 lg:p-8">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        Async execution via Redis queue and RQ worker
        <span className="float-right rounded-lg bg-white px-2 py-1 font-mono text-xs">Job {runId}</span>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-6 rounded-lg bg-white p-4 shadow-sm">
        <span className="rounded-lg-full bg-indigo-100 px-3 py-1 font-mono text-xs font-semibold text-indigo-700">
          ● {stateLabel[state] ?? state}
        </span>
        <div>
          <p className="text-xs text-slate-500">Test Case</p>
          <p className="font-semibold">{testCaseCode ? `${testCaseCode} — ${title}` : title}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Runner config</p>
          <p className="max-w-md truncate font-mono text-xs">{execution?.configPath ?? "—"}</p>
        </div>
        <Link
          to={`/projects/${id}/test-cases/${testCaseCode ?? "TC-001"}`}
          className="ml-auto rounded-lg border bg-white px-4 py-2 text-sm font-medium"
        >
          ← Back to test case
        </Link>
      </div>

      <div className="mt-4 rounded-lg bg-white p-5 shadow-sm text-sm text-slate-600">
        <p>
          Polling execution status every 2 seconds. When the job finishes, you will be redirected to the result page.
        </p>
        {execution?.error && <p className="mt-3 text-red-600">{execution.error}</p>}
      </div>
    </div>
  );
}

export default LiveExecutionPage;
