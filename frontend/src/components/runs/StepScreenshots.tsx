"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api, stepScreenshotSrc, type RunScreenshot } from "@/lib/api";
import { downloadRunReport, splitFailure, type RunReportInput } from "@/lib/runReport";
import { friendlyStepLabel } from "@/lib/stepLabel";

function StepPreview({
  src,
  alt,
  large = false,
  onFailed,
}: {
  src: string;
  alt: string;
  large?: boolean;
  /** Called when the image fails; return true if a refresh was started (keep waiting instead of showing "unavailable"). */
  onFailed?: () => boolean;
}) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div
        className={cn(
          "grid w-full place-items-center rounded-md bg-elevated px-3 text-center text-muted-foreground",
          large ? "h-64 text-[13px]" : "h-44 text-xs"
        )}
      >
        Screenshot unavailable
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (!onFailed?.()) setBroken(true);
      }}
      className={large ? "mx-auto h-auto w-full object-contain" : "h-44 w-full bg-elevated object-contain"}
    />
  );
}

function screenshotFileName(index: number, label: string): string {
  const slug = friendlyStepLabel(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const step = String(index + 1).padStart(2, "0");
  return slug ? `step-${step}-${slug}.png` : `step-${step}.png`;
}

async function downloadScreenshot(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not download this screenshot");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function StepScreenshots({
  runId,
  steps,
  status,
  errorMessage,
  report,
}: {
  runId: string;
  steps: RunScreenshot[];
  status?: string | null;
  errorMessage?: string | null;
  report?: Omit<RunReportInput, "steps" | "runId" | "errorMessage" | "status"> | null;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  // Signed screenshot URLs expire (~15 min, or on backend restart): refetch the list once on an image error.
  const [freshSteps, setFreshSteps] = useState<RunScreenshot[] | null>(null);
  const refreshed = useRef(false);
  const list = freshSteps ?? steps;
  function refreshExpired(): boolean {
    if (refreshed.current || !list.some((step) => step.url)) return false;
    refreshed.current = true;
    api
      .runScreenshots(runId)
      .then(setFreshSteps)
      .catch(() => setFreshSteps(list.map((step) => ({ ...step }))));
    return true;
  }
  const total = list.length;
  useEffect(() => {
    if (selected == null) return;
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === "ArrowLeft") setSelected((index) => (index != null && index > 0 ? index - 1 : index));
      else if (event.key === "ArrowRight") setSelected((index) => (index != null && index < total - 1 ? index + 1 : index));
      else if (event.key === "Home") setSelected(0);
      else if (event.key === "End") setSelected(total - 1);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, total]);
  if (list.length === 0) return null;
  const current = selected == null ? null : list[selected];
  const title = current ? friendlyStepLabel(current.label) : "";
  const markedFailure = list.some((step) => step.failed);
  const runLevelFailure =
    status === "Failed" && !markedFailure && errorMessage?.trim() ? splitFailure(errorMessage) : null;
  const selectedFailed = status === "Failed" && current?.failed === true;
  const selectedFailure = selectedFailed ? splitFailure(current?.error?.trim() || "") : null;

  async function save(index: number, step: RunScreenshot) {
    setDownloading(step.file);
    try {
      await downloadScreenshot(stepScreenshotSrc(runId, step), screenshotFileName(index, step.label));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download this screenshot");
    } finally {
      setDownloading(null);
    }
  }

  async function saveReport() {
    if (!report) return;
    setReportBusy(true);
    try {
      await downloadRunReport({
        ...report,
        runId,
        status: status || "Completed",
        errorMessage,
        steps: list,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download this report");
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <>
      <div className="@container">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground tabular-nums">
          {steps.length} screenshot{steps.length === 1 ? "" : "s"}
        </p>
        {report ? (
          <Button type="button" variant="secondary" size="sm" onClick={saveReport} loading={reportBusy}>
            {!reportBusy ? <Download aria-hidden /> : null}
            {reportBusy ? "Preparing report…" : "Download report"}
          </Button>
        ) : null}
      </div>
      {runLevelFailure ? (
        <div role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive-soft p-3 text-[13px] text-foreground">
          <p className="font-medium text-destructive">Failure reason</p>
          <p className="mt-1 whitespace-pre-wrap">{runLevelFailure.summary}</p>
        </div>
      ) : null}
      <ol className="mt-3 grid grid-cols-1 items-start gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
        {list.map((step, index) => {
          const name = friendlyStepLabel(step.label);
          const src = stepScreenshotSrc(runId, step);
          const failed = status === "Failed" && step.failed === true;
          const failure = failed ? splitFailure(step.error?.trim() || "Step failed, but no failure details were provided.") : null;
          const alt = `Screenshot after Step ${index + 1}: ${name}`;
          return (
            <li
              key={`${step.file || "missing"}-${index}`}
              className={cn(
                "min-w-0 rounded-md border bg-surface p-2.5",
                failed ? "border-destructive/40" : "border-border"
              )}
            >
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground tabular-nums">Step {index + 1}</p>
                {failed ? <span className="text-xs font-medium text-destructive">Failed</span> : null}
              </div>
              <p className="mb-2 line-clamp-2 text-[13px] text-foreground">{name}</p>
              <button
                type="button"
                onClick={() => setSelected(index)}
                className="block w-full cursor-zoom-in overflow-hidden rounded-md border border-border-subtle bg-elevated transition-[border-color,opacity] duration-150 hover:border-input hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Open screenshot for step ${index + 1}: ${name}`}
              >
                <StepPreview key={src} src={src} alt={alt} onFailed={refreshExpired} />
              </button>
              {failed && failure ? (
                <div className="mt-2 rounded-md bg-destructive-soft p-2 text-[13px] text-foreground">
                  <p className="font-medium text-destructive">Failure reason</p>
                  <p className="mt-1">{failure.summary}</p>
                  {failure.details ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                        Technical details
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto font-mono text-[11px] whitespace-pre-wrap">{failure.details}</pre>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      </div>
      <Modal
        open={current != null}
        onClose={() => setSelected(null)}
        title={selected == null ? "" : `Step ${selected + 1} of ${total} — ${title}`}
        panelClassName="sm:max-w-5xl"
        closeOnBackdrop
        closeOnEscape
        footer={
          current && selected != null ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelected(selected - 1)}
                  disabled={selected === 0}
                  aria-label="Previous step"
                >
                  <ChevronLeft aria-hidden />
                  Previous
                </Button>
                <span className="px-1 text-[13px] text-muted-foreground tabular-nums">
                  {selected + 1} / {total}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelected(selected + 1)}
                  disabled={selected === total - 1}
                  aria-label="Next step"
                >
                  Next
                  <ChevronRight aria-hidden />
                </Button>
              </div>
              <Button type="button" onClick={() => save(selected, current)} loading={downloading === current.file}>
                {downloading !== current.file ? <Download aria-hidden /> : null}
                {downloading === current.file ? "Downloading…" : "Download screenshot"}
              </Button>
            </div>
          ) : null
        }
      >
        {current && selected != null ? (
          <div>
            <div className="group relative">
            <StepPreview
              key={stepScreenshotSrc(runId, current)}
              src={stepScreenshotSrc(runId, current)}
              onFailed={refreshExpired}
              alt={`Screenshot after Step ${selected + 1}: ${title}`}
              large
            />
            {selected > 0 ? (
              <button
                type="button"
                onClick={() => setSelected(selected - 1)}
                aria-label="Previous step"
                title="Previous step (←)"
                className="absolute top-1/2 left-2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-popover/85 text-foreground shadow-md backdrop-blur transition-[opacity,background-color] duration-150 hover:bg-state-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
            ) : null}
            {selected < total - 1 ? (
              <button
                type="button"
                onClick={() => setSelected(selected + 1)}
                aria-label="Next step"
                title="Next step (→)"
                className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-popover/85 text-foreground shadow-md backdrop-blur transition-[opacity,background-color] duration-150 hover:bg-state-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
            ) : null}
            </div>
            {selectedFailed && selectedFailure ? (
              <p className="mt-3 text-[13px] text-foreground">
                <span className="font-medium text-destructive">Failed. </span>
                {selectedFailure.summary}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
