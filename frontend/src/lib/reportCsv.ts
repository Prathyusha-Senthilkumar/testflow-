import type { ReportRun } from "@/lib/api";

export const REPORT_CSV_COLUMNS = [
  "Project",
  "Suite",
  "Test Case",
  "Test Case Name",
  "Status",
  "Executed At",
  "Duration",
  "Failure Reason",
] as const;

export function formatDuration(durationMs?: number | null): string {
  if (durationMs === null || durationMs === undefined) return "";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function formatExecutedAt(value?: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString();
}

export function reportCsv(rows: ReportRun[]): string {
  const lines = [REPORT_CSV_COLUMNS.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.projectName || "",
        row.suiteName || "",
        row.testCaseCode || "",
        row.testName || "",
        row.status || "",
        formatExecutedAt(row.completedAt || row.startedAt),
        formatDuration(row.durationMs),
        row.status === "Failed" ? row.errorMessage || "" : "",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\r\n");
}

export function reportFileName(projectName: string | null, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const slug = (projectName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug ? `testflow-report-${slug}-${day}.csv` : `testflow-test-summary-${day}.csv`;
}

export function downloadReportCsv(rows: ReportRun[], projectName: string | null): void {
  const blob = new Blob([reportCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName(projectName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
