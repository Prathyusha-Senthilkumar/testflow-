"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe, Pencil, Plus, SearchX, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "@/lib/navigation";
import { api, type EnvironmentInput, type EnvironmentSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { EmptyState } from "@/components/common/EmptyState";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { usePublishEntityName } from "@/components/layout/shell-context";

const emptyForm: EnvironmentInput = { name: "", baseUrl: "" };
const envColumns = createDataTableColumns<EnvironmentSummary>();
const DEFAULT_ENV_ID = "env-default";

type EnvKindFilter = "" | "default" | "custom";
const KIND_OPTIONS: { value: EnvKindFilter; label: string }[] = [
  { value: "", label: "All environments" },
  { value: "default", label: "Default only" },
  { value: "custom", label: "Custom only" },
];

export function ProjectEnvironmentsPage() {
  const { id: projectId = "" } = useParams();
  const [projectName, setProjectName] = useState("");
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnvironmentSummary | null>(null);
  const [form, setForm] = useState<EnvironmentInput>(emptyForm);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<EnvKindFilter>("");
  const filtering = Boolean(search.trim() || kind);
  const visibleEnvironments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return environments.filter((env) => {
      if (kind === "default" && env.id !== DEFAULT_ENV_ID) return false;
      if (kind === "custom" && env.id === DEFAULT_ENV_ID) return false;
      return !needle || env.name.toLowerCase().includes(needle) || env.baseUrl.toLowerCase().includes(needle);
    });
  }, [environments, search, kind]);
  function clearFilters() {
    setSearch("");
    setKind("");
  }

  usePublishEntityName("project", projectId, projectName);

  useEffect(() => {
    if (!projectId) return;
     
    setLoading(true);
    // The project name is only a label; don't block the environment list on the (slower) project aggregate.
    api
      .project(projectId)
      .then((project) => setProjectName(project.name))
      .catch(() => undefined);
    api
      .environments(projectId)
      .then(setEnvironments)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
    setFormError("");
  }

  function openEdit(env: EnvironmentSummary) {
    setEditing(env);
    setForm({ name: env.name, baseUrl: env.baseUrl });
    setFormOpen(true);
    setFormError("");
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        const updated = await api.updateEnvironment(projectId, editing.id, form);
        setEnvironments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        toast.success(`Environment “${updated.name}” saved`);
      } else {
        const created = await api.createEnvironment(projectId, form);
        setEnvironments((current) => [...current, created]);
        toast.success(`Environment “${created.name}” added`);
      }
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save environment");
    } finally {
      setSaving(false);
    }
  }

  async function removeEnvironment(environmentId: string) {
    if (!projectId) return;
    try {
      await api.deleteEnvironment(projectId, environmentId);
      setEnvironments((current) => current.filter((item) => item.id !== environmentId));
      toast.success("Environment deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete environment");
    }
  }

  const columns = useMemo(
    () => [
      envColumns.accessor("name", {
        header: "Name",
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium text-foreground">
            {row.original.name}
            {row.original.id === DEFAULT_ENV_ID ? <Badge variant="outline">Default</Badge> : null}
          </span>
        ),
      }),
      envColumns.accessor("baseUrl", {
        header: "Base URL",
        cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue<string>()}</span>,
      }),
      envColumns.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { align: "right" },
        cell: ({ row }) => (
          <div className="reveal-on-hover flex justify-end gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${row.original.name}`} onClick={() => openEdit(row.original)}>
              <Pencil />
            </Button>
            {row.original.id !== DEFAULT_ENV_ID ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="hover:text-destructive"
                aria-label={`Delete ${row.original.name}`}
                onClick={() => void removeEnvironment(row.original.id)}
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers only close over projectId
    [projectId]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Environments"
        description="Base URLs that test case start paths resolve against."
        actions={
          // No environments yet: the empty state carries the only "Add environment" CTA.
          !loading && !error && environments.length === 0 ? undefined : (
            <Button onClick={openCreate}>
              <Plus /> Add environment
            </Button>
          )
        }
      />

      {error ? <Alert variant="error" title="Could not load environments">{error}</Alert> : null}

      {!loading && environments.length > 0 ? (
        <Toolbar
          search={
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search environments by name or base URL…"
              shortcut="/"
              bindShortcut
            />
          }
          filters={<Select aria-label="Filter environments" value={kind} onChange={(value) => setKind(value as EnvKindFilter)} options={KIND_OPTIONS} />}
          actions={
            <span className="text-xs text-muted-foreground tabular-nums">
              {filtering ? `${visibleEnvironments.length} of ${environments.length}` : `${environments.length} environments`}
            </span>
          }
        />
      ) : null}

      <DataTable
        columns={columns}
        data={visibleEnvironments}
        getRowId={(env) => env.id}
        loading={loading}
        loadingLabel="Loading environments…"
        skeletonRows={3}
        empty={
          environments.length > 0 ? (
            <EmptyState
              size="sm"
              icon={SearchX}
              title={search.trim() ? `No environments match “${search.trim()}”` : "No environments match this filter"}
              action={
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  Clear
                </Button>
              }
            />
          ) : (
          <EmptyState
            size="sm"
            icon={Globe}
            title="No environments configured"
            description="Add Staging, Production or any base URL your tests should run against."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus /> Add environment
              </Button>
            }
          />
          )
        }
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit environment" : "Add environment"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
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
            placeholder="Staging"
            onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
          />
          <Input
            label="Base URL"
            required
            value={form.baseUrl}
            placeholder="https://staging.example.com"
            className="font-mono text-[13px]"
            onChange={(e) => setForm((c) => ({ ...c, baseUrl: e.target.value }))}
          />
          {formError ? <Alert variant="error">{formError}</Alert> : null}
        </form>
      </Modal>
    </PageContainer>
  );
}

export default ProjectEnvironmentsPage;
