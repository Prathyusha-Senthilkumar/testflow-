import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Modal } from "@/components/ui/modal";

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



  async function submit(event: React.FormEvent) {

    event.preventDefault();

    setError("");

    if (!form.name.trim()) return setError("Project name is required.");

    if (!form.baseUrl.trim()) return setError("Base URL is required.");

    try {

      const url = new URL(form.baseUrl.trim());

      if (!["http:", "https:"].includes(url.protocol)) throw new Error();

      if (!url.hostname) throw new Error();

    } catch {

      return setError("Enter a valid Base URL including http:// or https://.");

    }

    await onSubmit({

      name: form.name.trim(),

      baseUrl: form.baseUrl.trim(),

      description: form.description?.trim(),

    });

  }



  return (

    <Modal

      open={open}

      onClose={onClose}

      title={title}

      description="Define the application that your QA team will test."

      footer={

        <>

          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>

          <Button type="submit" form="project-form" loading={loading} disabled={loading}>

            {submitLabel}

          </Button>

        </>

      }

    >

      <form id="project-form" onSubmit={submit} className="space-y-4">

        <Input

          label="Project name"

          required

          value={form.name}

          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}

          placeholder="SRM Student Portal"

        />

        <div>

          <label className="mb-1.5 block text-sm font-medium">

            Description <span className="font-normal text-slate-400">(optional)</span>

          </label>

          <textarea

            value={form.description ?? ""}

            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}

            placeholder="Testing SRM student portal functionality"

            rows={3}

            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"

          />

        </div>

        <Input

          label="Base URL"

          required

          value={form.baseUrl}

          onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}

          placeholder="https://www.srmist.edu.in"

        />

        {error && <p className="text-sm text-red-600">{error}</p>}

      </form>

    </Modal>

  );

}


