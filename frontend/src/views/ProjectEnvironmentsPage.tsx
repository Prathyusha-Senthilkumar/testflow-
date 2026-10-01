"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Link, useParams } from "@/lib/navigation";
import { api, type EnvironmentInput, type EnvironmentSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const emptyForm: EnvironmentInput = { name: "", baseUrl: "" };

export function ProjectEnvironmentsPage() {
  const { id: projectId = "" } = useParams();
  const [projectName, setProjectName] = useState("Project");
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnvironmentSummary | null>(null);
  const [form, setForm] = useState<EnvironmentInput>(emptyForm);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([api.project(projectId), api.environments(projectId)])
      .then(([project, envs]) => {
        setProjectName(project.name);
        setEnvironments(envs);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
    setError("");
  }

  function openEdit(env: EnvironmentSummary) {
    setEditing(env);
    setForm({ name: env.name, baseUrl: env.baseUrl });
    setFormOpen(true);
    setError("");
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setError("");
    try {
      if (editing) {
        const updated = await api.updateEnvironment(projectId, editing.id, form);
        setEnvironments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await api.createEnvironment(projectId, form);
        setEnvironments((current) => [...current, created]);
      }
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save environment");
    } finally {
      setSaving(false);
    }
  }

  async function removeEnvironment(environmentId: string) {
    if (!projectId) return;
    setError("");
    try {
      await api.deleteEnvironment(projectId, environmentId);
      setEnvironments((current) => current.filter((item) => item.id !== environmentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete environment");
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            <Link to="/projects" className="text-indigo-600 hover:underline">Projects</Link>
            <span className="mx-1">/</span>
            <Link to={`/projects/${projectId}`} className="text-indigo-600 hover:underline">{projectName}</Link>
            <span className="mx-1">/</span>
            Environments
          </p>
          <h1 className="mt-2 text-3xl font-bold">Environment Configuration</h1>
          <p className="mt-1 text-sm text-slate-500">Manage base URLs used when resolving test case start paths.</p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus size={16} className="mr-1 inline" />
          Add Environment
        </Button>
      </div>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mt-6 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">ENVIRONMENTS</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading environments...</p>
        ) : environments.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No environments configured.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {environments.map((env) => (
              <li key={env.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 px-4 py-3">
                <div>
                  <p className="font-medium">{env.name}</p>
                  <p className="font-mono text-xs text-slate-600">{env.baseUrl}</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => openEdit(env)}>Edit</Button>
                  {env.id !== "env-default" && (
                    <Button type="button" variant="outline" size="sm" onClick={() => removeEnvironment(env.id)}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit Environment" : "Add Environment"}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" form="environment-form" loading={saving} disabled={saving}>
              {editing ? "Save" : "Add"}
            </Button>
          </>
        }
      >
        <form id="environment-form" onSubmit={submitForm} className="space-y-4">
          <Input
            label="Environment name"
            required
            value={form.name}
            onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
          />
          <Input
            label="Base URL"
            required
            value={form.baseUrl}
            onChange={(e) => setForm((c) => ({ ...c, baseUrl: e.target.value }))}
          />
        </form>
      </Modal>
    </div>
  );
}

export default ProjectEnvironmentsPage;
