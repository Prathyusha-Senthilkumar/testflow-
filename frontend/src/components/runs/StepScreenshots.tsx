"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { testRunStepUrl, type RunScreenshot } from "@/lib/api";

export function friendlyStepLabel(raw: string): string {
  const line = raw.replace(/^await\s+/, "").replace(/;$/, "").trim();
  if (!line || /^final screenshot$/i.test(line)) return "Final screenshot";

  const opened = line.match(/page\.goto\(\s*["']([^"']+)["']/);
  if (opened) {
    try {
      const url = new URL(opened[1]);
      const path = url.pathname === "/" ? "" : url.pathname;
      return `Open ${url.host}${path}`;
    } catch {
      return `Open ${opened[1]}`;
    }
  }

  const role = line.match(/getByRole\(\s*["']([^"']+)["']\s*,\s*\{\s*name:\s*["']([^"']+)["']/);
  const byText = line.match(/getByText\(\s*["']([^"']+)["']/);
  const byLabel = line.match(/getByLabel\(\s*["']([^"']+)["']/);
  const byPlaceholder = line.match(/getByPlaceholder\(\s*["']([^"']+)["']/);
  const byLocator = line.match(/locator\(\s*["']([^"']+)["']/);
  const target = role
    ? `the ${role[2]} ${role[1]}`
    : byText?.[1] || byLabel?.[1] || byPlaceholder?.[1] || byLocator?.[1];

  if (/\.click\(/.test(line) && target) return `Click ${target}`;
  if (/\.dblclick\(/.test(line) && target) return `Double-click ${target}`;
  if (/\.hover\(/.test(line) && target) return `Hover over ${target}`;
  if (/\.check\(/.test(line) && target) return `Check ${target}`;
  if (/\.uncheck\(/.test(line) && target) return `Uncheck ${target}`;
  if (/\.fill\(/.test(line)) {
    const value = line.match(/\.fill\(\s*["']([^"']*)["']/);
    if (target && value) return `Enter "${value[1]}" in ${target}`;
    if (target) return `Type into ${target}`;
  }
  if (/\.press\(/.test(line)) {
    const key = line.match(/\.press\(\s*["']([^"']+)["']/);
    return key && target ? `Press ${key[1]} in ${target}` : key ? `Press ${key[1]}` : "Press a key";
  }
  if (/\.selectOption\(/.test(line) && target) return `Choose an option in ${target}`;
  if (/toHaveTitle\(/.test(line)) {
    const title = line.match(/toHaveTitle\(\s*["']([^"']+)["']/);
    return title ? `Check the page title is "${title[1]}"` : "Check the page title";
  }
  if (line.length <= 90 && !/page\.|getBy|locator\(/.test(line)) return line;
  return "Complete the next action";
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

/** Keep a normal 16:9 screen. Older captures are full-page and very tall. */
async function screenShotBlob(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const screenHeight = Math.round(bitmap.width * 9 / 16);
  if (bitmap.height <= screenHeight + 2) return blob;
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = screenHeight;
  const context = canvas.getContext("2d");
  if (!context) return blob;
  context.drawImage(bitmap, 0, 0, bitmap.width, screenHeight, 0, 0, bitmap.width, screenHeight);
  const cropped = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return cropped ?? blob;
}

async function downloadScreenshot(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not download this screenshot");
  const blob = await screenShotBlob(await response.blob());
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function StepScreenshots({ runId, steps }: { runId: string; steps: RunScreenshot[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  if (steps.length === 0) return null;
  const current = selected == null ? null : steps[selected];
  const title = current ? friendlyStepLabel(current.label) : "";

  async function save(index: number, step: RunScreenshot) {
    const key = step.file;
    setDownloadError("");
    setDownloading(key);
    try {
      await downloadScreenshot(testRunStepUrl(runId, step.file), screenshotFileName(index, step.label));
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Could not download this screenshot");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      <ol className="mt-4 space-y-2">
        {steps.map((step, index) => {
          const name = friendlyStepLabel(step.label);
          const src = testRunStepUrl(runId, step.file);
          return (
            <li key={step.file}>
              <button
                type="button"
                onClick={() => setSelected(index)}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-2 text-left hover:bg-slate-50"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{name}</span>
                <img src={src} alt="" className="h-12 w-20 shrink-0 rounded object-cover object-top" />
              </button>
            </li>
          );
        })}
      </ol>
      {downloadError ? <p className="mt-2 text-sm text-red-600">{downloadError}</p> : null}
      <Modal
        open={current != null}
        onClose={() => setSelected(null)}
        title={selected == null ? "" : `Step ${selected + 1}`}
        description={title}
        panelClassName="max-w-4xl"
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
        {current ? (
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
            <img
              src={testRunStepUrl(runId, current.file)}
              alt={title}
              className="h-full w-full object-cover object-top"
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
