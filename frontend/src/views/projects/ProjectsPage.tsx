import { useEffect, useState } from "react";
import { ExternalLink, FolderKanban, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { api, type ProjectInput, type ProjectSummary } from "@/lib/api";

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");

  async function loadProjects() {
    setLoading(true);
    setError("");
    try {
      setProjects(await api.projects());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProjects(); }, []);

  async function createProject(input: ProjectInput) {
    setSaving(true);
    setError("");
    try {
      const created = await api.createProject(input);
      setProjects((current) => [created, ...current]);
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-indigo-600">Test management</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Projects</h1>
          <p className="mt-2 text-sm text-slate-500">Each project represents one application or website under test.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}><Plus size={17} /> New Project</Button>
      </div>

      {error && <div className="mt-6 rounded-lg-lg-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="mt-7 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => <Card key={item} className="h-52 animate-pulse bg-white p-6"><div className="h-5 w-40 rounded bg-slate-100" /><div className="mt-4 h-4 w-64 rounded bg-slate-100" /></Card>)}
        </div>
      ) : projects.length === 0 ? (
        <Card className="mt-7 px-6 py-14 text-center">
          <FolderKanban className="mx-auto text-slate-300" size={40} />
          <h2 className="mt-4 text-lg font-semibold">Create your first testing project</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Add the application URL first. Test suites and test cases will live inside this project.</p>
          <Button className="mt-5" onClick={() => setModalOpen(true)}><Plus size={17} /> New Project</Button>
        </Card>
      ) : (
        <div className="mt-7 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="flex min-h-56 flex-col p-6">
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><FolderKanban size={19} /></span>
                <Badge status={project.passRate === 100 ? "Passed" : project.failed > 0 ? "Failed" : ""}>{project.passRate}% pass</Badge>
              </div>
              <h2 className="mt-5 text-lg font-semibold text-slate-900">{project.name}</h2>
              <a className="mt-1 flex items-center gap-1 truncate text-sm text-indigo-600 hover:underline" href={project.baseUrl} target="_blank" rel="noreferrer">{project.baseUrl}<ExternalLink size={13} /></a>
              <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-slate-400">Suites</p><p className="mt-1 font-semibold">{project.suites}</p></div>
                <div><p className="text-xs text-slate-400">Cases</p><p className="mt-1 font-semibold">{project.cases}</p></div>
                <div><p className="text-xs text-slate-400">Failed</p><p className="mt-1 font-semibold">{project.failed}</p></div>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-400">{project.lastRun ? `Last run ${new Date(project.lastRun).toLocaleDateString()}` : "Not run yet"}</p>
                <Link to={`/projects/${project.id}`} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">Open Project →</Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ProjectFormModal
        open={modalOpen}
        title="Create Project"
        submitLabel="Create Project"
        loading={saving}
        onClose={() => setModalOpen(false)}
        onSubmit={createProject}
      />
    </div>
  );
}

export default ProjectsPage;
