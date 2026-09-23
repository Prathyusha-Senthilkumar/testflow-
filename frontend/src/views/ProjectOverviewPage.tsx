"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Play, Plus, Settings2, Sparkles } from "lucide-react";
import { Link, useParams } from "@/lib/navigation";
import { api, type BatchExecutionStatus, type ProjectDetail, type ProjectInput } from "@/lib/api";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { RunProgressModal, type RunFact } from "@/components/runs/RunProgressModal";

function batchProgress(run: BatchExecutionStatus): string {
  const done = run.passed + run.failed + run.skipped;
  if (!run.finished) {
    return `Running... ${done} / ${run.total} completed`;
  }
  return `${run.total} total · ${run.passed} passed · ${run.failed} failed · ${run.skipped} skipped`;
}

export function ProjectOverviewPage() {
  const { id } = useParams();
  const projectId = id ?? "";
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState("");
  const [projectRun, setProjectRun] = useState<BatchExecutionStatus | null>(null);
  const [suiteRuns, setSuiteRuns] = useState<Record<string, BatchExecutionStatus>>({});
  const [startingProject, setStartingProject] = useState(false);
  const [startingSuiteId, setStartingSuiteId] = useState<string | null>(null);
  const [runDialog, setRunDialog] = useState<{ kind: "project" } | { kind: "suite"; suiteId: string } | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api.project(projectId).then(setProject).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, [projectId]);

  const projectActive = Boolean(projectRun && !projectRun.finished);
  const activeSuiteIds = Object.values(suiteRuns)
    .filter((run) => !run.finished)
    .map((run) => run.batchId)
    .join(",");

  useEffect(() => {
    if (!projectActive && !activeSuiteIds) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (projectRun && !projectRun.finished) {
        api.getBatchRun(projectRun.batchId).then((next) => {
          if (cancelled) return;
          setProjectRun(next);
          if (next.finished && projectId) {
            api.project(projectId).then(setProject).catch(() => undefined);
          }
        }).catch((err: Error) => {
          if (!cancelled) setError(err.message);
        });
      }
      for (const run of Object.values(suiteRuns)) {
        if (run.finished) continue;
        api.getBatchRun(run.batchId).then((next) => {
          if (cancelled || !next.suiteId) return;
          setSuiteRuns((current) => ({ ...current, [next.suiteId as string]: next }));
          if (next.finished && projectId) {
            api.project(projectId).then(setProject).catch(() => undefined);
          }
        }).catch((err: Error) => {
          if (!cancelled) setError(err.message);
        });
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectActive, activeSuiteIds, projectRun, suiteRuns, projectId]);

  async function runProject() {
    if (!projectId || projectActive || startingProject) return;
    setStartingProject(true);
    setRunDialog({ kind: "project" });
    setError("");
    try {
      setProjectRun(await api.startProjectRun(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the project run");
    } finally {
      setStartingProject(false);
    }
  }

  async function runSuite(suiteId: string) {
    if (!projectId || startingSuiteId) return;
    const current = suiteRuns[suiteId];
    if (current && !current.finished) return;
    setStartingSuiteId(suiteId);
    setRunDialog({ kind: "suite", suiteId });
    setError("");
    try {
      const started = await api.startSuiteRun(projectId, suiteId);
      setSuiteRuns((existing) => ({ ...existing, [suiteId]: started }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the suite run");
    } finally {
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

  const dialogRun =
    runDialog?.kind === "project"
      ? projectRun
      : runDialog?.kind === "suite"
        ? suiteRuns[runDialog.suiteId] ?? null
        : null;
  const dialogSuite =
    runDialog?.kind === "suite"
      ? project.suitesList.find((suite) => suite.id === runDialog.suiteId)
      : undefined;
  const dialogRunning = Boolean(
    runDialog &&
      (dialogRun ? !dialogRun.finished : runDialog.kind === "project" ? startingProject : startingSuiteId === runDialog.suiteId)
  );
  const dialogStatus = dialogRun
    ? batchProgress(dialogRun)
    : dialogRunning
      ? "Starting the run..."
      : "Could not start the run";
  const dialogFacts: RunFact[] = dialogRun
    ? [
        { label: "Total", value: String(dialogRun.total) },
        { label: "Passed", value: String(dialogRun.passed) },
        { label: "Failed", value: String(dialogRun.failed) },
        { label: "Skipped", value: String(dialogRun.skipped) },
      ]
    : [
        {
          label: "Test cases",
          value: String(runDialog?.kind === "project" ? project.cases : dialogSuite?.cases ?? 0),
        },
      ];
  const dialogCases = (dialogRun?.cases ?? []).map((item) => ({
    id: item.testCaseId,
    code: item.testCaseCode,
    name: item.name,
    outcome: item.outcome,
    reason: item.reason,
  }));

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
              onClick={runProject}
              disabled={projectActive || startingProject || project.cases === 0}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={15} className="mr-1 inline" />
              {projectActive || startingProject ? "Running project..." : "Run Project"}
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
      {projectRun && (
        <p className={`mt-3 text-sm ${projectRun.finished ? "text-slate-700" : "text-indigo-700"}`}>
          {projectRun.finished ? "Project run finished. " : "Running project. "}
          {batchProgress(projectRun)}
        </p>
      )}

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
                <h3 className="font-semibold">{suite.name}</h3>
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
              {suiteRuns[suite.id] && (
                <p className={`mr-auto text-xs ${suiteRuns[suite.id].finished ? "text-slate-600" : "text-indigo-700"}`}>
                  {batchProgress(suiteRuns[suite.id])}
                </p>
              )}
              <Link to={`/projects/${project.id}/suites/${suite.id}`} className="rounded-lg border px-3 py-1.5 text-sm">Open Suite</Link>
              <button
                type="button"
                onClick={() => runSuite(suite.id)}
                disabled={
                  startingSuiteId === suite.id ||
                  Boolean(suiteRuns[suite.id] && !suiteRuns[suite.id].finished)
                }
                className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play size={13} className="mr-1 inline" />
                {suiteRuns[suite.id] && !suiteRuns[suite.id].finished ? "Running..." : "Run Suite"}
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

      <RunProgressModal
        open={runDialog !== null}
        title={
          runDialog?.kind === "project"
            ? "Project run"
            : "Suite run"
        }
        description={
          runDialog?.kind === "suite"
            ? project.suitesList.find((suite) => suite.id === runDialog.suiteId)?.name
            : project.name
        }
        running={dialogRunning}
        statusLabel={dialogStatus}
        facts={dialogFacts}
        cases={dialogCases}
        error={runDialog && error ? error : undefined}
        onClose={() => setRunDialog(null)}
      />

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

export default ProjectOverviewPage;
