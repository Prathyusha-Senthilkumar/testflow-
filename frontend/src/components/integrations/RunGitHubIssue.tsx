"use client";

import { ArrowUpRight, RotateCcw } from "lucide-react";
import type { RunGitHubIssueStatus } from "@/lib/api";
import { AttestLoader } from "@/components/brand/attest-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitHubMark } from "@/components/integrations/GitHubMark";

export type RunGitHubIssueProps = {
  /** `null` while loading or when the lookup failed. Renders nothing when the project isn't connected. */
  status: RunGitHubIssueStatus | null;
  /** Files the issue now (also used to retry a failed attempt). */
  onCreate: () => void;
  /** A create/retry request is in flight. */
  creating?: boolean;
};

/** GitHub issue state for a failed run: link, filing, error with retry, or a create button. */
export function RunGitHubIssue({ status, onCreate, creating = false }: RunGitHubIssueProps) {
  if (!status?.connected) return null;
  const issue = status.issue;

  if (creating || issue?.state === "pending") {
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
        <AttestLoader size="sm" tone="current" decorative />
        Filing GitHub issue…
      </p>
    );
  }

  if (!issue) {
    return (
      <Button variant="outline" size="sm" onClick={onCreate}>
        <GitHubMark /> Create GitHub issue
      </Button>
    );
  }

  if (issue.state === "error") {
    return (
      <div className="space-y-2.5" role="alert">
        <div className="text-[13px]">
          <p className="font-medium text-destructive">Couldn&apos;t file the GitHub issue</p>
          {issue.error ? <p className="mt-1 text-muted-foreground">{issue.error}</p> : null}
        </div>
        <Button variant="outline" size="sm" onClick={onCreate}>
          <RotateCcw aria-hidden /> Try again
        </Button>
      </div>
    );
  }

  const open = issue.state === "open";
  return (
    <div className="flex items-center justify-between gap-3">
      <a
        href={issue.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-0 items-center gap-1.5 rounded-sm text-[13px] font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        <GitHubMark className="size-3.5" />
        <span className="tabular-nums">#{issue.number}</span>
        <span className="text-muted-foreground">{issue.commented ? "on GitHub (added as a comment)" : "on GitHub"}</span>
        <ArrowUpRight className="size-3 text-muted-foreground" aria-hidden />
      </a>
      <Badge variant={open ? "success" : "outline"} dot>
        {open ? "Open" : "Closed"}
      </Badge>
    </div>
  );
}
