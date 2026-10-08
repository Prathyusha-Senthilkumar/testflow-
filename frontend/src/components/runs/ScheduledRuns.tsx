"use client";

import { CalendarClock, FileText, FolderKanban, Layers, X } from "lucide-react";
import type { ScheduledBatch, ScheduledExecution } from "@/lib/api";
import { formatInTimeZone } from "@/lib/scheduleTime";
import { SUITE_CATEGORY_LABELS, type SuiteCategory } from "@/lib/suiteCategory";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { ListPagination, usePagedItems } from "@/components/ui/list-pagination";

export type ScheduledRunRow =
  | { kind: "case"; item: ScheduledExecution }
  | { kind: "batch"; item: ScheduledBatch };

type ScheduledRunsProps = {
  cases: ScheduledExecution[];
  batches: ScheduledBatch[];
  onCancel: (row: ScheduledRunRow) => void;
};

function when(row: ScheduledRunRow) {
  return row.item.scheduledFor ? new Date(row.item.scheduledFor).getTime() : Number.MAX_SAFE_INTEGER;
}

function describe(row: ScheduledRunRow): { icon: typeof FileText; type: string; name: string; href?: string } {
  if (row.kind === "case") {
    const { projectId, testCaseId, testCaseCode } = row.item;
    return {
      icon: FileText,
      type: "Test case",
      name: testCaseCode || "Test case",
      href: projectId && testCaseId ? `/projects/${projectId}/test-cases/${testCaseId}` : undefined,
    };
  }
  const item = row.item;
  if (item.batchType === "suite") {
    return {
      icon: Layers,
      type: "Suite",
      name: item.suiteName || "Suite",
      href: item.suiteId ? `/projects/${item.projectId}/suites/${item.suiteId}` : undefined,
    };
  }
  const category = item.suiteCategory ? SUITE_CATEGORY_LABELS[item.suiteCategory as SuiteCategory] : null;
  return {
    icon: FolderKanban,
    type: "Project",
    name: `${item.projectName || "Project"}${category ? ` · ${category}` : ""}`,
    href: `/projects/${item.projectId}`,
  };
}

/** Every upcoming run (test cases, suites, projects), soonest first. */
export function ScheduledRuns({ cases, batches, onCancel }: ScheduledRunsProps) {
  const rows: ScheduledRunRow[] = [
    ...cases.map((item) => ({ kind: "case" as const, item })),
    ...batches.map((item) => ({ kind: "batch" as const, item })),
  ].sort((a, b) => when(a) - when(b));
  const paged = usePagedItems(rows, String(rows.length));

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing scheduled"
        description="Use Schedule run… in the Run menu of a test case, suite or project."
      />
    );
  }

  return (
    <div>
    <ul className="divide-y divide-border-subtle overflow-hidden rounded-md border border-border bg-surface">
      {paged.items.map((row) => {
        const { icon: Icon, type, name, href } = describe(row);
        const key = row.kind === "case" ? `case-${row.item.jobId}` : `batch-${row.item.id}`;
        const environment = row.kind === "batch" ? row.item.environmentName : null;
        const by = row.kind === "batch" ? row.item.runBy : null;
        return (
          <li key={key} className="flex items-center gap-3 px-3 py-2 text-[13px]">
            <span className="w-44 shrink-0 tabular-nums text-foreground">
              {row.item.scheduledFor ? formatInTimeZone(row.item.scheduledFor, row.item.timeZone || "UTC") : "—"}
            </span>
            <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-label={type} />
            <span className="min-w-0 flex-1 truncate">
              {href ? (
                <Link to={href} className="font-medium text-foreground hover:underline">
                  {name}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{name}</span>
              )}
              <span className="text-muted-foreground">
                {environment ? <span> · {environment}</span> : null}
                {by ? <span className="text-faint"> · by {by}</span> : null}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onCancel(row)}
              className="h-7 shrink-0 hover:text-destructive"
              aria-label={`Cancel scheduled run of ${name}`}
            >
              <X aria-hidden />
              Cancel
            </Button>
          </li>
        );
      })}
    </ul>
    <ListPagination
      page={paged.page}
      pageCount={paged.pageCount}
      total={paged.total}
      pageSize={paged.pageSize}
      onPageChange={paged.setPage}
    />
    </div>
  );
}
