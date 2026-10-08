"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "@/lib/navigation";
import { createDraftTestCase, draftEditHref } from "@/lib/createDraftTestCase";
import { PageContainer } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AttestLoader } from "@/components/brand/attest-loader";

/**
 * Legacy `/test-cases/new` route (old links, onboarding). There is no create
 * form any more: it creates a draft and opens it in inline edit mode.
 */
export function TestCaseCreatePage() {
  const { id: projectId = "" } = useParams();
  const navigate = useNavigate();
  const suiteId = useSearchParams()?.get("suiteId") ?? "";
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId || started.current) return;
    started.current = true;
    const from = suiteId ? `/projects/${projectId}/suites/${suiteId}` : `/projects/${projectId}/test-cases`;
    createDraftTestCase(projectId, suiteId || null)
      .then((id) => navigate(draftEditHref(projectId, id, from), { replace: true }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn’t create a test case"));
  }, [projectId, suiteId, navigate]);

  return (
    <PageContainer width="form">
      {error ? (
        <Alert
          variant="error"
          title="Couldn’t create a test case"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={`/projects/${projectId}/test-cases`}>Back to test cases</Link>
            </Button>
          }
        >
          {error}
        </Alert>
      ) : (
        <div className="grid min-h-[40vh] place-items-center">
          <div className="flex flex-col items-center gap-3 text-[13px] text-muted-foreground">
            <AttestLoader size="lg" decorative />
            Creating a draft test…
          </div>
        </div>
      )}
    </PageContainer>
  );
}

export default TestCaseCreatePage;
