"use client";

import { Copy, FileCode2, Mic, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";

type ScriptTabProps = {
  /** `null` while loading. */
  content: string | null;
  path: string;
  onEdit: () => void;
  onRecord: () => void;
  recording: boolean;
  canRecord: boolean;
};

/** Read-only code view of the test's Playwright script with line numbers. */
export function ScriptTab({ content, path, onEdit, onRecord, recording, canRecord }: ScriptTabProps) {
  if (content === null) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-surface p-4" aria-busy="true">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-3.5" style={{ width: `${40 + ((index * 37) % 50)}%` }} />
        ))}
      </div>
    );
  }

  if (!content.trim()) {
    return (
      <EmptyState
        variant="panel"
        icon={FileCode2}
        title="No script yet"
        description="Record the flow in the browser, or paste a test script."
        action={
          <>
            <Button onClick={onRecord} loading={recording} disabled={!canRecord}>
              {!recording ? <Mic /> : null}
              Record
            </Button>
            <Button variant="outline" onClick={onEdit}>
              <Pencil />
              Write script
            </Button>
          </>
        }
      />
    );
  }

  const lines = content.replace(/\n$/, "").split("\n");

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <code className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={path}>
          Test script
        </code>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard
                .writeText(content)
                .then(() => toast.success("Script copied"))
                .catch(() => toast.error("Could not copy the script"));
            }}
          >
            <Copy />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={onRecord} loading={recording} disabled={!canRecord}>
            {!recording ? <Mic /> : null}
            Re-record
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil />
            Edit
          </Button>
        </div>
      </div>
      <pre className="max-h-[640px] overflow-auto bg-elevated py-3 font-mono text-xs leading-5 text-foreground" tabIndex={0} aria-label="Script source">
        <code className="grid grid-cols-[auto_minmax(0,1fr)]">
          {lines.map((line, index) => (
            <span key={index} className="contents">
              <span aria-hidden className="pr-4 pl-3 text-right text-faint select-none tabular-nums">
                {index + 1}
              </span>
              <span className="pr-4 whitespace-pre">{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
