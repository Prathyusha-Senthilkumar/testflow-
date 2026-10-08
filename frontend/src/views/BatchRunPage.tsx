"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { WaitingHint } from "@/components/runs/WaitingHint";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FolderKanban, Layers, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate, useParams } from "@/lib/navigation";
import { api, type BatchCaseResult, type BatchExecutionStatus } from "@/lib/api";
import { suiteCategoryLabel } from "@/lib/suiteCategory";
import { pollWhileVisible } from "@/hooks/useExecutionPolling";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page-header";
import { usePublishEntityName } from "@/components/layout/shell-context";
import { DataTable, createDataTableColumns, type DataTableColumn } from "@/components/ui/data-table";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { Stat, StatGroup } from "@/components/common/Stat";
import { EmptyState } from "@/components/common/EmptyState";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const POLL_MS = 2000;

const OUTCOME_LABEL: Record<BatchCaseResult["outcome"], string> = {
  passed: "Passed",
  failed: "Failed",
  running: "Running",
  queued: "Queued",
  skipped: "Skipped",
  cancelled: "Cancelled",
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

function finishedCount(cases: BatchCaseResult[]): number {
  return cases.filter((item) => item.outcome !== "queued" && item.outcome !== "running").length;
}

const suiteCol = createDataTableColumns<SuiteSlice>();
const suiteColumns: DataTableColumn<SuiteSlice>[] = [
  suiteCol.accessor("name", {
    header: "Suite",
    cell: ({ getValue }) => <span className="font-medium text-foreground">{getValue()}</span>,
  }),
  suiteCol.accessor((suite) => suiteStatus(suite.cases), {
    id: "status",
    header: "Status",
    cell: ({ getValue }) => <RunStatusBadge status={getValue()} />,
  }),
  suiteCol.accessor((suite) => finishedCount(suite.cases), {
    id: "progress",
    header: "Progress",
    meta: { align: "right" },
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {finishedCount(row.original.cases)} / {row.original.cases.length}
      </span>
    ),
  }),
  suiteCol.display({
    id: "summary",
    header: "Summary",
    cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{countLine(row.original.cases)}</span>,
  }),
];

const caseCol = createDataTableColumns<BatchCaseResult>();
const caseColumns: DataTableColumn<BatchCaseResult>[] = [
  caseCol.accessor("name", {
    header: "Test case",
    meta: { className: "max-w-[22rem] whitespace-normal" },
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{row.original.name}</div>
        {row.original.testCaseCode ? (
          <div className="font-mono text-xs text-muted-foreground">{row.original.testCaseCode}</div>
        ) : null}
      </div>
    ),
  }),
  caseCol.accessor("outcome", {
    header: "Status",
    cell: ({ row }) => <RunStatusBadge status={row.original.outcome} label={OUTCOME_LABEL[row.original.outcome]} />,
  }),
  caseCol.accessor((item) => item.durationMs ?? -1, {
    id: "duration",
    header: "Duration",
    meta: { align: "right" },
    cell: ({ row }) => formatDuration(row.original.durationMs),
  }),
  caseCol.display({
    id: "details",
    header: "Details",
    meta: { className: "max-w-md whitespace-normal" },
    cell: ({ row }) =>
      row.original.reason ? (
        <pre
          className={`line-clamp-4 font-mono text-xs break-words whitespace-pre-wrap ${
            row.original.outcome === "failed" ? "text-destructive" : "text-muted-foreground"
          }`}
          title={row.original.reason}
        >
          {row.original.reason}
        </pre>
      ) : (
        <span className="text-faint">—</span>
      ),
  }),
];

function BatchRunSkeleton() {
  return (
    <PageContainer>
      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <StatGroup columns={5}>
        {["Progress", "Passed", "Failed", "Skipped", "In flight"].map((label) => (
          <Stat key={label} label={label} value={null} loading />
        ))}
      </StatGroup>
      <DataTable columns={caseColumns} data={[]} loading loadingLabel="Loading run…" />
    </PageContainer>
  );
}

export function BatchRunPage() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { batchId = "" } = useParams();
  const [run, setRun] = useState<BatchExecutionStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    // Poll until the batch finishes; pauses while the tab is hidden.
    const stop = pollWhileVisible(async () => {
      try {
        const next = await api.getBatchRun(batchId);
        if (cancelled) return false;
        setRun(next);
        setError("");
        return !next.finished;
      } catch (err) {
        if (!cancelled) setError((err instanceof Error && err.message) || "Could not load this run.");
        return true;
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      stop();
    };
  }, [batchId]);

  const suites = useMemo(() => groupSuites(run), [run]);
  const selectedSuite = suites.find((suite) => suite.id === selectedSuiteId) ?? null;

  usePublishEntityName("project", run?.projectId, run?.projectName);
  usePublishEntityName("suite", run?.suiteId, run?.suiteName);

  if (error && !run) {
    return (
      <PageContainer>
        <Alert variant="error" title="Could not load this run">
          {error}
        </Alert>
      </PageContainer>
    );
  }

  if (!run) return <BatchRunSkeleton />;

  const title = run.batchType === "suite" ? run.suiteName || "Suite" : run.projectName || "Project";
  const done = run.passed + run.failed + run.skipped + (run.cancelled ?? 0);
  const status = parentStatus(run);
  const active = status === "Queued" || status === "Running";
  const suitesDone = suites.filter((suite) => finishedCount(suite.cases) === suite.cases.length).length;
  const inFlight = run.running + run.queued;

  async function cancelRun() {
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
      setRun(await api.cancelBatchRun(run!.batchId));
      toast.success("Cancellation requested");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel this run");
    } finally {
      setBusy(false);
    }
  }

  async function rerun() {
    setBusy(true);
    try {
      const started = await api.rerunBatch(run!.batchId);
      navigate(`/runs/batches/${started.batchId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rerun");
      setBusy(false);
    }
  }

  const caseRows = run.batchType === "project" && selectedSuite ? selectedSuite.cases : run.batchType === "suite" ? run.cases : [];
  const TypeIcon = run.batchType === "suite" ? Layers : FolderKanban;

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={
          <>
            {run.batchType === "suite" ? "Test suite run" : "Project run"} · Run by {run.runBy || "—"}
          </>
        }
        meta={
          <>
            <RunStatusBadge status={status} />
            <WaitingHint status={status} since={run.createdAt} />
            <Badge variant="outline">
              <TypeIcon aria-hidden />
              {run.batchType === "suite" ? "Suite" : "Project"}
            </Badge>
            {run.batchType === "project" && run.suiteCategory ? (
              <Badge variant="outline">Category: {suiteCategoryLabel(run.suiteCategory)}</Badge>
            ) : null}
            {run.environmentName ? <Badge variant="outline">Environment: {run.environmentName}</Badge> : null}
          </>
        }
        actions={
          <>
            {run.batchType === "suite" && run.suiteId ? (
              <Button variant="ghost" asChild>
                <Link to={`/projects/${run.projectId}/suites/${run.suiteId}`}>
                  <ArrowLeft aria-hidden />
                  Back to test suite
                </Link>
              </Button>
            ) : (
              <Button variant="ghost" asChild>
                <Link to="/projects">
                  <ArrowLeft aria-hidden />
                  Back to projects
                </Link>
              </Button>
            )}
            {active ? (
              <Button variant="danger" loading={busy} onClick={cancelRun}>
                {busy ? null : <Square className="size-3.5" aria-hidden />}
                Cancel run
              </Button>
            ) : (
              <Button loading={busy} onClick={rerun}>
                {busy ? null : <RotateCcw aria-hidden />}
                Rerun
              </Button>
            )}
          </>
        }
      />

      {error ? <Alert variant="warning" title="Live updates interrupted">{error}</Alert> : null}

      <StatGroup columns={5}>
        <Stat
          label="Progress"
          value={
            <>
              {done}
              <span className="text-base font-normal text-muted-foreground"> / {run.total}</span>
            </>
          }
          hint={run.batchType === "project" ? `Suites: ${suitesDone} / ${suites.length} completed` : "Test cases completed"}
        />
        <Stat label="Passed" value={run.passed} tone={run.passed > 0 ? "success" : "default"} />
        <Stat label="Failed" value={run.failed} tone={run.failed > 0 ? "destructive" : "default"} />
        <Stat
          label="Skipped"
          value={run.skipped}
          hint={(run.cancelled ?? 0) > 0 ? `${run.cancelled} cancelled` : undefined}
        />
        <Stat
          label="In flight"
          value={inFlight}
          tone={inFlight > 0 ? "info" : "default"}
          hint={inFlight > 0 ? `${run.running} running · ${run.queued} queued` : "Nothing waiting"}
        />
      </StatGroup>

      {run.batchType === "project" && !selectedSuite ? (
        <section className="space-y-3">
          <SectionHeader title="Suites" description="Open a suite to see its test cases." />
          <DataTable
            columns={suiteColumns}
            data={suites}
            getRowId={(suite) => suite.id}
            onRowClick={(suite) => setSelectedSuiteId(suite.id)}
            rowLabel={(suite) => `Open suite ${suite.name}`}
            empty={<EmptyState icon={Layers} size="sm" title="No suites in this run" />}
          />
        </section>
      ) : null}

      {run.batchType === "suite" || selectedSuite ? (
        <section className="space-y-3">
          <SectionHeader
            title={selectedSuite ? selectedSuite.name : "Test cases"}
            count={selectedSuite ? caseRows.length : undefined}
            actions={
              selectedSuite ? (
                <Button variant="ghost" size="sm" onClick={() => setSelectedSuiteId(null)}>
                  <ArrowLeft aria-hidden />
                  Back to suites
                </Button>
              ) : null
            }
          />
          <DataTable
            columns={caseColumns}
            data={caseRows}
            getRowId={(item) => item.testCaseId}
            onRowClick={(item) => {
              if (item.testRunId && run.projectId) navigate(`/projects/${run.projectId}/results/${item.testRunId}`);
            }}
            rowLabel={(item) => `Open result for ${item.name}`}
            rowClassName={(item) => (item.testRunId && run.projectId ? undefined : "cursor-default")}
            empty={<EmptyState size="sm" title="No test cases in this run" />}
          />
        </section>
      ) : null}
    </PageContainer>
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
