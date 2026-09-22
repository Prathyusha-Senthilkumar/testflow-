"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api, type TestRunHistoryItem } from "@/lib/api";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { DemoStatus } from "@/lib/demoData";

function toBadgeStatus(status: string): DemoStatus {
  if (status === "Passed") return "Passed";
  if (status === "Failed") return "Failed";
  if (status === "Running" || status === "Queued") return "Running";
  return "Untested";
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

export function TestRunsPage() {
  const [runs, setRuns] = useState<TestRunHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .testRuns(50)
      .then((items) => {
        if (!cancelled) setRuns(items);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return runs;
    return runs.filter((run) =>
      [run.testCaseCode, run.testName, run.status]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    );
  }, [runs, query]);

  return (
    <div className="p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold">
          Test Runs <span className="font-medium text-slate-500">(Execution History)</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Every recorded execution, newest first, with the reason for any failure.
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="flex flex-wrap items-center border-b p-3">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              className="w-full rounded bg-indigo-50 py-2 pl-9 pr-3 text-sm"
              placeholder="Search by test name, code or status..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Test</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Executed</th>
              <th className="px-4 py-3 text-left">Duration</th>
              <th className="px-4 py-3 text-left">Failure reason</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Loading run history...
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No test runs recorded yet. Run a test case to see it here.
                </td>
              </tr>
            ) : (
              visible.map((run) => (
                <tr key={run.id} className="border-t align-top">
                  <td className="px-4 py-4">
                    <span className="font-medium">{run.testName || "Unknown test"}</span>
                    {run.testCaseCode && (
                      <span className="ml-2 font-mono text-xs text-slate-500">{run.testCaseCode}</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={toBadgeStatus(run.status)} />
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {formatWhen(run.completedAt || run.startedAt)}
                  </td>
                  <td className="px-4 py-4 font-mono text-xs">{formatDuration(run.durationMs)}</td>
                  <td className="max-w-md px-4 py-4">
                    {run.errorMessage ? (
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-red-700">
                        {run.errorMessage}
                      </pre>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && visible.length > 0 && (
          <div className="border-t px-4 py-3 text-sm text-slate-500">
            Showing {visible.length} of {runs.length} recorded run{runs.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </div>
  );
}

export default TestRunsPage;
