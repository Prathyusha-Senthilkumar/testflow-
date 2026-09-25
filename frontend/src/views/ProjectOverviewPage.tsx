"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Play, Plus, Settings2, Sparkles } from "lucide-react";
import { Link, useNavigate, useParams } from "@/lib/navigation";
import { api, type EnvironmentSummary, type ProjectDetail, type ProjectInput } from "@/lib/api";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { SuiteCategoryBadge } from "@/components/suites/SuiteCategoryBadge";
import { Modal } from "@/components/ui/modal";
import { SUITE_CATEGORIES, SUITE_CATEGORY_LABELS, type SuiteCategory } from "@/lib/suiteCategory";

export function ProjectOverviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const projectId = id ?? "";
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState("");
  const [startingProject, setStartingProject] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [suiteCategory, setSuiteCategory] = useState<SuiteCategory>("smoke");
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [suiteDialogId, setSuiteDialogId] = useState<string | null>(null);
  const [startingSuiteId, setStartingSuiteId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api.project(projectId).then(setProject).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
    api.environments(projectId).then(setEnvironments).catch(() => setEnvironments([]));
  }, [projectId]);

  async function runProject() {
    if (!projectId || startingProject || !environmentId) return;
    setStartingProject(true);
    setError("");
    try {
      const started = await api.startProjectRun(projectId, suiteCategory, environmentId);
      setProjectDialogOpen(false);
      navigate(`/runs/batches/${started.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the project run");
      setStartingProject(false);
    }
  }

  async function runSuite() {
    if (!projectId || !suiteDialogId || startingSuiteId || !environmentId) return;
    setStartingSuiteId(suiteDialogId);
    setError("");
    try {
      const started = await api.startSuiteRun(projectId, suiteDialogId, environmentId);
      setSuiteDialogId(null);
      navigate(`/runs/batches/${started.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the suite run");
      setStartingSuiteId(null);
    }
  }

  const editValue = useMemo<ProjectInput | undefined>(
    () =>
      project
        ? {
            name: project.name,
            baseUrl: project.baseUrl,
            description: project.description ?? "",
          }
        : undefined,
    [project]
  );

  async function updateProject(input: ProjectInput) {
    if (!project) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateProject(project.id, input);
      setProject(updated);
      setEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update project");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-slate-500 lg:p-8">Loading project...</div>;
  if (error && !project) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load project: {error}
        </div>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Project not found.</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        eyebrow={
          <>
            <Link to="/projects" className="hover:text-indigo-600">Projects</Link>
            <span className="mx-1">/</span>
            {project.name}
          </>
        }
        title={project.name}
        description={project.description ?? "Automated visual and interaction suites for regression testing"}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
              <Settings2 size={15} className="mr-1 inline" />
              Edit Project
            </Button>
            <Link to={`/projects/${project.id}/environments`} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium">
              Environments
            </Link>
            <Link to={`/projects/${project.id}/auth-profiles`} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium">
              Auth Profiles
            </Link>
            <Link to={`/projects/${project.id}/test-cases`} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium">
              View Test Cases
            </Link>
            <Link to={`/projects/${project.id}/suites`} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium">
              View Test Suites
            </Link>
            <button
              type="button"
              onClick={() => {
                setError("");
                setSuiteCategory("smoke");
                setProjectDialogOpen(true);
              }}
              disabled={startingProject || project.cases === 0}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={15} className="mr-1 inline" />
              {startingProject ? "Starting project..." : "Run Project"}
            </button>
          </>
        }
      />
      <p className="mt-2 text-sm text-slate-500">
        Base URL:{" "}
        <a href={project.baseUrl} target="_blank" rel="noreferrer" className="font-mono text-indigo-600 hover:underline">
          {project.baseUrl}
        </a>
      </p>
      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mt-6 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded bg-indigo-600 text-white">
              <Sparkles size={16} />
            </span>
            <div>
              <span className="font-semibold">Suite suggestions are ready for review</span>
              <span className="ml-2 text-sm text-slate-500">AI-detected coverage gaps can be reviewed before running tests.</span>
            </div>
          </div>
          <Link to={`/projects/${project.id}/suites/review`} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white">
            <Eye size={15} /> Review Suggestions
          </Link>
        </div>
      </div>
      <div className="mt-7 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            Test Suites <span className="rounded-lg bg-slate-200 px-1.5 py-0.5 font-mono text-xs font-normal text-slate-600">{project.suites} configured</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">Automated visual and interaction suites for regression testing.</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/projects/${project.id}/suites/review`} className="rounded-lg border bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700">
            <Sparkles size={15} className="mr-1 inline" /> Review Suggestions
          </Link>
          <Link to={`/projects/${project.id}/suites`} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white">
            <Plus size={15} className="mr-1 inline" /> Create Suite
          </Link>
        </div>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {project.suitesList.map((suite) => (
          <div key={suite.id} className="rounded-lg bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{suite.name}</h3>
                  <SuiteCategoryBadge category={suite.category} />
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500">{suite.cases} Test Cases</p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-teal-700">{suite.passRate}%</div>
                <div className="text-xs text-slate-500">Pass Rate</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-teal-700" style={{ width: `${suite.passRate}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b pb-3 text-xs">
              <div className="flex gap-4">
                <span><b className="text-teal-700">{suite.passed}</b> Passed</span>
                <span><b className="text-red-600">{suite.failed}</b> Failed</span>
                <span><b>{suite.notRun}</b> Not Run</span>
              </div>
              <span className="text-slate-500">
                Last Run: <b className="text-slate-700">{suite.lastRun ? new Date(suite.lastRun).toLocaleString() : "Not run"}</b>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <Link to={`/projects/${project.id}/suites/${suite.id}`} className="rounded-lg border px-3 py-1.5 text-sm">Open Suite</Link>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setSuiteDialogId(suite.id);
                }}
                disabled={startingSuiteId === suite.id}
                className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play size={13} className="mr-1 inline" />
                {startingSuiteId === suite.id ? "Starting..." : "Run Suite"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {project.suitesList.length === 0 && (
        <div className="mt-4 rounded-lg bg-white px-6 py-10 text-center text-sm text-slate-500">
          No suites have been created for this project yet.
        </div>
      )}

      <Modal
        open={projectDialogOpen}
        onClose={() => {
          if (!startingProject) setProjectDialogOpen(false);
        }}
        title="Run Project"
        description={project.name}
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm"
              disabled={startingProject}
              onClick={() => setProjectDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={startingProject || !environmentId}
              onClick={runProject}
            >
              {startingProject ? "Starting..." : "Run Project"}
            </button>
          </>
        }
      >
        <label className="block text-sm font-medium text-slate-700">
          Suite Category
          <select
            className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            value={suiteCategory}
            onChange={(event) => setSuiteCategory(event.target.value as SuiteCategory)}
          >
            {SUITE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {SUITE_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
        <EnvironmentField
          environments={environments}
          value={environmentId}
          onChange={setEnvironmentId}
        />
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </Modal>

      <Modal
        open={suiteDialogId !== null}
        onClose={() => {
          if (!startingSuiteId) setSuiteDialogId(null);
        }}
        title="Run Test Suite"
        description={project.suitesList.find((suite) => suite.id === suiteDialogId)?.name}
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border px-4 py-2 text-sm"
              disabled={startingSuiteId !== null}
              onClick={() => setSuiteDialogId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={startingSuiteId !== null || !environmentId}
              onClick={runSuite}
            >
              {startingSuiteId ? "Starting..." : "Run Suite"}
            </button>
          </>
        }
      >
        <EnvironmentField
          environments={environments}
          value={environmentId}
          onChange={setEnvironmentId}
        />
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </Modal>

      <ProjectFormModal
        open={editOpen}
        title="Edit Project"
        submitLabel="Save Changes"
        initialValue={editValue}
        loading={saving}
        onClose={() => setEditOpen(false)}
        onSubmit={updateProject}
      />
    </div>
  );
}

function EnvironmentField({
  environments,
  value,
  onChange,
}: {
  environments: EnvironmentSummary[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (environments.length === 0) {
    return (
      <p className="mt-3 text-sm text-amber-700">
        No environments are configured for this project. Add an environment before running tests.
      </p>
    );
  }
  return (
    <label className="mt-3 block text-sm font-medium text-slate-700">
      Environment
      <select
        className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select Environment</option>
        {environments.map((environment) => (
          <option key={environment.id} value={environment.id}>
            {environment.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default ProjectOverviewPage;
