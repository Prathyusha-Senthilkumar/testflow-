import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useMemo, useState } from "react";
import { fn } from "storybook/test";
import { FileCheck2 } from "lucide-react";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type Row = { id: string; code: string; name: string; status: string; duration: number; lastRun: string };

const rows: Row[] = Array.from({ length: 24 }, (_, index) => ({
  id: `tc-${index}`,
  code: `TC-${String(index + 1).padStart(3, "0")}`,
  name: ["Open admissions page", "Apply now submits form", "Login with SSO", "Reset password email", "Programs filter"][index % 5],
  status: ["passed", "failed", "running", "queued", "timed_out", "cancelled"][index % 6],
  duration: 800 + ((index * 937) % 6000),
  lastRun: new Date(Date.UTC(2026, 9, 8, 14, 3) - index * 3_600_000).toISOString(),
}));

const helper = createDataTableColumns<Row>();
const columns = [
  helper.accessor("code", { header: "Code", cell: (info) => <span className="font-mono text-xs text-muted-foreground">{info.getValue()}</span> }),
  helper.accessor("name", { header: "Name", cell: (info) => <span className="font-medium">{info.getValue()}</span> }),
  helper.accessor("status", { header: "Status", cell: (info) => <RunStatusBadge status={info.getValue()} /> }),
  helper.accessor("duration", { header: "Duration", cell: (info) => `${(info.getValue() / 1000).toFixed(1)}s`, meta: { align: "right" } }),
  helper.accessor("lastRun", { header: "Last run", sortFn: "datetime", cell: (info) => new Date(info.getValue()).toLocaleString(), meta: { align: "right", className: "text-muted-foreground" } }),
];

const meta = {
  title: "Attest/UI/DataTable",
  component: DataTable<Row>,
  parameters: { layout: "padded" },
  args: { columns, data: rows, onRowClick: fn() },
} satisfies Meta<typeof DataTable<Row>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { searchable: true, searchPlaceholder: "Search test cases…", rowLabel: (row: Row) => `Open ${row.name}` } };
export const Loading: Story = { args: { loading: true, searchable: true } };
export const Empty: Story = {
  args: {
    data: [],
    empty: <EmptyState icon={FileCheck2} title="No test cases yet" description="Record a flow in Chromium to create your first test case." action={<Button>New test case</Button>} />,
  },
};
/** Search with no matches shows the filtered-empty state. */
export const NoMatches: Story = { args: { searchable: true, globalFilter: "zzz" } };
/** A max height gives the table its own scroll box; the header sticks inside it. */
export const StickyHeader: Story = { args: { containerClassName: "max-h-80" } };
export const WithToolbar: Story = {
  render: function Render(args) {
    const [status, setStatus] = useState("");
    const data = useMemo(() => (status ? rows.filter((row) => row.status === status) : rows), [status]);
    return (
      <DataTable
        {...args}
        data={data}
        searchable
        toolbar={<Select aria-label="Status" className="w-44" value={status} onChange={setStatus} options={[{ value: "", label: "All statuses" }, { value: "passed", label: "Passed" }, { value: "failed", label: "Failed" }]} />}
      />
    );
  },
};
