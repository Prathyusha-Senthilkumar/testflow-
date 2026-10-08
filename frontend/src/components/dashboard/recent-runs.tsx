"use client";

import { useMemo } from "react";
import { History } from "lucide-react";
import type { GroupedRun } from "@/lib/api";
import { formatDuration, relativeTime } from "@/lib/dashboard";
import { DataTable, createDataTableColumns, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/common/EmptyState";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";

const helper = createDataTableColumns<GroupedRun>();

const TRIGGER: Record<GroupedRun["runType"], string> = { individual: "Test", suite: "Suite", project: "Project" };

/** Queued for longer than this reads as "waiting a long time". */
const STALE_QUEUED_MS = 10 * 60 * 1000;

export function isStaleQueued(run: GroupedRun, now: number): boolean {
  if (run.status.toLowerCase() !== "queued" || !run.startedAt) return false;
  const started = new Date(run.startedAt).getTime();
  return Number.isFinite(started) && now - started > STALE_QUEUED_MS;
}

// Lower-priority columns hide when the panel is narrow (container queries on the table wrapper).
const HIDE_BELOW_640 = "hidden @[640px]:table-cell";
const HIDE_BELOW_760 = "hidden @[760px]:table-cell";
const HIDE_BELOW_900 = "hidden @[900px]:table-cell";

function buildColumns(projectNames: Record<string, string>, now: number, onCancel?: (run: GroupedRun) => void): DataTableColumn<GroupedRun>[] {
  return [
    helper.accessor("status", {
      header: "Status",
      cell: (info) => <RunStatusBadge status={info.getValue()} />,
      meta: { headerClassName: "w-24" },
    }),
    helper.accessor("title", {
      header: "Test",
      cell: (info) => {
        const run = info.row.original;
        const stale = isStaleQueued(run, now);
        return (
          <span className="block min-w-0">
            <span className="block max-w-[240px] truncate @[900px]:max-w-[360px]" title={info.getValue()}>
              {run.code ? <span className="mr-1.5 font-mono text-xs text-muted-foreground">{run.code}</span> : null}
              <span className="font-medium">{info.getValue()}</span>
            </span>
            {stale ? (
              <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                Waiting a long time
                {onCancel ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCancel(run);
                    }}
                    className="rounded-sm text-brand-accent hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                ) : null}
              </span>
            ) : null}
          </span>
        );
      },
    }),
    helper.accessor((row) => (row.projectId ? projectNames[row.projectId] ?? "" : ""), {
      id: "project",
      header: "Project",
      cell: (info) => <span className="block max-w-[140px] truncate text-muted-foreground">{info.getValue() || "—"}</span>,
      meta: { className: HIDE_BELOW_640, headerClassName: HIDE_BELOW_640 },
    }),
    helper.accessor((row) => row.environmentName ?? "", {
      id: "environment",
      header: "Environment",
      cell: (info) => <span className="text-muted-foreground">{info.getValue() || "Default"}</span>,
      meta: { className: HIDE_BELOW_900, headerClassName: HIDE_BELOW_900 },
    }),
    helper.accessor((row) => row.durationMs ?? 0, {
      id: "duration",
      header: "Duration",
      cell: (info) => <span className="text-muted-foreground">{info.getValue() > 0 ? formatDuration(info.getValue()) : "—"}</span>,
      meta: { align: "right", className: HIDE_BELOW_760, headerClassName: HIDE_BELOW_760 },
    }),
    helper.accessor((row) => row.startedAt ?? "", {
      id: "started",
      header: "Started",
      sortFn: "datetime",
      cell: (info) => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{relativeTime(info.getValue(), now)}</span>,
      meta: { align: "right", headerClassName: "w-24" },
    }),
    helper.accessor((row) => TRIGGER[row.runType] ?? row.runType, {
      id: "trigger",
      header: "Trigger",
      cell: (info) => <span className="text-muted-foreground">{String(info.getValue())}</span>,
      meta: { className: HIDE_BELOW_760, headerClassName: HIDE_BELOW_760 },
    }),
  ];
}

type RecentRunsTableProps = {
  runs: GroupedRun[];
  projectNames: Record<string, string>;
  now: number;
  loading?: boolean;
  onOpen?: (run: GroupedRun) => void;
  /** Cancel a run that has been queued for a long time. */
  onCancel?: (run: GroupedRun) => void;
};

/** Last runs, live ones first (rows are clickable). */
export function RecentRunsTable({ runs, projectNames, now, loading = false, onOpen, onCancel }: RecentRunsTableProps) {
  const columns = useMemo(() => buildColumns(projectNames, now, onCancel), [projectNames, now, onCancel]);
  return (
    <div className="@container min-w-0">
    <DataTable
      columns={columns}
      data={runs}
      getRowId={(row) => row.id}
      loading={loading}
      skeletonRows={8}
      loadingLabel="Loading runs…"
      onRowClick={onOpen}
      rowLabel={(row) => `Open run of ${row.title}`}
      rowClassName={(row) => (["queued", "running"].includes(row.status.toLowerCase()) ? "bg-state-active" : undefined)}
      empty={<EmptyState icon={History} size="sm" title="No runs in this range" description="Runs appear here as soon as a test starts." />}
      containerClassName="overflow-x-auto"
    />
    </div>
  );
}
