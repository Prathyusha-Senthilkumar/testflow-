"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Archive, Layers, Plus, SearchX, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useNavigate, useParams } from "@/lib/navigation";
import { api, type TestCaseSummary, type TestSuiteSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { SUITE_CATEGORIES, SUITE_CATEGORY_LABELS } from "@/lib/suiteCategory";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/common/EmptyState";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { CreateSuiteModal } from "@/components/suites/CreateSuiteModal";
import { SuiteCategoryBadges } from "@/components/suites/SuiteCategoryBadge";

const column = createDataTableColumns<TestSuiteSummary>();

const CATEGORY_FILTER_OPTIONS = [
  { value: "", label: "All categories" },
  ...SUITE_CATEGORIES.map((item) => ({ value: item, label: SUITE_CATEGORY_LABELS[item] })),
];

function suiteCategories(suite: TestSuiteSummary): string[] {
  return suite.categories?.length ? suite.categories : suite.category ? [suite.category] : [];
}

function formatWhen(value?: string | null): string {
  if (!value) return "Not run";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not run" : parsed.toLocaleString();
}

export function TestSuitesPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { id: projectId = "" } = useParams();
  const [suites, setSuites] = useState<TestSuiteSummary[]>([]);
  const [cases, setCases] = useState<TestCaseSummary[]>([]);
  const [runs, setRuns] = useState<Array<{ testCaseId: string; startedAt?: string | null; completedAt?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const filtering = Boolean(search.trim() || category);
  const visibleSuites = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return suites.filter((suite) => {
      if (category && !suiteCategories(suite).includes(category)) return false;
      if (!needle) return true;
      return [suite.name, suite.description].some((field) => field?.toLowerCase().includes(needle));
    });
  }, [suites, search, category]);
  function clearFilters() {
    setSearch("");
    setCategory("");
  }

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([api.testSuites(projectId), api.testCases(projectId), api.latestCaseRuns(projectId)])
      .then(([suiteRows, caseRows, runRows]) => {
        setSuites(suiteRows);
        setCases(caseRows);
        setRuns(runRows);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function toggleArchive(event: MouseEvent, suite: TestSuiteSummary) {
    event.stopPropagation();
    if (!projectId) return;
    try {
      const next = await api.archiveTestSuite(projectId, suite.id, !suite.archived);
      setSuites((current) => current.map((item) => (item.id === suite.id ? { ...item, ...next } : item)));
      toast.success(next.archived ? "Suite archived" : "Suite restored");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the suite");
    }
  }

  async function handleDelete(event: MouseEvent, suiteId: string, name: string) {
    event.stopPropagation();
    if (!projectId) return;
    setError("");
    const deleted = await confirm({
      title: "Delete suite?",
      tone: "danger",
      confirmLabel: "Delete suite",
      description: (
        <p>
          The suite <strong>{name}</strong> will be deleted. Test cases in this suite are kept.
        </p>
      ),
      onConfirm: () => api.deleteTestSuite(projectId, suiteId),
    });
    if (!deleted) return;
    setSuites((current) => current.filter((suite) => suite.id !== suiteId));
    toast.success("Suite deleted");
  }

  async function handleCreate(input: { name: string; description?: string; category?: string }) {
    if (!projectId) return;
    setCreating(true);
    setError("");
    try {
      const created = await api.createTestSuite(projectId, input);
      setSuites((current) => [created, ...current]);
      setCreateOpen(false);
      toast.success(`Created “${created.name}”`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create suite");
    } finally {
      setCreating(false);
    }
  }

  // handleDelete closes over projectId only; columns rebuild when it changes.
  const lastRunBySuite = useMemo(() => {
    const suiteOfCase = new Map(cases.map((testCase) => [testCase.id, testCase.suiteId]));
    const latest = new Map<string, string>();
    for (const run of runs) {
      const suiteId = suiteOfCase.get(run.testCaseId);
      const when = run.completedAt || run.startedAt;
      if (!suiteId || !when) continue;
      const current = latest.get(suiteId);
      if (!current || new Date(when).getTime() > new Date(current).getTime()) latest.set(suiteId, when);
    }
    return latest;
  }, [cases, runs]);

  const columns = useMemo(
    () => [
      column.accessor("name", {
        header: "Name",
        cell: (info) => (
          <span className="inline-flex items-center gap-2 font-medium text-foreground">
            {info.getValue()}
            {info.row.original.archived ? <Badge variant="outline">Archived</Badge> : null}
          </span>
        ),
      }),
      column.accessor((suite) => (suite.categories?.length ? suite.categories : suite.category ? [suite.category] : []).join(", "), {
        id: "category",
        header: "Category",
        cell: (info) => <SuiteCategoryBadges categories={info.row.original.categories} category={info.row.original.category} />,
      }),
      column.accessor((suite) => suite.description ?? "", {
        id: "description",
        header: "Description",
        enableSorting: false,
        meta: { className: "max-w-md whitespace-normal" },
        cell: (info) => <span className="line-clamp-2 text-muted-foreground">{info.getValue() || "—"}</span>,
      }),
      column.accessor("caseCount", {
        header: "Test cases",
        meta: { align: "right" },
        cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
      }),
      column.accessor((suite) => lastRunBySuite.get(suite.id) ?? "", {
        id: "lastRun",
        header: "Last run",
        cell: (info) => (
          <span className="text-[13px] text-muted-foreground tabular-nums">{formatWhen(lastRunBySuite.get(info.row.original.id))}</span>
        ),
      }),
      column.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { align: "right", className: "w-20" },
        cell: (info) => {
          const suite = info.row.original;
          return (
            <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={suite.archived ? `Unarchive ${suite.name}` : `Archive ${suite.name}`}
                  onClick={(event) => void toggleArchive(event, suite)}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Archive />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{suite.archived ? "Unarchive suite" : "Archive suite"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${suite.name}`}
                  className="reveal-on-hover hover:bg-destructive-soft hover:text-destructive"
                  onClick={(event) => handleDelete(event, suite.id, suite.name)}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete suite</TooltipContent>
            </Tooltip>
            </>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDelete is recreated each render but only reads projectId
    [projectId, lastRunBySuite]
  );

  return (
    <PageContainer>
      <PageHeader
        title="Test Suites"
        description="Group test cases into reusable suites."
        actions={
          // Empty project: the empty state carries the only "New suite" CTA.
          !loading && !error && suites.length === 0 ? undefined : (
            <>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus />
                New suite
              </Button>
            </>
          )
        }
      />

      {error ? <Alert variant="error" title="Could not load suites">{error}</Alert> : null}

      {!loading && suites.length > 0 ? (
        <Toolbar
          sticky
          search={
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search suites by name or description…"
              shortcut="/"
              bindShortcut
            />
          }
          filters={<Select aria-label="Filter by category" value={category} onChange={setCategory} options={CATEGORY_FILTER_OPTIONS} />}
          actions={
            <span className="text-xs text-muted-foreground tabular-nums">
              {filtering ? `${visibleSuites.length} of ${suites.length}` : `${suites.length} suites`}
            </span>
          }
        />
      ) : null}

      <DataTable
        columns={columns}
        data={visibleSuites}
        loading={loading}
        loadingLabel="Loading suites…"
        getRowId={(suite) => suite.id}
        initialSorting={[]}
        stickyTop={52}
        onRowClick={(suite) => navigate(`/projects/${projectId}/suites/${suite.id}`)}
        rowLabel={(suite) => `Open ${suite.name}`}
        minWidth={720}
        empty={
          suites.length > 0 ? (
            <EmptyState
              icon={SearchX}
              size="sm"
              title={search.trim() ? `No suites match “${search.trim()}”` : "No suites in this category"}
              action={
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  Clear
                </Button>
              }
            />
          ) : (
          <EmptyState
            icon={Layers}
            title="No test suites yet"
            description="Create a suite to group related test cases and run them together."
            action={
              <>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus />
                  New suite
                </Button>
              </>
            }
          />
          )
        }
      />

      <CreateSuiteModal
        open={createOpen}
        loading={creating}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </PageContainer>
  );
}

export default TestSuitesPage;
