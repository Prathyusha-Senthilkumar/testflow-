"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { FileCheck2, Play, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useCreateDraftTestCase } from "@/hooks/useCreateDraftTestCase";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useNavigate, useParams } from "@/lib/navigation";
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { SuiteCategoryBadges } from "@/components/suites/SuiteCategoryBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { EmptyState } from "@/components/common/EmptyState";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { usePublishEntityName } from "@/components/layout/shell-context";
import { cn } from "@/lib/utils";
import {
  api,
  TEST_CASE_CATEGORIES,
  type TestCaseSummary,
  type TestSuiteSummary,
} from "@/lib/api";

const caseColumns = createDataTableColumns<TestCaseSummary>();
const STATUS_OPTIONS = ["Passed", "Failed", "Running", "Queued", "Untested"] as const;

export function TestCasesPage() {
  const { id: projectId = "" } = useParams();
  const navigate = useNavigate();
  const createDraft = useCreateDraftTestCase();
  const confirm = useConfirm();
  const [projectName, setProjectName] = useState("");
  const [cases, setCases] = useState<TestCaseSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [suiteFilter, setSuiteFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [suites, setSuites] = useState<TestSuiteSummary[]>([]);
  const [runs, setRuns] = useState<CaseRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  usePublishEntityName("project", projectId, projectName);

  const suiteByCase = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    const suiteById = new Map(suites.map((suite) => [suite.id, suite]));
    for (const testCase of cases) {
      const suite = testCase.suiteId ? suiteById.get(testCase.suiteId) : undefined;
      if (suite) map.set(testCase.id, { id: suite.id, name: suite.name });
    }
    return map;
  }, [cases, suites]);

  const latestRunByCase = useMemo(() => {
    const map = new Map<string, CaseRun>();
    const ordered = [...runs].sort((a, b) => runTime(b) - runTime(a));
    for (const run of ordered) {
      if (!run.testCaseId || map.has(run.testCaseId)) continue;
      if (projectId && run.projectId && run.projectId !== projectId) continue;
      map.set(run.testCaseId, run);
    }
    return map;
  }, [projectId, runs]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cases.filter((testCase) => {
      if (needle && !`${testCase.code} ${testCase.name}`.toLowerCase().includes(needle)) return false;
      const suite = suiteByCase.get(testCase.id);
      const run = latestRunByCase.get(testCase.id);
      const status = caseStatus(run);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (suiteFilter !== "all" && (suite?.id ?? "unassigned") !== suiteFilter) return false;
      if (typeFilter !== "all" && (testCase.category ?? "Functional") !== typeFilter) return false;
      return true;
    });
  }, [cases, latestRunByCase, q, statusFilter, suiteByCase, suiteFilter, typeFilter]);
  const all = rows.length > 0 && selected.length === rows.length;
  const filtersActive = q.trim() !== "" || statusFilter !== "all" || suiteFilter !== "all" || typeFilter !== "all";

  useEffect(() => {
    if (!projectId) return;
     
    setLoading(true);
    setError("");
    // The project aggregate only supplies the name label; don't block the list on it.
    api
      .project(projectId)
      .then((project) => setProjectName(project.name))
      .catch(() => undefined);
    Promise.all([api.testCases(projectId), api.testSuites(projectId), api.latestCaseRuns(projectId)])
      .then(([testCases, suiteSummaries, latestRuns]) => {
        setCases(testCases);
        setSuites(suiteSummaries);
        setRuns(latestRuns);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function deleteTestCase(event: MouseEvent, testCaseId: string, name: string) {
    event.stopPropagation();
    if (!projectId) return;
    const deleted = await confirm({
      title: "Delete test case?",
      description: (
        <>
          <strong>{name}</strong> and its run history will be permanently deleted.
        </>
      ),
      confirmLabel: "Delete test case",
      tone: "danger",
      onConfirm: async () => {
        await api.deleteTestCase(projectId, testCaseId);
      },
    });
    if (!deleted) return;
    setCases((current) => current.filter((item) => item.id !== testCaseId));
    setSelected((current) => current.filter((id) => id !== testCaseId));
    toast.success("Test case deleted");
  }

  const columns = useMemo(
    () => [
      caseColumns.display({
        id: "select",
        header: () => (
          <Checkbox
            aria-label="Select all test cases"
            checked={all ? true : selected.length > 0 ? "indeterminate" : false}
            onCheckedChange={() => setSelected(all ? [] : rows.map((r) => r.id))}
          />
        ),
        cell: ({ row }) => (
          <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
            <Checkbox
              aria-label={`Select ${row.original.name}`}
              checked={selected.includes(row.original.id)}
              onCheckedChange={() =>
                setSelected((s) => (s.includes(row.original.id) ? s.filter((x) => x !== row.original.id) : [...s, row.original.id]))
              }
            />
          </span>
        ),
        meta: { className: "w-10", headerClassName: "w-10" },
      }),
      caseColumns.accessor("code", {
        header: "ID",
        sortFn: "alphanumeric",
        cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue<string>()}</span>,
      }),
      caseColumns.accessor("name", {
        header: "Test case",
        cell: ({ row }) => (
          <div className="min-w-0 max-w-[26rem] whitespace-normal">
            <div className="font-medium text-foreground">{row.original.name}</div>
            {row.original.categories?.length ? (
              <div className="mt-1">
                <SuiteCategoryBadges categories={row.original.categories} />
              </div>
            ) : null}
          </div>
        ),
      }),
      caseColumns.accessor((t) => t.category ?? "Functional", {
        id: "category",
        header: "Category",
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      }),
      caseColumns.accessor((t) => t.scenario ?? "Happy Path", {
        id: "scenario",
        header: "Scenario",
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      }),
      caseColumns.accessor("automationStatus", {
        header: "Automation",
        cell: ({ getValue }) => <Badge variant="outline" className="font-mono">{getValue<string>()}</Badge>,
      }),
      caseColumns.accessor((t) => suiteByCase.get(t.id)?.name ?? "", {
        id: "suite",
        header: "Suite",
        cell: ({ getValue }) => {
          const name = getValue<string>();
          return <span className={cn("text-[13px]", name ? "text-foreground" : "text-faint")}>{name || "Unassigned"}</span>;
        },
      }),
      caseColumns.accessor((t) => caseStatus(latestRunByCase.get(t.id)), {
        id: "status",
        header: "Status",
        cell: ({ getValue }) => <RunStatusBadge status={getValue<string>()} />,
      }),
      caseColumns.accessor((t) => runTime(latestRunByCase.get(t.id) ?? { status: "" }), {
        id: "lastRun",
        header: "Last run",
        cell: ({ row }) => {
          const run = latestRunByCase.get(row.original.id);
          return (
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {run ? formatWhen(run.completedAt || run.startedAt) : "Not run"}
            </span>
          );
        },
      }),
      caseColumns.accessor((t) => latestRunByCase.get(t.id)?.runBy ?? "", {
        id: "runBy",
        header: "Run by",
        cell: ({ getValue }) => <span className="text-[13px] text-muted-foreground">{getValue<string>() || "—"}</span>,
      }),
      caseColumns.display({
        id: "delete",
        header: () => <span className="sr-only">Delete</span>,
        meta: { align: "right", className: "w-12" },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${row.original.name}`}
            className="hover:text-destructive"
            onClick={(event) => deleteTestCase(event, row.original.id, row.original.name)}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Trash2 />
          </Button>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deleteTestCase only closes over projectId
    [all, rows, selected, suiteByCase, latestRunByCase, projectId]
  );

  const showUnassigned = cases.some((testCase) => !suiteByCase.has(testCase.id));

  return (
    <PageContainer>
      <PageHeader
        title="Test Cases"
        description="Manage, organize into suites, and execute all automated test cases across suites."
        actions={
          <>
            <Button onClick={() => void createDraft.create(projectId)} loading={createDraft.creating}>
              {!createDraft.creating ? <Plus /> : null} Create test case
            </Button>
          </>
        }
      />

      {error ? <Alert variant="error" title="Could not load test cases">{error}</Alert> : null}

      <div className="flex flex-col gap-3">
        <Toolbar
          sticky
          search={
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search by name or code…"
              shortcut="/"
              bindShortcut
            />
          }
          filters={
            <>
              <Select
                aria-label="Status"
                size="sm"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[{ value: "all", label: "All statuses" }, ...STATUS_OPTIONS.map((status) => ({ value: status, label: status }))]}
              />
              <Select
                aria-label="Suite"
                size="sm"
                value={suiteFilter}
                onChange={setSuiteFilter}
                options={[
                  { value: "all", label: "All suites" },
                  ...suites.map((suite) => ({ value: suite.id, label: suite.name })),
                  ...(showUnassigned ? [{ value: "unassigned", label: "Unassigned" }] : []),
                ]}
              />
              <Select
                aria-label="Type"
                size="sm"
                value={typeFilter}
                onChange={setTypeFilter}
                options={[{ value: "all", label: "All types" }, ...TEST_CASE_CATEGORIES.map((category) => ({ value: category, label: category }))]}
              />
            </>
          }
          actions={
            selected.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1 text-[13px]">
                <span className="px-1 font-medium tabular-nums">{selected.length} selected</span>
                <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                <Button variant="ghost" size="sm">
                  <Sparkles /> Automate
                </Button>
                <Button variant="ghost" size="sm">
                  <Plus /> Add to suite
                </Button>
                <Button size="sm">
                  <Play /> Run selected
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 /> Delete
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={() => setSelected([])}>
                  <X />
                </Button>
              </div>
            ) : null
          }
        />

        <DataTable
          columns={columns}
          data={rows}
          getRowId={(t) => t.id}
          loading={loading}
          loadingLabel="Loading test cases…"
          minWidth={1050}
          onRowClick={(t) => navigate(`/projects/${projectId}/test-cases/${t.id}`)}
          rowLabel={(t) => `Open ${t.code} ${t.name}`}
          rowClassName={(t) => (selected.includes(t.id) ? "bg-accent/60" : undefined)}
          empty={
            cases.length === 0 ? (
              <EmptyState
                icon={FileCheck2}
                title="No test cases yet"
                description="Create your first test case to get started."
                action={
                  <>
                    <Button size="sm" onClick={() => void createDraft.create(projectId)} loading={createDraft.creating}>
                      {!createDraft.creating ? <Plus /> : null} Create test case
                    </Button>
                  </>
                }
              />
            ) : (
              <EmptyState
                size="sm"
                icon={Search}
                title="No test cases match these filters"
                action={
                  filtersActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setQ("");
                        setStatusFilter("all");
                        setSuiteFilter("all");
                        setTypeFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : null
                }
              />
            )
          }
        />
        {!loading && rows.length > 0 ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            Showing {rows.length} of {cases.length} test case{cases.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>
    </PageContainer>
  );
}

type CaseRun = {
  testCaseId?: string | null;
  projectId?: string | null;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  runBy?: string | null;
};

function caseStatus(run: CaseRun | undefined): "Passed" | "Failed" | "Running" | "Untested" | "Queued" {
  if (!run) return "Untested";
  if (run.status === "Passed" || run.status === "Failed" || run.status === "Running" || run.status === "Queued") {
    return run.status;
  }
  return "Untested";
}

function runTime(run: CaseRun): number {
  const value = new Date(run.completedAt || run.startedAt || "").getTime();
  return Number.isNaN(value) ? 0 : value;
}

function formatWhen(value?: string | null): string {
  if (!value) return "Not run";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not run" : parsed.toLocaleString();
}

export default TestCasesPage;
