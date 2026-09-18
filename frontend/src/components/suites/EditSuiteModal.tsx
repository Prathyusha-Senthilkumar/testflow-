import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { TestSuiteSummary } from "@/lib/api";

type Props = {
  open: boolean;
  suite: TestSuiteSummary | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (value: { name: string; description?: string }) => Promise<void> | void;
};

export function EditSuiteModal({ open, suite, loading = false, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && suite) {
      setName(suite.name);
      setDescription(suite.description ?? "");
      setError("");
    }
  }, [open, suite]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Suite name is required.");
      return;
    }
    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
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
