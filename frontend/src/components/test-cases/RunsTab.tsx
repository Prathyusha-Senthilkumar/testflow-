"use client";

import { friendlyRunError } from "@/lib/friendlyRunError";
import { useMemo, useState } from "react";
import { History } from "lucide-react";
import type { TestRunHistoryItem } from "@/lib/api";
import { useNavigate } from "@/lib/navigation";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { Select } from "@/components/ui/select";
import { Toolbar } from "@/components/ui/toolbar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { RunStatusBadge, normalizeStatus } from "@/components/runs/RunStatusBadge";
import { formatDurationMs, runTrigger } from "@/components/test-cases/testCaseFormat";

/** A run row; `live` marks the synthetic row for a run started from this page. */
export type RunRow = TestRunHistoryItem & { live?: boolean; phase?: string };

const helper = createDataTableColumns<RunRow>();

function formatStarted(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const columns = [
  helper.accessor((row) => row.startedAt || row.scheduledFor || "", {
    id: "started",
    header: "Started",
    sortFn: "datetime",
    cell: (info) =>
      info.row.original.live ? (
        <span className="font-medium text-info">{info.row.original.phase || "Starting…"}</span>
      ) : (
        <span className="tabular-nums">{formatStarted(info.getValue())}</span>
      ),
  }),
  helper.accessor((row) => row.durationMs ?? -1, {
    id: "duration",
    header: "Duration",
    cell: (info) => <span className="text-muted-foreground tabular-nums">{info.row.original.live ? "—" : formatDurationMs(info.row.original.durationMs)}</span>,
    meta: { align: "right" },
  }),
  helper.accessor((row) => runTrigger(row), {
    id: "trigger",
    header: "Trigger",
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
  }),
  helper.accessor((row) => row.errorMessage ?? "", {
    id: "detail",
    header: "Detail",
    enableSorting: false,
    cell: (info) => (
      <span className="block max-w-[420px] truncate text-muted-foreground" title={info.getValue() || undefined}>
        {info.getValue() ? friendlyRunError(info.getValue()) : "—"}
      </span>
    ),
  }),
  helper.accessor("status", {
    header: "Status",
    cell: (info) => <RunStatusBadge status={info.getValue()} />,
    meta: { align: "right" },
  }),
];

const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "not_run", label: "Not run" },
];

type RunsTabProps = {
  projectId: string;
  runs: RunRow[];
  loading: boolean;
  /** Optional block above the table (latest result with screenshots). */
  header?: React.ReactNode;
  onRun?: () => void;
  canRun?: boolean;
};

/** Run history for one test case: status filter, sortable table, live row on top. */
export function RunsTab({ projectId, runs, loading, header, onRun, canRun }: RunsTabProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const rows = useMemo(
    () => (status ? runs.filter((run) => run.live || normalizeStatus(run.status) === status) : runs),
    [runs, status]
  );

  return (
    <div className="space-y-4">
      {header}
      <Toolbar
        filters={<Select aria-label="Filter by status" value={status} onChange={setStatus} options={STATUS_FILTERS} />}
        actions={<span className="text-[13px] text-muted-foreground tabular-nums">{rows.length} runs</span>}
      />
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        getRowId={(row) => row.id}
        onRowClick={(row) => {
          if (!row.live) navigate(`/projects/${projectId}/results/${row.id}`);
        }}
        rowLabel={(row) => `Open run from ${formatStarted(row.startedAt)}`}
        rowClassName={(row) => (row.live ? "bg-state-active hover:bg-state-active" : undefined)}
        empty={
          status ? (
            <EmptyState icon={History} title="No runs with this status" size="sm" action={<Button variant="outline" size="sm" onClick={() => setStatus("")}>Clear filter</Button>} />
          ) : (
            <EmptyState
              icon={History}
              title="No runs yet"
              description="Run the test to see its history here."
              size="sm"
              action={onRun ? <Button size="sm" onClick={onRun} disabled={!canRun}>Run test</Button> : null}
            />
          )
        }
      />
    </div>
  );
}
