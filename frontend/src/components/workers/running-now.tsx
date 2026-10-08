"use client";

import { useMemo } from "react";
import { ArrowUpRight, Cpu } from "lucide-react";
import type { WorkerInfo } from "@/lib/api";
import { Link } from "@/lib/navigation";
import { runningSlots, shortId, slotRunHref, slotTitle, type RunningSlot } from "@/lib/workers";
import { DataTable, createDataTableColumns, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/common/EmptyState";
import { Elapsed } from "@/components/workers/elapsed";

const helper = createDataTableColumns<RunningSlot>();

function buildColumns(projectNames: Record<string, string>): DataTableColumn<RunningSlot>[] {
  return [
    helper.accessor((row) => slotTitle(row), {
      id: "test",
      header: "Test",
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    }),
    helper.accessor((row) => (row.projectId ? (projectNames[row.projectId] ?? shortId(row.projectId)) : ""), {
      id: "project",
      header: "Project",
      cell: (info) => <span className="text-muted-foreground">{info.getValue() || "—"}</span>,
    }),
    helper.accessor("hostname", { header: "Runner", cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span> }),
    helper.accessor("index", { header: "Slot", cell: (info) => <span className="tabular-nums">#{info.getValue() + 1}</span>, meta: { align: "right" } }),
    helper.accessor((row) => row.startedAt ?? "", {
      id: "elapsed",
      header: "Elapsed",
      sortFn: "datetime",
      cell: (info) => <Elapsed startedAt={info.row.original.startedAt} />,
      meta: { align: "right" },
    }),
    helper.display({
      id: "link",
      header: () => <span className="sr-only">Open</span>,
      cell: (info) => {
        const href = slotRunHref(info.row.original);
        return href ? (
          <Link to={href} className="inline-flex items-center gap-1 text-[13px] text-brand-accent hover:text-foreground hover:underline">
            {info.row.original.runId ? "Live run" : "Test case"} <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        ) : null;
      },
      meta: { align: "right" },
    }),
  ];
}

/** Every running slot across all workers. */
export function RunningNowTable({ workers, projectNames, loading = false }: { workers: WorkerInfo[]; projectNames: Record<string, string>; loading?: boolean }) {
  const rows = useMemo(() => runningSlots(workers), [workers]);
  const columns = useMemo(() => buildColumns(projectNames), [projectNames]);
  return (
    <DataTable
      columns={columns}
      data={rows}
      loading={loading}
      skeletonRows={3}
      getRowId={(row) => `${row.workerId}:${row.index}`}
      empty={<EmptyState icon={Cpu} title="Nothing running" description="All slots are idle." size="sm" />}
    />
  );
}
