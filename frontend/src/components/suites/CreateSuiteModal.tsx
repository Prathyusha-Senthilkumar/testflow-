import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { TestSuiteInput } from "@/lib/api";
import { SUITE_CATEGORIES, SUITE_CATEGORY_LABELS, type SuiteCategory } from "@/lib/suiteCategory";

type Props = {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (value: TestSuiteInput) => Promise<void> | void;
};

const emptyForm: TestSuiteInput = { name: "", description: "", category: "" };

export function CreateSuiteModal({ open, loading = false, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<TestSuiteInput>(emptyForm);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setError("");
    }
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("Suite name is required.");
      return;
    }
    if (!form.category) {
      setError("Choose a category.");
      return;
    }
    await onSubmit({
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      category: form.category,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Test Suite"
      description="Group related test cases for this project."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="create-suite-form" loading={loading} disabled={loading}>
            Create Suite
          </Button>
        </>
      }
    >
      <form id="create-suite-form" onSubmit={submit} className="space-y-4">
        <Input
          label="Suite name"
          required
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Admissions Regression"
        />
        <label className="block text-sm font-medium text-slate-700">
          Category
          <select
            required
            className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            value={form.category ?? ""}
            onChange={(event) =>
              setForm((current) => ({ ...current, category: event.target.value as SuiteCategory | "" }))
            }
          >
            <option value="">Select Category</option>
            {SUITE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {SUITE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Description"
          value={form.description ?? ""}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          placeholder="Optional summary"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Modal>
  );
}
