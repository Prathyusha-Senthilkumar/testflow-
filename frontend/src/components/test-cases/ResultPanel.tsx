"use client";

import { CirclePlay } from "lucide-react";
import type { TestRunHistoryItem, TestRunResult } from "@/lib/api";
import { formatInTimeZone } from "@/lib/scheduleTime";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/EmptyState";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { ExecutionScreenshot } from "@/components/test-cases/ExecutionScreenshot";

type ResultPanelProps = {
  running: boolean;
  runPhase: string;
  /** Result of a run started from this page in this session. */
  lastResult: TestRunResult | null;
  /** Latest finished run from history, shown when there is no fresh result. */
  latestFinished?: TestRunHistoryItem;
  testName: string;
  timeZone: string;
  environmentName: string | null;
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] font-medium text-foreground tabular-nums">{children}</dd>
    </div>
  );
}

function Outcome({ status }: { status: string }) {
  return <RunStatusBadge status={status} label={status === "Passed" ? "Pass" : "Fail"} />;
}

/** Live phase while running, then the latest outcome with step screenshots. */
export function ResultPanel({ running, runPhase, lastResult, latestFinished, testName, timeZone, environmentName }: ResultPanelProps) {
  let body: React.ReactNode;

  if (running || runPhase) {
    body = (
      <p role="status" className="flex items-center gap-2 text-[13px] font-medium text-info">
        <span aria-hidden className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-current" />
        </span>
        {runPhase || "Preparing test..."}
      </p>
    );
  } else if (lastResult) {
    body = (
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Fact label="Outcome">
            <Outcome status={lastResult.status} />
          </Fact>
          <Fact label="Duration">{lastResult.duration.toFixed(2)}s</Fact>
        </dl>
        <ExecutionScreenshot
          runId={lastResult.testRunId}
          status={lastResult.status}
          errorMessage={lastResult.error}
          testName={testName}
          duration={`${lastResult.duration.toFixed(2)}s`}
          environment={environmentName}
        />
      </div>
    );
  } else if (latestFinished) {
    const finishedAt = formatInTimeZone(
      latestFinished.scheduledFor || latestFinished.completedAt || latestFinished.startedAt || "",
      latestFinished.timeZone || timeZone
    );
    body = (
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Fact label="Outcome">
            <Outcome status={latestFinished.status} />
          </Fact>
          <Fact label={latestFinished.scheduledFor ? "Scheduled for" : "Finished"}>{finishedAt}</Fact>
          {latestFinished.durationMs != null ? (
            <Fact label="Duration">{(latestFinished.durationMs / 1000).toFixed(2)}s</Fact>
          ) : null}
        </dl>
        <ExecutionScreenshot
          runId={latestFinished.id}
          status={latestFinished.status}
          errorMessage={latestFinished.errorMessage}
          testName={testName}
          executedAt={formatInTimeZone(
            latestFinished.completedAt || latestFinished.startedAt || "",
            latestFinished.timeZone || timeZone
          )}
          duration={latestFinished.durationMs != null ? `${(latestFinished.durationMs / 1000).toFixed(2)}s` : null}
          environment={null}
        />
      </div>
    );
  } else {
    body = (
      <EmptyState
        icon={CirclePlay}
        title="No runs yet"
        description="Run the test to see pass/fail and step screenshots here."
        size="sm"
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Latest result</CardTitle>
          <CardDescription>Outcome and step-by-step screenshots of the most recent run.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
