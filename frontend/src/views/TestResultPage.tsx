"use client";

import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "@/lib/navigation";
import { useExecutionPolling } from "@/hooks/useExecutionPolling";
import { testCases } from "@/lib/demoData";
import { DetailLayout, PageContainer, PageHeader } from "@/components/layout/page-header";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TestResultPage() {
  const { id = "demo-project", runId } = useParams();
  const { execution, error } = useExecutionPolling(runId);
  const result = execution?.result;
  const failed = execution?.state === "failed" || (result && !result.success);
  const tc = testCases.find((t) => t.id === execution?.testCaseCode);
  const title = result?.title ?? tc?.name ?? execution?.testCaseCode ?? "Test execution";

  if (error) {
    return (
      <PageContainer width="detail">
        <Alert variant="error" title="Could not load this execution">
          {error}
        </Alert>
      </PageContainer>
    );
  }

  if (!execution) {
    return (
      <PageContainer width="detail">
        <div className="space-y-2" role="status" aria-busy="true">
          <span className="sr-only">Loading execution result…</span>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-7 w-72 max-w-full" />
        </div>
        <DetailLayout main={<Skeleton className="h-56 w-full" />} aside={<Skeleton className="h-40 w-full" />} />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="detail">
      <PageHeader
        title={title}
        meta={
          <>
            <RunStatusBadge status={failed ? "failed" : "passed"} />
            <Badge variant="outline">State: {execution.state}</Badge>
          </>
        }
        actions={
          <Button variant="outline" asChild>
            <Link to={`/projects/${id}/test-cases/${execution.testCaseCode ?? "TC-001"}`}>
              <ArrowLeft aria-hidden />
              Back to test case
            </Link>
          </Button>
        }
      />

      <DetailLayout
        main={
          <>
            {execution.error ? (
              <Alert variant="error" title="Error">
                {execution.error}
              </Alert>
            ) : null}
            {result?.validationErrors && result.validationErrors.length > 0 ? (
              <Alert variant="warning" title="Validation errors">
                <ul className="list-disc space-y-0.5 pl-4">
                  {result.validationErrors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>Execution result</CardTitle>
              </CardHeader>
              <CardContent>
                {result ? (
                  <dl className="space-y-2.5 text-[13px]">
                    <div className="flex gap-3">
                      <dt className="w-32 shrink-0 text-muted-foreground">Runner status</dt>
                      <dd className="font-medium">{result.status}</dd>
                    </div>
                    <div className="flex gap-3">
                      <dt className="w-32 shrink-0 text-muted-foreground">Success</dt>
                      <dd className="font-medium">{result.success ? "Yes" : "No"}</dd>
                    </div>
                    {result.testCaseLocation ? (
                      <div className="flex gap-3">
                        <dt className="w-32 shrink-0 text-muted-foreground">Test case file</dt>
                        <dd className="min-w-0 font-mono text-xs break-all">{result.testCaseLocation}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <p className="text-[13px] text-muted-foreground">No result payload yet.</p>
                )}
              </CardContent>
            </Card>
          </>
        }
        aside={
          <Card>
            <CardHeader>
              <CardTitle>Details for administrators</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5 font-mono text-xs">
                <div>
                  <dt className="font-sans text-[13px] text-muted-foreground">Configuration file</dt>
                  <dd className="mt-0.5 break-all">{result?.configPath || "—"}</dd>
                </div>
                <div>
                  <dt className="font-sans text-[13px] text-muted-foreground">Script file</dt>
                  <dd className="mt-0.5 break-all">{result?.testFileLocation || "—"}</dd>
                </div>
                <div>
                  <dt className="font-sans text-[13px] text-muted-foreground">Runner exit code</dt>
                  <dd className="mt-0.5 tabular-nums">{result != null ? result.pytestReturnCode : "—"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        }
      />
    </PageContainer>
  );
}

export default TestResultPage;
