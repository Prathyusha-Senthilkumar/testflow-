"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FolderKanban, Plus } from "lucide-react";
import { Link } from "@/lib/navigation";
import { api, type ProjectInput, type ProjectSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.projects().then(setProjects).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  async function createProject(input: ProjectInput) {
    setSaving(true);
    setError("");
    try {
      const created = await api.createProject(input);
      setProjects(current => [created, ...current]);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">Projects</h1><p className="mt-1 text-sm text-slate-500">Manage the applications and websites being tested.</p></div><Button onClick={() => setOpen(true)}><Plus size={16} /> New Project</Button></div>
      {error && <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Could not load projects: {error}</div>}
      {loading ? <div className="mt-7 grid gap-4 lg:grid-cols-3">{[1, 2, 3].map(item => <Card key={item} className="h-56 animate-pulse bg-white p-5" />)}</div> : projects.length === 0 ? <Card className="mt-7 px-6 py-14 text-center"><FolderKanban className="mx-auto text-slate-300" size={40} /><h2 className="mt-4 text-lg font-semibold">Create your first testing project</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Add the application URL first. Test suites and test cases will live inside this project.</p><Button className="mt-5" onClick={() => setOpen(true)}><Plus size={17} /> New Project</Button></Card> : <div className="mt-7 grid gap-4 lg:grid-cols-3">{projects.map(project => <Card key={project.id} className="flex min-h-56 flex-col p-5"><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><FolderKanban size={20} /></span><Badge status={project.passRate === 100 ? "Passed" : project.failed > 0 ? "Failed" : ""}>{project.passRate}% Passed</Badge></div><h2 className="mt-4 text-lg font-semibold">{project.name}</h2><a className="mt-1 flex items-center gap-1 truncate text-sm text-indigo-600 hover:underline" href={project.baseUrl} target="_blank" rel="noreferrer">{project.baseUrl}<ExternalLink size={13} /></a><p className="mt-2 text-sm text-slate-500">{project.suites} suites · {project.cases} test cases</p><div className="mt-auto grid grid-cols-2 gap-3 border-t pt-3 text-xs"><div><span className="text-slate-400">Last run</span><div className="mt-1 font-medium">{project.lastRun ? new Date(project.lastRun).toLocaleDateString() : "Not run"}</div></div><div><span className="text-slate-400">Run by</span><div className="mt-1 font-medium">{project.lastRunBy ?? "-"}</div></div></div><Link to={`/projects/${project.id}`} className="mt-4 block rounded-lg bg-indigo-600 py-2 text-center text-sm font-medium text-white">Open Project</Link></Card>)}</div>}
      <ProjectFormModal open={open} title="Create Project" submitLabel="Create Project" loading={saving} onClose={() => setOpen(false)} onSubmit={createProject} />
    </div>
  );
}

export default ProjectsPage;
