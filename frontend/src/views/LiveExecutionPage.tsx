"use client";

import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "@/lib/navigation";
import { useExecutionPolling } from "@/hooks/useExecutionPolling";
import { testCases } from "@/lib/demoData";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
    <PageContainer width="detail">
      <PageHeader
        title={testCaseCode ? `${testCaseCode} · ${title}` : title}
        description="Live execution. You'll be taken to the result when the job finishes."
        meta={
          <>
            <RunStatusBadge status={state} label={stateLabel[state] ?? state} />
            <span className="font-mono text-xs text-muted-foreground">Job {runId}</span>
          </>
        }
        actions={
          <Button variant="outline" asChild>
            <Link to={`/projects/${id}/test-cases/${testCaseCode ?? "TC-001"}`}>
              <ArrowLeft aria-hidden />
              Back to test case
            </Link>
          </Button>
        }
      />

      <Alert variant="info">This test runs in the background on a test runner. You can leave this page; results are saved.</Alert>
      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 text-[13px] sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Test case</dt>
              <dd className="mt-0.5 truncate font-medium">{testCaseCode ? `${testCaseCode} — ${title}` : title}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Runner config</dt>
              <dd className="mt-0.5 truncate font-mono text-xs">{execution?.configPath ?? "—"}</dd>
            </div>
          </dl>
          <div className="border-t border-border pt-2">
            <LoadingSpinner compact label="Polling execution status every 2 seconds while this tab is visible." className="py-2" />
          </div>
          {execution?.error ? <p className="text-[13px] text-destructive">{execution.error}</p> : null}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

export default LiveExecutionPage;
