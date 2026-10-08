"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Layers,
  MoreHorizontal,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Link, useNavigate, useParams } from "@/lib/navigation";
import { CardArrow } from "@/components/ui/card";
import { api, type EnvironmentSummary, type ProjectDetail, type ProjectInput, type SuiteSummary } from "@/lib/api";
import { SUITE_CATEGORIES, SUITE_CATEGORY_LABELS, type SuiteCategory } from "@/lib/suiteCategory";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/common/EmptyState";
import { Stat, StatGroup } from "@/components/common/Stat";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page-header";
import { usePublishEntityName } from "@/components/layout/shell-context";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { SuiteCategoryBadges } from "@/components/suites/SuiteCategoryBadge";

const suiteColumns = createDataTableColumns<SuiteSummary>();

function PassRateBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-elevated" aria-hidden>
        <div className="h-full rounded-full bg-pass" style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 text-right text-[13px] font-medium tabular-nums">{value}%</span>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <PageContainer>
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-64 w-full" />
    </PageContainer>
  );
}

/** The overview shows a short suite summary; the full list is on the Suites page. */
const OVERVIEW_SUITE_LIMIT = 5;

export function ProjectOverviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const projectId = id ?? "";
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState("");
  const [startingProject, setStartingProject] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [suiteCategory, setSuiteCategory] = useState<"all" | SuiteCategory>("all");
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [suiteDialogId, setSuiteDialogId] = useState<string | null>(null);
  const [startingSuiteId, setStartingSuiteId] = useState<string | null>(null);
  const [cancellingSuite, setCancellingSuite] = useState(false);
  const cancelSuiteStart = useRef(false);

  usePublishEntityName("project", project?.id, project?.name);

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
      const started = await api.startProjectRun(
        projectId,
        suiteCategory === "all" ? undefined : suiteCategory,
        environmentId
      );
      setProjectDialogOpen(false);
      navigate(`/runs/batches/${started.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the project run");
      setStartingProject(false);
    }
  }

  async function runSuite() {
    if (!projectId || !suiteDialogId || startingSuiteId || !environmentId) return;
    const suiteId = suiteDialogId;
    cancelSuiteStart.current = false;
    setCancellingSuite(false);
    setStartingSuiteId(suiteId);
    setError("");
    try {
      const started = await api.startSuiteRun(projectId, suiteId, environmentId);
      if (cancelSuiteStart.current) {
        await api.cancelBatchRun(started.batchId);
      }
      setSuiteDialogId(null);
      navigate(`/runs/batches/${started.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the suite run");
      setStartingSuiteId(null);
      setCancellingSuite(false);
    }
  }

  function cancelSuiteDialog() {
    if (startingSuiteId) {
      cancelSuiteStart.current = true;
      setCancellingSuite(true);
      return;
    }
    setSuiteDialogId(null);
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
    try {
      const updated = await api.updateProject(project.id, input);
      setProject(updated);
      setEditOpen(false);
      toast.success("Project updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update project");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject() {
    if (!project) return;
    const target = project;
    const deleted = await confirm({
      title: "Delete project?",
      tone: "danger",
      confirmLabel: "Delete project",
      requireText: target.name,
      description: (
        <>
          <p>
            <strong>{target.name}</strong> will be permanently deleted, including:
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>its test suites and test cases</li>
            <li>all run history, screenshots and reports</li>
            <li>its environments and saved login sessions</li>
          </ul>
        </>
      ),
      onConfirm: () => api.deleteProject(target.id),
    });
    if (!deleted) return;
    toast.success("Project deleted");
    navigate("/projects");
  }

  const columns = useMemo(
    () => [
      suiteColumns.accessor("name", {
        header: "Suite",
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-medium text-foreground">{row.original.name}</span>
            <SuiteCategoryBadges categories={row.original.categories} category={row.original.category} />
          </div>
        ),
        meta: { className: "max-w-[28rem]" },
      }),
      suiteColumns.accessor("cases", { header: "Cases", meta: { align: "right" } }),
      suiteColumns.accessor("passRate", {
        header: "Pass rate",
        cell: ({ getValue }) => <PassRateBar value={getValue<number>()} />,
      }),
      suiteColumns.display({
        id: "outcomes",
        header: "Passed / Failed / Not run",
        cell: ({ row }) => (
          <span className="text-[13px] tabular-nums">
            <span className="text-pass">{row.original.passed}</span>
            <span className="text-faint"> / </span>
            <span className={row.original.failed > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>{row.original.failed}</span>
            <span className="text-faint"> / </span>
            <span className="text-muted-foreground">{row.original.notRun}</span>
          </span>
        ),
      }),
      suiteColumns.accessor("lastRun", {
        header: "Last run",
        sortFn: "datetime",
        cell: ({ row }) => (
          <div className="text-[13px] text-muted-foreground">
            <div className="tabular-nums">{row.original.lastRun ? new Date(row.original.lastRun).toLocaleString() : "Not run"}</div>
            {row.original.lastRunBy ? <div className="text-xs text-faint">by {row.original.lastRunBy}</div> : null}
          </div>
        ),
      }),
      suiteColumns.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              setError("");
              setSuiteDialogId(row.original.id);
            }}
            disabled={startingSuiteId === row.original.id}
          >
            <Play /> {startingSuiteId === row.original.id ? "Starting…" : "Run suite"}
          </Button>
        ),
        meta: { align: "right" },
      }),
    ],
    [startingSuiteId]
  );

  if (loading) return <OverviewSkeleton />;
  if (!project) {
    return (
      <PageContainer>
        <Alert variant="error" title={error ? "Could not load project" : "Project not found"}>
          {error || "This project may have been deleted."}
        </Alert>
      </PageContainer>
    );
  }

  const dialogOpen = projectDialogOpen || suiteDialogId !== null;

  const topSuites = project.suitesList.slice(0, OVERVIEW_SUITE_LIMIT);

  return (
    <PageContainer>
      <PageHeader
        title={project.name}
        description={project.description || undefined}
        meta={
          <a
            href={project.baseUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-brand-accent hover:underline"
          >
            {project.baseUrl}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        }
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More project actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Settings2 /> Edit project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void deleteProject()}>
                  <Trash2 /> Delete project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={() => {
                setError("");
                setSuiteCategory("smoke");
                setProjectDialogOpen(true);
              }}
              disabled={startingProject || project.cases === 0}
            >
              <Play /> {startingProject ? "Starting project…" : "Run project"}
            </Button>
          </>
        }
      />

      {error && !dialogOpen ? <Alert variant="error">{error}</Alert> : null}

      <StatGroup columns={4}>
        <Link
          to={`/projects/${project.id}/suites`}
          aria-label={`Suites: ${project.suites}. Open suites`}
          className="card-interactive block outline-none"
        >
          <Stat label="Suites" icon={Layers} value={project.suites} />
          <CardArrow />
        </Link>
        <Link
          to={`/projects/${project.id}/test-cases`}
          aria-label={`Test cases: ${project.cases}. Open test cases`}
          className="card-interactive block outline-none"
        >
          <Stat label="Test cases" icon={FileCheck2} value={project.cases} />
          <CardArrow />
        </Link>
        <Stat label="Passed" icon={CheckCircle2} value={project.passed} hint={`${project.passRate}% pass rate`} />
        <Stat label="Failed" icon={XCircle} value={project.failed} tone={project.failed > 0 ? "destructive" : "default"} />
      </StatGroup>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-info-soft text-brand-accent">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">Suite suggestions are ready for review</p>
            <p className="text-xs text-muted-foreground">AI-detected coverage gaps can be reviewed before running tests.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/projects/${project.id}/suites/review`}>Review suggestions</Link>
        </Button>
      </div>

      <section className="space-y-3">
        {/* Overview shows the top suites only; the full list lives on the Suites page (count is on the tile above). */}
        <SectionHeader
          title="Test suites"
          actions={
            project.suitesList.length > 0 ? (
              <Link
                to={`/projects/${project.id}/suites`}
                className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground hover:underline"
              >
                View all suites <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : undefined
          }
        />
        <DataTable
          columns={columns}
          data={topSuites}
          getRowId={(suite) => suite.id}
          onRowClick={(suite) => navigate(`/projects/${project.id}/suites/${suite.id}`)}
          rowLabel={(suite) => `Open suite ${suite.name}`}
          minWidth={820}
          empty={
            <EmptyState
              size="sm"
              icon={Layers}
              title="No suites yet"
              action={
                <Button size="sm" asChild>
                  <Link to={`/projects/${project.id}/suites`}>
                    <Plus /> Create suite
                  </Link>
                </Button>
              }
            />
          }
        />
      </section>

      <Modal
        open={projectDialogOpen}
        onClose={() => {
          if (!startingProject) setProjectDialogOpen(false);
        }}
        title="Run project"
        description={project.name}
        footer={
          <>
            <Button variant="outline" disabled={startingProject} onClick={() => setProjectDialogOpen(false)}>
              Cancel
            </Button>
            <Button loading={startingProject} disabled={startingProject || !environmentId} onClick={runProject}>
              {startingProject ? "Starting…" : "Run project"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Category"
            value={suiteCategory}
            onChange={(value) => setSuiteCategory(value as "all" | SuiteCategory)}
            options={[
              { value: "all", label: "All categories" },
              ...SUITE_CATEGORIES.map((category) => ({ value: category, label: SUITE_CATEGORY_LABELS[category] })),
            ]}
          />
          <EnvironmentField environments={environments} value={environmentId} onChange={setEnvironmentId} />
          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
      </Modal>

      <Modal
        open={suiteDialogId !== null}
        onClose={cancelSuiteDialog}
        title="Run test suite"
        description={project.suitesList.find((suite) => suite.id === suiteDialogId)?.name}
        footer={
          <>
            <Button variant={startingSuiteId ? "destructive" : "outline"} disabled={cancellingSuite} onClick={cancelSuiteDialog}>
              {startingSuiteId ? (cancellingSuite ? "Cancelling…" : "Cancel run") : "Cancel"}
            </Button>
            <Button loading={startingSuiteId !== null} disabled={startingSuiteId !== null || !environmentId} onClick={runSuite}>
              {startingSuiteId ? "Starting…" : "Run suite"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <EnvironmentField environments={environments} value={environmentId} onChange={setEnvironmentId} />
          {error ? <Alert variant="error">{error}</Alert> : null}
        </div>
      </Modal>

      <ProjectFormModal
        open={editOpen}
        title="Edit project"
        submitLabel="Save changes"
        initialValue={editValue}
        loading={saving}
        onClose={() => setEditOpen(false)}
        onSubmit={updateProject}
      />
    </PageContainer>
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
      <Alert variant="warning">No environments are configured for this project. Add an environment before running tests.</Alert>
    );
  }
  return (
    <Select
      label="Environment"
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: "Select environment" },
        ...environments.map((environment) => ({ value: environment.id, label: environment.name })),
      ]}
    />
  );
}

export default ProjectOverviewPage;
