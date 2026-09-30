import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { TestSuiteInput } from "@/lib/api";
import { CategoryMultiSelect } from "@/components/suites/CategoryMultiSelect";
import { type SuiteCategory } from "@/lib/suiteCategory";

type Props = {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (value: TestSuiteInput) => Promise<void> | void;
};

const emptyForm: TestSuiteInput = { name: "", description: "", categories: [] };

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
    if (!form.categories?.length) {
      setError("Choose at least one category.");
      return;
    }
    await onSubmit({
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      category: form.categories[0],
      categories: form.categories,
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
        <CategoryMultiSelect
          value={(form.categories ?? []) as SuiteCategory[]}
          onChange={(categories) => setForm((current) => ({ ...current, categories }))}
        />
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
