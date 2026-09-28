import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  api,
  TEST_CASE_CATEGORIES,
  TEST_CASE_SCENARIOS,
  type EnvironmentSummary,
  type TestCaseInput,
} from "@/lib/api";
import { CategoryMultiSelect, EnvironmentMultiSelect } from "@/components/suites/CategoryMultiSelect";
import type { SuiteCategory } from "@/lib/suiteCategory";

type Props = {
  open: boolean;
  projectId?: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (value: TestCaseInput) => Promise<void> | void;
};

const emptyForm: TestCaseInput = {
  name: "",
  description: "",
  category: "Functional",
  categories: [],
  environmentIds: [],
  scenario: "Happy Path",
};

export function TestCaseFormModal({
  open,
  projectId,
  loading = false,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<TestCaseInput>(emptyForm);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !projectId) return;
    api.environments(projectId).then(setEnvironments).catch(() => setEnvironments([]));
  }, [open, projectId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Test case name is required.");
    await onSubmit({
      name: form.name.trim(),
      description: form.description?.trim(),
      category: form.category ?? "Functional",
      categories: form.categories ?? [],
      environmentIds: form.environmentIds ?? [],
      scenario: form.scenario ?? "Happy Path",
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Test Case"
      description="Add a test case to this project. A test ID will be assigned automatically."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="create-test-case-form" loading={loading} disabled={loading}>
            Create Test Case
          </Button>
        </>
      }
    >
      <form id="create-test-case-form" onSubmit={submit} className="space-y-4">
        <Input
          label="Test case name"
          required
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Open Admissions Page"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Type"
            value={form.category ?? "Functional"}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                category: value as TestCaseInput["category"],
              }))
            }
            options={TEST_CASE_CATEGORIES.map((option) => ({ value: option, label: option }))}
          />
          <Select
            label="Scenario"
            value={form.scenario ?? "Happy Path"}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                scenario: value as TestCaseInput["scenario"],
              }))
            }
            options={TEST_CASE_SCENARIOS.map((option) => ({ value: option, label: option }))}
          />
        </div>
        <CategoryMultiSelect
          value={(form.categories ?? []) as SuiteCategory[]}
          onChange={(categories) => setForm((current) => ({ ...current, categories }))}
        />
        <EnvironmentMultiSelect
          environments={environments}
          value={form.environmentIds ?? []}
          onChange={(environmentIds) => setForm((current) => ({ ...current, environmentIds }))}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Description <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            value={form.description ?? ""}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="What should this test verify?"
            rows={4}
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
