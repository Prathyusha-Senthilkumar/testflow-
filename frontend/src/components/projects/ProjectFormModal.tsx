import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectInput } from "@/lib/api";

type Props = {
  open: boolean;
  title: string;
  submitLabel: string;
  initialValue?: ProjectInput;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (value: ProjectInput) => Promise<void> | void;
};

const emptyProject: ProjectInput = { name: "", baseUrl: "", description: "" };

export function ProjectFormModal({
  open,
  title,
  submitLabel,
  initialValue,
  loading = false,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<ProjectInput>(initialValue ?? emptyProject);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(initialValue ?? emptyProject);
      setError("");
    }
  }, [open, initialValue]);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.name.trim()) return setError("Project name is required.");
    try {
      const url = new URL(form.baseUrl.trim());
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      return setError("Enter a valid application URL including http:// or https://.");
    }
    await onSubmit({
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim(),
      description: form.description?.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 text-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">Define the application that your QA team will test.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Project name</label>
            <Input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="SRM Website Testing"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Application URL</label>
            <Input
              value={form.baseUrl}
              onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder="https://www.example.com/"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Description <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea
              value={form.description ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="What is being tested in this project?"
              rows={4}
              className="w-full resize-none rounded-lg-lg-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Saving..." : submitLabel}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
