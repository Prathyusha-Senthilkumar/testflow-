"use client";

import { LoadingArea } from "@/components/common/LoadingArea";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FolderKanban, Plus, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/lib/navigation";
import { api, type ProjectInput, type ProjectSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";

function passRateVariant(project: ProjectSummary) {
  if (project.passRate === 100) return "success" as const;
  if (project.failed > 0) return "error" as const;
  return "default" as const;
}

type ProjectSort = "recent" | "name" | "passRate" | "failing";

const SORT_OPTIONS: { value: ProjectSort; label: string }[] = [
  { value: "recent", label: "Recently run" },
  { value: "name", label: "Name" },
  { value: "passRate", label: "Pass rate" },
  { value: "failing", label: "Most failing" },
];

function lastRunTime(project: ProjectSummary): number {
  const time = project.lastRun ? new Date(project.lastRun).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function sortProjects(items: ProjectSummary[], sort: ProjectSort): ProjectSummary[] {
  const sorted = [...items];
  if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "passRate") sorted.sort((a, b) => b.passRate - a.passRate || a.name.localeCompare(b.name));
  else if (sort === "failing") sorted.sort((a, b) => b.failed - a.failed || lastRunTime(b) - lastRunTime(a));
  else sorted.sort((a, b) => lastRunTime(b) - lastRunTime(a));
  return sorted;
}

function matchesProject(project: ProjectSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [project.name, project.baseUrl, project.description].some((field) => field?.toLowerCase().includes(needle));
}

/** Whole card is the link (stretched title link); the external base URL link sits above it. */
function ProjectTile({ project }: { project: ProjectSummary }) {
  return (
    <Card interactive className="group flex min-h-44 flex-col p-4">
      <div className="flex items-start justify-between gap-3 pr-6">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-elevated text-muted-foreground group-hover:text-brand-accent">
          <FolderKanban className="size-4" aria-hidden />
        </span>
        <Badge variant={passRateVariant(project)}>{project.passRate}% passed</Badge>
      </div>
      <h2 className="mt-3 truncate text-sm font-semibold text-foreground" data-card-title>
        <Link
          to={`/projects/${project.id}`}
          aria-label={`Open project ${project.name}`}
          className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          {project.name}
        </Link>
      </h2>
      <a
        className="relative z-10 mt-0.5 flex min-w-0 items-center gap-1 self-start font-mono text-xs text-muted-foreground hover:text-brand-accent hover:underline"
        href={project.baseUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <span className="truncate">{project.baseUrl}</span>
        <ExternalLink className="size-3 shrink-0" aria-hidden />
      </a>
      <p className="mt-2 text-[13px] text-muted-foreground tabular-nums">
        {project.suites} suites · {project.cases} test cases
      </p>
      <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-border-subtle pt-3 text-xs">
        <div>
          <dt className="text-faint">Last run</dt>
          <dd className="mt-0.5 font-medium text-foreground tabular-nums">
            {project.lastRun ? new Date(project.lastRun).toLocaleDateString() : "Not run"}
          </dd>
        </div>
        <div>
          <dt className="text-faint">Run by</dt>
          <dd className="mt-0.5 truncate font-medium text-foreground">{project.lastRunBy ?? "—"}</dd>
        </div>
      </dl>
    </Card>
  );
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const visible = useMemo(
    () => sortProjects(projects.filter((project) => matchesProject(project, search)), sort),
    [projects, search, sort]
  );

  useEffect(() => {
    api.projects().then(setProjects).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  async function createProject(input: ProjectInput) {
    setSaving(true);
    try {
      const created = await api.createProject(input);
      setProjects((current) => [created, ...current]);
      setOpen(false);
      toast.success(`Project “${created.name}” created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        description="Manage the applications and websites being tested."
        actions={
          // When there are no projects the empty state carries the only "New project" CTA.
          !loading && !error && projects.length === 0 ? undefined : (
            <Button onClick={() => setOpen(true)}>
              <Plus /> New project
            </Button>
          )
        }
      />
      {error ? <Alert variant="error" title="Could not load projects">{error}</Alert> : null}
      {loading ? (
        <LoadingArea
          loading
          label="Loading projects…"
          skeleton={
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {[1, 2, 3].map((item) => (
                <div key={item} className="min-h-44 space-y-3 rounded-lg border border-border bg-surface p-4">
                  <Skeleton className="size-8" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          }
        />
      ) : projects.length === 0 && !error ? (
        <EmptyState
          variant="panel"
          icon={FolderKanban}
          title="Create your first testing project"
          description="Add the application URL first. Test suites and test cases will live inside this project."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus /> New project
            </Button>
          }
        />
      ) : (
        <>
          <Toolbar
            sticky
            search={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search projects by name, URL or description…"
                shortcut="/"
                bindShortcut
              />
            }
            filters={
              <Select aria-label="Sort projects" value={sort} onChange={(value) => setSort(value as ProjectSort)} options={SORT_OPTIONS} />
            }
            actions={
              <span className="text-xs text-muted-foreground tabular-nums">
                {visible.length === projects.length ? `${projects.length} projects` : `${visible.length} of ${projects.length}`}
              </span>
            }
          />
          {visible.length === 0 ? (
            <EmptyState
              variant="panel"
              icon={SearchX}
              title={`No projects match “${search.trim()}”`}
              description="Try a different name or URL."
              action={
                <Button variant="outline" onClick={() => { setSearch(""); setSort("recent"); }}>
                  Clear
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visible.map((project) => (
                <ProjectTile key={project.id} project={project} />
              ))}
            </div>
          )}
        </>
      )}
      <ProjectFormModal
        open={open}
        title="Create project"
        submitLabel="Create project"
        loading={saving}
        onClose={() => setOpen(false)}
        onSubmit={createProject}
      />
    </PageContainer>
  );
}

export default ProjectsPage;
