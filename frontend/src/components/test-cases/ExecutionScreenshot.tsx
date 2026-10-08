"use client";

import { useEffect, useState } from "react";
import { api, type RunScreenshot } from "@/lib/api";
import { StepScreenshots } from "@/components/runs/StepScreenshots";

type ExecutionScreenshotProps = {
  runId?: string | null;
  status?: string | null;
  errorMessage?: string | null;
  testName?: string | null;
  executedAt?: string | null;
  duration?: string | null;
  environment?: string | null;
};

/** Loads a run's step screenshots and renders them, or the first failure line when there are none. */
export function ExecutionScreenshot({
  runId,
  status,
  errorMessage,
  testName,
  executedAt,
  duration,
  environment,
}: ExecutionScreenshotProps) {
  const [steps, setSteps] = useState<RunScreenshot[] | null>(null);

  useEffect(() => {
    if (!runId) {
      setSteps(null);
      return;
    }
    let cancelled = false;
    api
      .runScreenshots(runId)
      .then((items) => {
        if (!cancelled) setSteps(items);
      })
      .catch(() => {
        if (!cancelled) setSteps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (!runId || steps == null) return null;
  if (steps.length === 0) {
    if (status !== "Failed" || !errorMessage) return null;
    const failure = errorMessage.split(/\r?\n/).find((line) => line.trim()) || errorMessage;
    return <p className="text-[13px] text-destructive">{failure}</p>;
  }
  return (
    <StepScreenshots
      runId={runId}
      steps={steps}
      status={status}
      errorMessage={status === "Failed" ? errorMessage : null}
      report={{
        testName: testName || "Test case",
        executedAt,
        duration,
        environment,
      }}
    />
  );
}
