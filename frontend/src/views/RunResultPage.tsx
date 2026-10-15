"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { WaitingHint } from "@/components/runs/WaitingHint";
import { AdminDetails } from "@/components/common/AdminDetails";
import { friendlyRunError } from "@/lib/friendlyRunError";
import { LoadingArea } from "@/components/common/LoadingArea";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, Download, FileCode2, FileText, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate, useParams, useSearchParams } from "@/lib/navigation";
import { api, type ReportRun, type RunScreenshot, type TestRunHistoryItem } from "@/lib/api";
import { RunsTab } from "@/components/test-cases/RunsTab";
import { formatDuration, formatExecutedAt } from "@/lib/reportCsv";
import { downloadRunPdf, downloadRunReport, splitFailure } from "@/lib/runReport";
import { useRunGitHubIssue } from "@/hooks/useRunGitHubIssue";
import { RunGitHubIssue } from "@/components/integrations/RunGitHubIssue";
import { pollWhileVisible } from "@/hooks/useExecutionPolling";
import { StepScreenshots } from "@/components/runs/StepScreenshots";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { DetailLayout, PageContainer, PageHeader } from "@/components/layout/page-header";
import { runLabel, testCaseLabel, usePublishEntityName } from "@/components/layout/shell-context";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { TestResultPage } from "@/views/TestResultPage";

const POLL_MS = 2000;

const isLiveStatus = (status?: string | null) => status === "Queued" || status === "Running";

function RunResultSkeleton() {
  return (
    <PageContainer width="detail">
      <LoadingArea
        loading
        label="Loading result…"
        skeleton={
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-7 w-80 max-w-full" />
              <Skeleton className="h-4 w-56" />
            </div>
            <DetailLayout main={<Skeleton className="h-80 w-full" />} aside={<Skeleton className="h-48 w-full" />} />
          </div>
        }
      />
    </PageContainer>
  );
}

export function RunResultPage() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { id: projectId = "", runId = "" } = useParams();
  const fromRuns = useSearchParams().get("from") === "runs";
  const [run, setRun] = useState<ReportRun | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [screenshots, setScreenshots] = useState<RunScreenshot[]>([]);
  const [history, setHistory] = useState<TestRunHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const githubIssue = useRunGitHubIssue(runId, run?.status === "Failed");

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    // Poll while the run is queued/running; stop at a terminal status or when
    // the run is missing. Pauses while the tab is hidden.
    const stop = pollWhileVisible(async () => {
      try {
        const row = await api.reportRun(runId);
        if (cancelled) return false;
        setRun(row);
        return isLiveStatus(row.status);
      } catch (err) {
        if (cancelled) return false;
        const message = err instanceof Error ? err.message : "";
        if (/not found/i.test(message)) {
          setMissing(true);
          return false;
        }
        setError(message || "Could not load this result.");
        return true;
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      stop();
    };
  }, [runId]);

  useEffect(() => {
    const status = run?.status;
    if (!runId || isLiveStatus(status) || !status) return;
    let cancelled = false;
    api.runScreenshots(runId).then((items) => {
      if (!cancelled) setScreenshots(items);
    }).catch(() => {
      if (!cancelled) setScreenshots([]);
    });
    return () => {
      cancelled = true;
    };
  }, [runId, run?.status]);

  useEffect(() => {
    const testCaseId = run?.testCaseId;
    if (!testCaseId) return;
    setHistoryLoading(true);
    api
      .testRuns(20, testCaseId)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [run?.testCaseId]);

  usePublishEntityName("project", run?.projectId, run?.projectName);
  usePublishEntityName("testCase", run?.testCaseId, run ? testCaseLabel(run.testCaseCode, run.testName) : null);
  usePublishEntityName("run", run ? runId : null, run ? runLabel(run.startedAt) : null, { testCaseId: run?.testCaseId });

  if (missing) return <TestResultPage />;

  if (error && !run) {
    return (
      <PageContainer width="detail">
        <Alert variant="error" title="Could not load this result">
          {error}
        </Alert>
      </PageContainer>
    );
  }

  if (!run) return <RunResultSkeleton />;

  const cancelled = run.status === "Not Run" && run.errorMessage === "Cancelled";
  const label = cancelled ? "Cancelled" : run.status;
  const active = isLiveStatus(run.status);
  const projectPath = `/projects/${projectId || run.projectId}`;
  const heading = `${run.testCaseCode ? `${run.testCaseCode} · ` : ""}${run.testName || "Test run"}`;

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
      await api.cancelTestRun(runId);
      const next = await api.reportRun(runId);
      setRun(next);
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
      const started = await api.rerunTestRun(runId);
      if (started.testRunId) {
        const from = fromRuns ? "?from=runs" : "";
        navigate(`/projects/${projectId || run?.projectId}/results/${started.testRunId}${from}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rerun");
      setBusy(false);
    }
  }

  async function downloadReport(format: "pdf" | "html") {
    if (!run) return;
    setReportBusy(true);
    try {
      if (format === "pdf") {
        await downloadRunPdf({ testName: run.testName || "Test run", runId: run.id });
        return;
      }
      await downloadRunReport({
        testName: run.testName || "Test run",
        projectName: run.projectName,
        suiteName: run.suiteName,
        runId: run.id,
        executedAt: formatExecutedAt(run.completedAt || run.startedAt),
        environment: null,
        status: cancelled ? "Cancelled" : run.status,
        duration: formatDuration(run.durationMs),
        errorMessage: run.errorMessage,
        steps: screenshots,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download this report");
    } finally {
      setReportBusy(false);
    }
  }

  const showFailure = Boolean(run.errorMessage) && screenshots.length === 0;
  const showScreenshots = screenshots.length > 0 && !active;

  return (
    <PageContainer width="detail">
      <PageHeader
        title={
          run.testCaseId ? (
            <Link
              to={`${projectPath}/test-cases/${run.testCaseId}`}
              className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {heading}
            </Link>
          ) : (
            heading
          )
        }
        description={`Run ${run.id}`}
        meta={
          <>
            <RunStatusBadge status={label} />
            <WaitingHint status={run.status} since={run.startedAt} />
            {run.projectName ? <Badge variant="outline">{run.projectName}</Badge> : null}
            {run.suiteName ? <Badge variant="outline">{run.suiteName}</Badge> : null}
          </>
        }
        actions={
          <>
            {fromRuns && run.testCaseId ? (
              <Button variant="ghost" asChild>
                <Link to={`${projectPath}/test-cases/${run.testCaseId}`}>
                  <ArrowLeft aria-hidden />
                  Back to test case
                </Link>
              </Button>
            ) : (
              <Button variant="ghost" asChild>
                <Link to="/reports">
                  <ArrowLeft aria-hidden />
                  Back to Reports
                </Link>
              </Button>
            )}
            {!active ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" loading={reportBusy} disabled={reportBusy}>
                    {reportBusy ? null : <Download aria-hidden />}
                    {reportBusy ? "Generating report…" : "Download report"}
                    {reportBusy ? null : <ChevronDown className="-mr-1 size-3.5 text-muted-foreground" aria-hidden />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40 p-1">
                  <DropdownMenuItem onSelect={() => void downloadReport("pdf")} className="gap-1.5 px-2 py-1 text-[13px]">
                    <FileText className="size-3.5" aria-hidden /> PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void downloadReport("html")} className="gap-1.5 px-2 py-1 text-[13px]">
                    <FileCode2 className="size-3.5" aria-hidden /> HTML
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {active ? (
              <Button variant="danger" loading={busy} onClick={cancelRun}>
                {busy ? null : <Square className="size-3.5" aria-hidden />}
                Cancel
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

      <DetailLayout
        main={
          <>
            {showFailure ? (
              <Alert variant={cancelled ? "warning" : "error"} title={cancelled ? "Cancelled" : friendlyRunError(run.errorMessage) || "Failure reason"}>
                {cancelled ? null : <AdminDetails detail={splitFailure(run.errorMessage ?? "").summary || run.errorMessage} />}
              </Alert>
            ) : null}
            {showScreenshots ? (
              <Card>
                <CardHeader>
                  <CardTitle>Screenshots</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <StepScreenshots
                    runId={run.id}
                    steps={screenshots}
                    status={run.status}
                    errorMessage={run.status === "Failed" ? run.errorMessage : null}
                  />
                </CardContent>
              </Card>
            ) : active ? (
              <div className="rounded-lg border border-border bg-surface">
                <LoadingSpinner label={run.status === "Queued" ? "Waiting for a runner…" : "Running test…"} />
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>This run</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2.5 text-[13px]">
                    <Row label="Status" value={label} />
                    <Row label="Executed" value={formatExecutedAt(run.completedAt || run.startedAt) || "—"} />
                    <Row label="Duration" value={formatDuration(run.durationMs) || "—"} numeric />
                    <Row label="Run by" value={run.runBy || "—"} />
                  </dl>
                  {run.screenshotPath ? (
                    <p className="mt-3 text-[13px] text-muted-foreground">The screenshot from this run is no longer stored. The saved result is shown here.</p>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </>
        }
        aside={
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Execution result</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2.5 text-[13px]">
                  <Row label="Executed" value={formatExecutedAt(run.completedAt || run.startedAt) || "—"} />
                  <Row label="Duration" value={formatDuration(run.durationMs) || "—"} numeric />
                  <Row label="Run by" value={run.runBy || "—"} />
                </dl>
              </CardContent>
            </Card>
            {githubIssue.status?.connected ? (
              <Card>
                <CardHeader>
                  <CardTitle>GitHub issue</CardTitle>
                </CardHeader>
                <CardContent>
                  <RunGitHubIssue
                    status={githubIssue.status}
                    creating={githubIssue.creating}
                    onCreate={() => void githubIssue.create()}
                  />
                </CardContent>
              </Card>
            ) : null}
          </div>
        }
      />
      {run.testCaseId ? (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">Run history</h2>
          <RunsTab projectId={projectId || run.projectId || ""} runs={history} loading={historyLoading} />
        </section>
      ) : null}
      {!active && run.testCaseId ? (
        <Card>
          <CardHeader>
            <CardTitle>System</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 gap-y-2.5 text-[13px] sm:grid-cols-2">
              <Row label="Created by" value={run.createdBy || "—"} />
              <Row label="Created date" value={formatExecutedAt(run.createdAt) || "—"} />
              <Row label="Last modified by" value={run.lastModifiedBy || "—"} />
              <Row label="Last modified date" value={formatExecutedAt(run.lastModifiedAt) || "—"} />
              <Row label="First run by" value={run.firstRunBy || "—"} />
              <Row label="First run date" value={formatExecutedAt(run.firstRunAt) || "—"} />
              <Row label="Last run by" value={run.lastRunBy || "—"} />
              <Row label="Last run date" value={formatExecutedAt(run.lastRunAt) || "—"} />
            </dl>
          </CardContent>
        </Card>
      ) : null}
    </PageContainer>
  );
}

function Row({ label, value, numeric }: { label: string; value: ReactNode; numeric?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 truncate text-right font-medium text-foreground ${numeric ? "tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}
