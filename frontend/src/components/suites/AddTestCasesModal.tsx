import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { TestCaseSummary } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { controlClasses } from "@/components/ui/input";

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
            Add selected <span className="tabular-nums">({selected.length})</span>
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search test cases…"
            aria-label="Search test cases"
            className={cn(controlClasses, "pl-8")}
          />
        </div>
        <div className="max-h-72 overflow-auto rounded-md border border-border">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-surface text-xs text-muted-foreground shadow-[inset_0_-1px_0_var(--color-border)]">
              <tr>
                <th className="w-10 px-3 py-2">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-3 py-2 text-left font-medium">Test case</th>
                <th className="px-3 py-2 text-left font-medium">Classification</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                    {query ? `No test cases match “${query}”.` : "This project has no test cases yet."}
                  </td>
                </tr>
              ) : (
                rows.map((testCase) => {
                  const disabled = alreadyInSuite.has(testCase.id);
                  const checked = disabled || selected.includes(testCase.id);
                  const checkboxId = `add-case-${testCase.id}`;
                  return (
                    <tr
                      key={testCase.id}
                      className={cn(
                        "border-t border-border-subtle transition-colors duration-150",
                        disabled ? "text-muted-foreground" : "hover:bg-elevated/60",
                        checked && !disabled && "bg-accent/60"
                      )}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          id={checkboxId}
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={() => toggle(testCase.id, disabled)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <label htmlFor={checkboxId} className={cn("flex items-center gap-2", !disabled && "cursor-pointer")}>
                          <span className="rounded-sm bg-elevated px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            {testCase.code}
                          </span>
                          <span className="truncate">{testCase.name}</span>
                          {disabled ? <span className="shrink-0 text-xs text-faint">Already in suite</span> : null}
                        </label>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {testCase.category ?? "Functional"} · {testCase.scenario ?? "Happy Path"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
