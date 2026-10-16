"use client";

import { useEffect, useMemo, useState } from "react";
import { pollWhileVisible } from "@/hooks/useExecutionPolling";
import { History } from "lucide-react";
import { api, type ReportRun } from "@/lib/api";
import { Link } from "@/lib/navigation";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionHeader } from "@/components/layout/page-header";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { formatDurationMs } from "@/components/test-cases/testCaseFormat";

type HistoryRow = ReportRun & { times: number };

const column = createDataTableColumns<HistoryRow>();

function formatStarted(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function startedTime(run: ReportRun): number {
  const value = new Date(run.completedAt || run.startedAt || "").getTime();
  return Number.isNaN(value) ? 0 : value;
}

function withCounts(rows: ReportRun[]): HistoryRow[] {
  const counts = new Map<string, number>();
  for (const run of rows) {
    const key = run.testCaseId || run.testName || run.id;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.map((run) => ({ ...run, times: counts.get(run.testCaseId || run.testName || run.id) ?? 1 }));
}

/** Persisted run history for one suite or one project. Stays on this page. */
export function ScopedRunHistory({ projectId, suiteId }: { projectId: string; suiteId?: string }) {
  const [runs, setRuns] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    return pollWhileVisible(async () => {
      try {
        const rows = await api.reportRuns();
        const matched = rows.filter((run) => {
          if (run.projectId !== projectId) return false;
          if (suiteId && run.suiteId !== suiteId) return false;
          return true;
        });
        matched.sort((a, b) => startedTime(b) - startedTime(a));
        setRuns(withCounts(matched).slice(0, 20));
      } catch {
        setRuns([]);
      } finally {
        setLoading(false);
      }
      return true;
    }, 4000);
  }, [projectId, suiteId]);

  const columns = useMemo(
    () => [
      column.accessor((row) => row.completedAt || row.startedAt || "", {
        id: "started",
        header: "Started",
        cell: (info) => (
          <span className="tabular-nums text-foreground">{formatStarted(info.row.original.completedAt || info.row.original.startedAt)}</span>
        ),
      }),
      column.accessor((row) => row.testName || "Test case", {
        id: "test",
        header: "Test case",
        cell: (info) => {
          const run = info.row.original;
          if (!run.projectId || !run.testCaseId) return <span className="font-medium text-foreground">{run.testName || "Test case"}</span>;
          return (
            <Link to={`/projects/${run.projectId}/test-cases/${run.testCaseId}`} className="font-medium text-foreground hover:underline">
              {run.testName || "Test case"}
            </Link>
          );
        },
      }),
      column.accessor("times", {
        header: "Times run",
        meta: { align: "right" },
        cell: (info) => <span className="tabular-nums text-foreground">{info.getValue()}</span>,
      }),
      column.accessor("status", {
        header: "Status",
        cell: (info) => <RunStatusBadge status={info.getValue()} />,
      }),
      column.display({
        id: "open",
        header: () => <span className="sr-only">Open</span>,
        meta: { align: "right" },
        cell: (info) => {
          const run = info.row.original;
          if (!run.projectId) return null;
          return (
            <div className="flex justify-end gap-3 text-[13px]">
              <Link to={`/projects/${run.projectId}/results/${run.id}`} className="text-foreground hover:underline">
                Run
              </Link>
              <Link to={`/projects/${run.projectId}`} className="text-foreground hover:underline">
                Project
              </Link>
            </div>
          );
        },
      }),
      column.accessor((row) => row.durationMs ?? 0, {
        id: "duration",
        header: "Duration",
        meta: { align: "right" },
        cell: (info) => <span className="tabular-nums text-muted-foreground">{formatDurationMs(info.row.original.durationMs)}</span>,
      }),
    ],
    []
  );

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Run history" count={loading ? undefined : runs.length} />
      <DataTable
        columns={columns}
        data={runs}
        loading={loading}
        getRowId={(row) => row.id}
        empty={<EmptyState size="sm" icon={History} title="No runs yet" description="Date, time, and how many times each test ran stay on this page." />}
      />
    </section>
  );
}
