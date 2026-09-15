import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FolderOpen, Play, Settings2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { api, type ProjectDetail, type ProjectInput } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";

export function ProjectOverviewPage() {
  const { id = "" } = useParams();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");

    api
      .project(id)
      .then(setProject)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

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
      setError(
        err instanceof Error ? err.message : "Could not update project"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-10 text-sm text-slate-500">
        Loading project...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-10">
        <h1 className="text-2xl font-bold">Project unavailable</h1>

        <p className="mt-2 text-sm text-slate-500">
          {error || "The requested project could not be found."}
        </p>
      </div>
    );
  }

  const metrics = [
    ["Suites", project.suites],
    ["Test Cases", project.cases],
    ["Passed", project.passed],
    ["Failed", project.failed],
    ["Pass Rate", `${project.passRate}%`],
  ];

  return (
    <div className="p-8 lg:p-10">

      {/* Project Header */}
      <div className="flex flex-wrap items-start justify-between gap-5">

        <div className="max-w-2xl">

          {/* Breadcrumb */}
          <p className="text-sm text-slate-500">
            <Link
              to="/projects"
              className="hover:text-indigo-600 hover:underline transition-colors"
            >
              Projects
            </Link>

            <span className="mx-1">/</span>

            <span className="text-slate-700">
              {project.name}
            </span>
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {project.name}
          </h1>

          <a
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
            href={project.baseUrl}
            target="_blank"
            rel="noreferrer"
          >
            {project.baseUrl}
            <ExternalLink size={14} />
          </a>

          {project.description && (
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {project.description}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setEditOpen(true)}
          >
            <Settings2 size={16} />
            Edit Project
          </Button>

          <Button
            disabled={project.cases === 0}
            title={
              project.cases === 0
                ? "Add automated test cases before running the project"
                : "Project-level execution will use the execution service"
            }
          >
            <Play size={16} />
            Run All Suites
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Metrics */}
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(([label, value]) => (
          <Card
            className="p-5"
            key={label}
          >
            <p className="text-sm font-medium text-slate-500">
              {label}
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {value}
            </p>
          </Card>
        ))}
      </div>

      {/* Test Suites Header */}
      <div className="mt-9 flex flex-wrap items-end justify-between gap-3">

        <div>
          <h2 className="text-lg font-semibold">
            Test Suites
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Suites group related test cases. Generated suite suggestions
            can be reviewed before they are saved here.
          </p>
        </div>

        <Button
          variant="outline"
          disabled
          title="Suite creation is the next test-management screen"
        >
          <FolderOpen size={16} />
          Create Suite
        </Button>
      </div>

      {/* Test Suites */}
      {project.suitesList.length === 0 ? (

        <Card className="mt-4 px-6 py-12 text-center">

          <FolderOpen
            className="mx-auto text-slate-300"
            size={36}
          />

          <h3 className="mt-3 font-semibold">
            No test suites yet
          </h3>

          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            When test cases are created or generated, they can be grouped
            into manual or suggested suites for this project.
          </p>

        </Card>

      ) : (

        <div className="mt-4 space-y-3">

          {project.suitesList.map((suite) => (

            <Card
              key={suite.id}
              className="flex flex-wrap items-center justify-between gap-4 p-5"
            >

              <div>
                <h3 className="font-semibold text-slate-900">
                  {suite.name}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {suite.cases} cases · {suite.passed} passed ·{" "}
                  {suite.failed} failed · {suite.notRun} not run
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">

                <Badge
                  status={
                    suite.passRate === 100
                      ? "Passed"
                      : suite.failed > 0
                      ? "Failed"
                      : ""
                  }
                >
                  {suite.passRate}% pass
                </Badge>

                <div className="min-w-36 text-right text-xs text-slate-500">

                  <div>
                    {suite.lastRun
                      ? new Date(suite.lastRun).toLocaleString()
                      : "Not run"}
                  </div>

                  <div>
                    {suite.lastRunBy ?? "—"}
                  </div>

                </div>

                <Button
                  variant="outline"
                  disabled
                  title="Suite detail screen is not part of tonight's dashboard/project milestone"
                >
                  Open
                </Button>

              </div>

            </Card>
          ))}

        </div>
      )}

      {/* Edit Project Modal */}
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
