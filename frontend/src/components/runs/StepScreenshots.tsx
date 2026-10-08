"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { testRunStepUrl, type RunScreenshot } from "@/lib/api";
import { downloadRunReport, splitFailure, type RunReportInput } from "@/lib/runReport";
import { friendlyStepLabel } from "@/lib/stepLabel";

function StepPreview({ src, alt, large = false }: { src: string; alt: string; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div
        className={`grid w-full place-items-center rounded-lg bg-slate-50 px-3 text-center text-sm text-slate-400 ${large ? "h-64" : "h-44 text-xs"}`}
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
      onError={() => setBroken(true)}
      className={large ? "mx-auto h-auto w-full object-contain" : "h-44 w-full object-contain"}
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
  const [downloadError, setDownloadError] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  if (steps.length === 0) return null;
  const current = selected == null ? null : steps[selected];
  const title = current ? friendlyStepLabel(current.label) : "";
  const markedFailure = steps.some((step) => step.failed);
  const runLevelFailure =
    status === "Failed" && !markedFailure && errorMessage?.trim() ? splitFailure(errorMessage) : null;
  const selectedFailed = status === "Failed" && current?.failed === true;
  const selectedFailure = selectedFailed ? splitFailure(current?.error?.trim() || "") : null;

  async function save(index: number, step: RunScreenshot) {
    setDownloadError("");
    setDownloading(step.file);
    try {
      await downloadScreenshot(testRunStepUrl(runId, step.file), screenshotFileName(index, step.label));
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Could not download this screenshot");
    } finally {
      setDownloading(null);
    }
  }

  async function saveReport() {
    if (!report) return;
    setDownloadError("");
    setReportBusy(true);
    try {
      await downloadRunReport({
        ...report,
        runId,
        status: status || "Completed",
        errorMessage,
        steps,
      });
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Could not download this report");
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{steps.length} screenshot{steps.length === 1 ? "" : "s"}</p>
        {report ? (
          <button
            type="button"
            onClick={saveReport}
            disabled={reportBusy}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Download size={15} />
            {reportBusy ? "Preparing report..." : "Download Report"}
          </button>
        ) : null}
      </div>
      {runLevelFailure ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Failure reason</p>
          <p className="mt-1 whitespace-pre-wrap">{runLevelFailure.summary}</p>
        </div>
      ) : null}
      <ol className="mt-3 grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        {steps.map((step, index) => {
          const name = friendlyStepLabel(step.label);
          const src = step.file ? testRunStepUrl(runId, step.file) : "";
          const failed = status === "Failed" && step.failed === true;
          const failure = failed ? splitFailure(step.error?.trim() || "Step failed, but no failure details were provided.") : null;
          const alt = `Screenshot after Step ${index + 1}: ${name}`;
          return (
            <li
              key={`${step.file || "missing"}-${index}`}
              className={`min-w-0 rounded-xl border bg-white p-3 ${failed ? "border-red-200" : "border-slate-200"}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">Step {index + 1}</p>
                {failed ? <span className="text-xs font-semibold text-red-700">Failed</span> : null}
              </div>
              <p className="mb-2 line-clamp-2 text-sm text-slate-600">{name}</p>
              <button
                type="button"
                onClick={() => setSelected(index)}
                className="block w-full cursor-pointer overflow-hidden rounded-lg bg-slate-50 ring-slate-200 hover:opacity-90 hover:ring-2"
                aria-label={`Open screenshot for step ${index + 1}: ${name}`}
              >
                <StepPreview src={src} alt={alt} />
              </button>
              {failed && failure ? (
                <div className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">
                  <p className="font-medium">Failure reason</p>
                  <p className="mt-1">{failure.summary}</p>
                  {failure.details ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium">Technical details</summary>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{failure.details}</pre>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {downloadError ? <p className="mt-2 text-sm text-red-600">{downloadError}</p> : null}
      <Modal
        open={current != null}
        onClose={() => setSelected(null)}
        title={selected == null ? "" : `Step ${selected + 1} — ${title}`}
        panelClassName="max-h-[90vh] max-w-5xl overflow-hidden"
        closeOnBackdrop
        closeOnEscape
        footer={
          current && selected != null ? (
            <button
              type="button"
              onClick={() => save(selected, current)}
              disabled={downloading === current.file}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              <Download size={16} />
              {downloading === current.file ? "Downloading..." : "Download screenshot"}
            </button>
          ) : null
        }
      >
        {current && selected != null ? (
          <div className="max-h-[70vh] overflow-auto">
            <StepPreview
              key={current.file}
              src={current.file ? testRunStepUrl(runId, current.file) : ""}
              alt={`Screenshot after Step ${selected + 1}: ${title}`}
              large
            />
            {selectedFailed && selectedFailure ? (
              <p className="mt-3 text-sm text-red-800">
                <span className="font-medium">Failed. </span>
                {selectedFailure.summary}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
