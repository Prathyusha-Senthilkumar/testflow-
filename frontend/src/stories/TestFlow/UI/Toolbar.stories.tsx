import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Toolbar } from "@/components/ui/toolbar";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Attest/UI/Toolbar",
  component: Toolbar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

function ListToolbar({ sticky = false }: { sticky?: boolean }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const active = Boolean(search || type || status);
  return (
    <Toolbar
      sticky={sticky}
      search={<SearchInput value={search} onChange={setSearch} placeholder="Search by name, code, or status…" shortcut="/" />}
      filters={
        <>
          <Select aria-label="Run type" value={type} onChange={setType} options={[{ value: "", label: "All runs" }, { value: "suite", label: "Suite" }, { value: "project", label: "Project" }, { value: "individual", label: "Individual" }]} />
          <Select aria-label="Status" value={status} onChange={setStatus} placeholder="Status" options={[{ value: "passed", label: "Passed" }, { value: "failed", label: "Failed" }, { value: "running", label: "Running" }]} />
          {active ? (
            <Button variant="ghost" onClick={() => { setSearch(""); setType(""); setStatus(""); }}>
              Reset filters
            </Button>
          ) : null}
        </>
      }
      actions={<Button><Plus /> New test case</Button>}
    />
  );
}

export const Default: Story = { render: () => <ListToolbar /> };
export const SearchOnly: Story = {
  render: function Render() {
    const [value, setValue] = useState("");
    return <Toolbar search={<SearchInput value={value} onChange={setValue} />} />;
  },
};
/** Sticks to the top of the scrolling canvas while the list scrolls. */
export const Sticky: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div className="h-[420px] overflow-y-auto bg-background p-6">
      <ListToolbar sticky />
      <div className="mt-3 space-y-2">
        {Array.from({ length: 30 }, (_, index) => (
          <div key={index} className="rounded-md border border-border bg-surface px-3 py-2 text-[13px]">Row {index + 1}</div>
        ))}
      </div>
    </div>
  ),
};
