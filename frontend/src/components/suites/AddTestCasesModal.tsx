import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { TestCaseSummary } from "@/lib/api";

type Props = {
  open: boolean;
  loading?: boolean;
  testCases: TestCaseSummary[];
  alreadyInSuite: Set<string>;
  onClose: () => void;
  onSubmit: (testCaseIds: string[]) => Promise<void> | void;
};

export function AddTestCasesModal({
  open,
  loading = false,
  testCases,
  alreadyInSuite,
  onClose,
  onSubmit,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setSelected([]);
      setQuery("");
    }
  }, [open]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return testCases.filter((testCase) => {
      if (!needle) return true;
      return `${testCase.code} ${testCase.name}`.toLowerCase().includes(needle);
    });
  }, [query, testCases]);

  function toggle(id: string, disabled: boolean) {
    if (disabled) return;
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function submit() {
    if (selected.length === 0) return;
    await onSubmit(selected);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Test Cases"
      description="Select cases from this project to add to the suite."
      panelClassName="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} loading={loading} disabled={loading || selected.length === 0}>
            Add Selected ({selected.length})
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search test cases…"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-10 p-3" />
                <th className="p-3 text-left">Test case</th>
                <th className="p-3 text-left">Classification</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((testCase) => {
                const disabled = alreadyInSuite.has(testCase.id);
                const checked = disabled || selected.includes(testCase.id);
                return (
                  <tr key={testCase.id} className="border-t">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(testCase.id, disabled)}
                      />
                    </td>
                    <td className="p-3">
                      <span className="mr-2 rounded-lg bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                        {testCase.code}
                      </span>
                      {testCase.name}
                      {disabled ? (
                        <span className="ml-2 text-xs text-slate-400">(already in suite)</span>
                      ) : null}
                    </td>
                    <td className="p-3 text-xs text-slate-500">
                      {testCase.category ?? "Functional"} · {testCase.scenario ?? "Happy Path"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
