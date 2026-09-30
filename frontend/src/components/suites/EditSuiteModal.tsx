import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { TestSuiteSummary } from "@/lib/api";
import { CategoryMultiSelect } from "@/components/suites/CategoryMultiSelect";
import { SUITE_CATEGORIES, type SuiteCategory } from "@/lib/suiteCategory";

type Props = {
  open: boolean;
  suite: TestSuiteSummary | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (value: { name: string; description?: string; category: SuiteCategory; categories: SuiteCategory[] }) => Promise<void> | void;
};

export function EditSuiteModal({ open, suite, loading = false, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<SuiteCategory[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && suite) {
      setName(suite.name);
      setDescription(suite.description ?? "");
      const loaded = (suite.categories?.length ? suite.categories : suite.category ? [suite.category] : [])
        .filter((item): item is SuiteCategory => SUITE_CATEGORIES.includes(item as SuiteCategory));
      setCategories(loaded);
      setError("");
    }
  }, [open, suite]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Suite name is required.");
      return;
    }
    if (categories.length === 0) {
      setError("Choose at least one category.");
      return;
    }
    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      category: categories[0],
      categories,
    });
  }

  return (
    <Modal
      open={open && Boolean(suite)}
      onClose={onClose}
      title="Edit Test Suite"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="edit-suite-form" loading={loading} disabled={loading}>
            Save
          </Button>
        </>
      }
    >
      <form id="edit-suite-form" onSubmit={submit} className="space-y-4">
        <Input label="Suite name" required value={name} onChange={(event) => setName(event.target.value)} />
        <CategoryMultiSelect value={categories} onChange={setCategories} />
        <Input
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Modal>
  );
}
