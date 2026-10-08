"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { WaitingHint } from "@/components/runs/WaitingHint";
import { friendlyRunError } from "@/lib/friendlyRunError";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { FileText, FolderKanban, History, Layers, RotateCcw, Search, Square } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "@/lib/navigation";
import { api, type GroupedRun, type ScheduledExecution } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScheduledRuns, type ScheduledRunRow } from "@/components/runs/ScheduledRuns";
import { useScheduledBatches } from "@/hooks/useScheduledBatches";
import { formatInTimeZone } from "@/lib/scheduleTime";
import { suiteCategoryLabel } from "@/lib/suiteCategory";
import { pollWhileVisible } from "@/hooks/useExecutionPolling";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { DataTable, createDataTableColumns, type DataTableColumn } from "@/components/ui/data-table";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { Select } from "@/components/ui/select";

const POLL_MS = 4000;

const TYPE_ICON = {
  project: FolderKanban,
  suite: Layers,
  individual: FileText,
} as const;

const TYPE_LABELS: Record<GroupedRun["runType"], string> = {
  individual: "Individual",
  suite: "Suite",
  project: "Project",
};

const TYPE_OPTIONS = [
  { value: "all", label: "All runs" },
  { value: "individual", label: "Individual" },
  { value: "suite", label: "Suite" },
  { value: "project", label: "Project" },
];

function isLive(run: GroupedRun): boolean {
  return run.status === "Queued" || run.status === "Running";
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

function summary(run: GroupedRun): string {
  if (run.runType === "individual") return friendlyRunError(run.errorMessage) || "—";
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

function progress(run: GroupedRun): string {
  if (run.runType === "individual" || run.total == null) return "—";
  return `${run.completed ?? 0} / ${run.total}`;
}

function RunActions({ run }: { run: GroupedRun }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const active = isLive(run);
  const canRerun = ["Passed", "Failed", "Skipped", "Cancelled", "Completed"].includes(run.status);

  async function cancel(event: MouseEvent) {
    event.stopPropagation();
    const ok = await confirm({
      title: "Cancel this run?",
      tone: "danger",
      confirmLabel: "Cancel run",
      cancelLabel: "Keep running",
      description: <p>Tests that haven’t finished will stop. Results already recorded are kept.</p>,
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (run.runType === "individual") await api.cancelTestRun(run.id);
      else await api.cancelBatchRun(run.id);
      toast.success("Cancellation requested", { description: run.title });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel this run");
    } finally {
      setBusy(false);
    }
  }

  async function rerun(event: MouseEvent) {
    event.stopPropagation();
    setBusy(true);
    try {
      if (run.runType === "individual") {
        const started = await api.rerunTestRun(run.id);
        if (started.testRunId && (started.projectId || run.projectId)) {
          navigate(`/projects/${started.projectId || run.projectId}/results/${started.testRunId}?from=runs`);
        }
        return;
      }
      const started = await api.rerunBatch(run.id);
      navigate(`/runs/batches/${started.batchId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rerun");
    } finally {
      setBusy(false);
    }
  }

  if (!active && !canRerun) return null;
  return (
    <div className="flex justify-end gap-1.5">
      {active ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={cancel} aria-label={`Cancel run ${run.title}`}>
          <Square className="size-3" aria-hidden />
          Cancel
        </Button>
      ) : null}
      {canRerun ? (
        <Button variant="outline" size="sm" loading={busy} onClick={rerun} aria-label={`Rerun ${run.title}`}>
          {busy ? null : <RotateCcw className="size-3.5" aria-hidden />}
          Rerun
        </Button>
      ) : null}
    </div>
  );
}

const col = createDataTableColumns<GroupedRun>();

const columns: DataTableColumn<GroupedRun>[] = [
  col.accessor("runType", {
    header: "Type",
    cell: ({ row }) => {
      const Icon = TYPE_ICON[row.original.runType];
      return (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
          {TYPE_LABELS[row.original.runType]}
        </span>
      );
    },
  }),
  col.accessor("title", {
    header: "Name",
    meta: { className: "max-w-[22rem] whitespace-normal" },
    cell: ({ row }) => {
      const run = row.original;
      return (
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-medium text-foreground">{run.title}</span>
            {run.code ? <span className="shrink-0 font-mono text-xs text-muted-foreground">{run.code}</span> : null}
          </div>
          {(run.runType === "project" && run.suiteCategory) || run.environmentName ? (
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {run.runType === "project" && run.suiteCategory ? (
                <span>Category: {suiteCategoryLabel(run.suiteCategory)}</span>
              ) : null}
              {run.environmentName ? <span>Environment: {run.environmentName}</span> : null}
            </div>
          ) : null}
        </div>
      );
    },
  }),
  col.accessor("status", {
    header: "Status",
    cell: ({ row, getValue }) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <RunStatusBadge status={getValue()} />
        <WaitingHint status={getValue()} since={row.original.startedAt} />
      </span>
    ),
  }),
  col.accessor((run) => (run.runType === "individual" || run.total == null ? -1 : (run.completed ?? 0)), {
    id: "progress",
    header: "Progress",
    meta: { align: "right" },
    cell: ({ row }) => <span className="text-muted-foreground">{progress(row.original)}</span>,
  }),
  col.accessor((run) => run.startedAt ?? "", {
    id: "startedAt",
    header: "Started",
    cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{formatWhen(row.original.startedAt)}</span>,
  }),
  col.accessor((run) => run.durationMs ?? -1, {
    id: "duration",
    header: "Duration",
    meta: { align: "right" },
    cell: ({ row }) => formatDuration(row.original.durationMs),
  }),
  col.display({
    id: "summary",
    header: "Summary",
    meta: { className: "max-w-md whitespace-normal" },
    cell: ({ row }) => {
      const run = row.original;
      if (run.runType === "individual" && run.errorMessage) {
        return (
          <span className="line-clamp-2 text-xs break-words text-destructive" title={run.errorMessage}>
            {friendlyRunError(run.errorMessage)}
          </span>
        );
      }
      return (
        <span className={run.runType === "individual" ? "text-faint" : "text-muted-foreground tabular-nums"}>
          {summary(run)}
        </span>
      );
    },
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    meta: { align: "right" },
    cell: ({ row }) => (
      <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <RunActions run={row.original} />
      </div>
    ),
  }),
];

export function TestRunsPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") === "scheduled" ? "scheduled" : "history");
  const batches = useScheduledBatches({});
  const [scheduledCases, setScheduledCases] = useState<ScheduledExecution[]>([]);
  const scheduledCount = scheduledCases.length + batches.items.length;

  useEffect(() => {
    api.scheduledExecutions().then(setScheduledCases).catch(() => setScheduledCases([]));
  }, []);

  async function cancelScheduled(row: ScheduledRunRow) {
    if (row.kind === "batch") {
      await batches.cancel(row.item);
      return;
    }
    const item = row.item;
    const label = item.testCaseCode || "this test";
    const when = item.scheduledFor ? formatInTimeZone(item.scheduledFor, item.timeZone || "UTC") : "";
    const cancelled = await confirm({
      title: "Cancel scheduled run?",
      description: `${label}${when ? ` will no longer run at ${when}` : " will no longer run"}.`,
      confirmLabel: "Cancel run",
      cancelLabel: "Keep it",
      tone: "danger",
      onConfirm: () => api.cancelScheduledExecution(item.jobId),
    });
    if (!cancelled) return;
    setScheduledCases((current) => current.filter((entry) => entry.jobId !== item.jobId));
    toast.success("Scheduled run cancelled");
  }
  const [runs, setRuns] = useState<GroupedRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    // Poll only while some run is queued/running; pauses while the tab is hidden.
    const stop = pollWhileVisible(async () => {
      try {
        const items = await api.groupedRuns();
        if (cancelled) return false;
        setRuns(items);
        setError("");
        return items.some(isLive);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load test runs");
        return true;
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      stop();
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
      if (run.projectId) navigate(`/projects/${run.projectId}/results/${run.id}?from=runs`);
      return;
    }
    navigate(`/runs/batches/${run.id}`);
  }

  const filtered = query.trim() !== "" || typeFilter !== "all";

  return (
    <PageContainer>
      <PageHeader title="Test Runs" description="Execution history and upcoming scheduled runs for test cases, suites and projects." />

      {error ? <Alert variant="error" title="Could not refresh test runs">{error}</Alert> : null}

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList variant="line" className="h-auto w-full justify-start gap-1 rounded-none border-b border-border p-0">
          <TabsTrigger value="history" className="h-9 flex-none rounded-none px-3 text-[13px] after:bottom-[-1px]">
            History
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="h-9 flex-none rounded-none px-3 text-[13px] after:bottom-[-1px]">
            Scheduled
            {scheduledCount > 0 ? (
              <span className="ml-1.5 rounded-sm bg-elevated px-1.5 text-xs font-medium text-muted-foreground tabular-nums">{scheduledCount}</span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scheduled">
          <ScheduledRuns cases={scheduledCases} batches={batches.items} onCancel={(row) => void cancelScheduled(row)} />
        </TabsContent>

        <TabsContent value="history">
      <div className="flex flex-col">
        <Toolbar
          sticky
          className="mb-1"
          search={
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search by name, code, or status…"
              shortcut="/"
              bindShortcut
            />
          }
          filters={<Select aria-label="Run type" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />}
          actions={
            !loading && runs.length > 0 ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                Showing {visible.length} of {runs.length} run{runs.length === 1 ? "" : "s"}
              </p>
            ) : null
          }
        />

        <DataTable
          columns={columns}
          data={visible}
          getRowId={(run) => `${run.runType}-${run.id}`}
          loading={loading}
          loadingLabel="Loading test runs…"
          minWidth={960}
          onRowClick={openRun}
          rowLabel={(run) => `Open ${TYPE_LABELS[run.runType]} run ${run.title}`}
          empty={
            runs.length === 0 ? (
              <EmptyState
                icon={History}
                title="No test runs yet"
                description="Run a test case, suite or project to see it here."
              />
            ) : (
              <EmptyState
                icon={Search}
                size="sm"
                title="No matching runs"
                action={
                  filtered ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setQuery("");
                        setTypeFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : null
                }
              />
            )
          }
        />
      </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

export default TestRunsPage;
