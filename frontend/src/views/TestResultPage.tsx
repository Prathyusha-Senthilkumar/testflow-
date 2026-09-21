"use client";

import { Link, useParams } from "@/lib/navigation";
import { useExecutionPolling } from "@/hooks/useExecutionPolling";
import { testCases } from "@/lib/demoData";

export function TestResultPage() {
  const { id = "demo-project", runId } = useParams();
  const { execution, error } = useExecutionPolling(runId);
  const result = execution?.result;
  const failed = execution?.state === "failed" || (result && !result.success);
  const tc = testCases.find((t) => t.id === execution?.testCaseCode);
  const title = result?.title ?? tc?.name ?? execution?.testCaseCode ?? "Test execution";

  if (error) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-xl bg-white p-6 shadow-sm text-sm text-slate-500">Loading execution result…</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-lg-full px-3 py-1 text-xs font-semibold text-white ${
              failed ? "bg-red-600" : "bg-teal-700"
            }`}
          >
            {failed ? "● FAILED" : "✓ PASSED"}
          </span>
          <span className="font-mono text-xs text-slate-500">Job {execution.jobId}</span>
          <span className="text-xs text-slate-500">State: {execution.state}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">{title}</h1>
          <Link
            to={`/projects/${id}/test-cases/${execution.testCaseCode ?? "TC-001"}`}
            className="rounded-lg-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
          >
            ← Back to Test Case
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs text-slate-600">
          {result?.configPath && <span className="rounded-lg-lg bg-indigo-50 px-2 py-1">Config: {result.configPath}</span>}
          {result?.testFileLocation && (
            <span className="rounded-lg-lg bg-indigo-50 px-2 py-1">Script: {result.testFileLocation}</span>
          )}
          {result != null && (
            <span className="rounded-lg-lg bg-indigo-50 px-2 py-1">pytest exit: {result.pytestReturnCode}</span>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Execution result</h2>
        {result ? (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-slate-500">Runner status</dt>
              <dd className="font-medium">{result.status}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">Success</dt>
              <dd className="font-medium">{result.success ? "Yes" : "No"}</dd>
            </div>
            {result.testCaseLocation && (
              <div className="flex gap-2">
                <dt className="text-slate-500">Test case file</dt>
                <dd className="font-mono text-xs">{result.testCaseLocation}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No result payload yet.</p>
        )}

        {execution.error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">Error</p>
            <p className="mt-2">{execution.error}</p>
          </div>
        )}

        {result?.validationErrors && result.validationErrors.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-semibold text-amber-900">Validation errors</p>
            <ul className="mt-2 list-disc pl-5">
              {result.validationErrors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default TestResultPage;
