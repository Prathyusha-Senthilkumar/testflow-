import { friendlyStepLabel } from "@/lib/stepLabel";
import { stepScreenshotSrc, type RunScreenshot } from "@/lib/api";

export type RunReportInput = {
  testName: string;
  projectName?: string | null;
  suiteName?: string | null;
  runId: string;
  executedAt?: string | null;
  environment?: string | null;
  status: string;
  duration?: string | null;
  errorMessage?: string | null;
  steps: RunScreenshot[];
};

export function splitFailure(message: string): { summary: string; details: string | null } {
  const lines = message.split(/\r?\n/).map((line) => line.trimEnd());
  const summary = (lines.find((line) => line.trim()) || message).trim().slice(0, 500);
  const firstContent = lines.findIndex((line) => line.trim());
  const rest = lines.slice(firstContent + 1).join("\n").trim();
  return { summary, details: rest || null };
}

export async function downloadRunReport(input: RunReportInput): Promise<void> {
  const images = await Promise.all(input.steps.map((step) => imageDataUrl(stepScreenshotSrc(input.runId, step))));
  const html = renderReport(input, images);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName(input);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function reportFileName(input: RunReportInput): string {
  const slug = (input.testName || "test")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `Attest_${slug || "run"}_${input.runId.slice(0, 8)}.html`;
}

async function imageDataUrl(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const blob = await response.blob();
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function renderReport(input: RunReportInput, images: (string | null)[]): string {
  const runFailure = /^fail/i.test(input.status) && input.errorMessage?.trim() ? splitFailure(input.errorMessage) : null;
  const failedStep = input.steps.findIndex((step) => step.failed);
  const failedName = failedStep >= 0 ? friendlyStepLabel(input.steps[failedStep].label) : "";
  const rows = [
    ["Test case", input.testName],
    ["Project", input.projectName || "—"],
    ["Suite", input.suiteName || "—"],
    ["Run ID", input.runId],
    ["Executed", input.executedAt || "—"],
    ["Environment", input.environment || "Not recorded for this run"],
    ["Result", input.status],
    ["Duration", input.duration || "—"],
  ];
  if (failedStep >= 0) rows.push(["Failed at", `Step ${failedStep + 1} — ${failedName}`]);
  const steps = input.steps
    .map((step, index) => {
      const name = friendlyStepLabel(step.label);
      const image = images[index];
      const stepFailure = step.failed ? splitFailure(step.error?.trim() || "Step failed, but no failure details were provided.") : null;
      return `<section>
        <h2>Step ${index + 1} — ${escapeHtml(name)}</h2>
        <p>Status: ${step.failed ? "Failed" : "Completed"}</p>
        ${image ? `<img alt="${escapeHtml(`Screenshot after Step ${index + 1}: ${name}`)}" src="${image}" />` : "<p>Screenshot unavailable.</p>"}
        ${stepFailure ? `<p><strong>Failure reason:</strong> ${escapeHtml(stepFailure.summary)}</p>${stepFailure.details ? `<h3>Technical details</h3><pre>${escapeHtml(stepFailure.details)}</pre>` : ""}` : ""}
      </section>`;
    })
    .join("\n");
  const failedCount = input.steps.filter((step) => step.failed).length;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.testName)} — Attest report</title>
  <style>
    body { font-family: Segoe UI, sans-serif; color: #0f172a; margin: 32px auto; max-width: 880px; line-height: 1.45; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0 28px; }
    td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; vertical-align: top; }
    td:first-child { width: 160px; color: #64748b; }
    section { break-inside: avoid; margin: 0 0 28px; }
    img { display: block; max-width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
    pre { white-space: pre-wrap; background: #f8fafc; padding: 12px; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(input.testName)}</h1>
  <p>Execution report for run ${escapeHtml(input.runId)}.</p>
  <table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
  ${failedStep < 0 && runFailure ? `<h2>Failure reason</h2><p>${escapeHtml(runFailure.summary)}</p>${runFailure.details ? `<h3>Technical details</h3><pre>${escapeHtml(runFailure.details)}</pre>` : ""}` : ""}
  ${steps}
  <h2>Summary</h2>
  <p>Result: ${escapeHtml(input.status)}. Steps recorded: ${input.steps.length}. Failed steps: ${failedCount}. Duration: ${escapeHtml(input.duration || "—")}.</p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
