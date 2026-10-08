"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileCheck2, ListMinus, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateDraftTestCase } from "@/hooks/useCreateDraftTestCase";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Link, useNavigate, useParams } from "@/lib/navigation";
import { api, type EnvironmentSummary, type TestCaseSummary, type TestSuiteDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/common/EmptyState";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page-header";
import { usePublishEntityName } from "@/components/layout/shell-context";
import { AddTestCasesModal } from "@/components/suites/AddTestCasesModal";
import { EditSuiteModal } from "@/components/suites/EditSuiteModal";
import { SuiteCategoryBadges } from "@/components/suites/SuiteCategoryBadge";

const column = createDataTableColumns<TestCaseSummary>();

export function TestSuiteDetailPage() {
  const navigate = useNavigate();
  const createDraft = useCreateDraftTestCase();
  const confirm = useConfirm();
  const { id: projectId = "", suiteId = "" } = useParams();
  const [suite, setSuite] = useState<TestSuiteDetail | null>(null);
  const [projectCases, setProjectCases] = useState<TestCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancelStart = useRef(false);

  const inSuite = useMemo(
    () => new Set((suite?.testCases ?? []).map((testCase) => testCase.id)),
    [suite]
  );

  useEffect(() => {
    if (!projectId || !suiteId) return;
    setLoading(true);
    Promise.all([api.testSuite(projectId, suiteId), api.testCases(projectId), api.environments(projectId)])
      .then(([detail, cases, environmentRows]) => {
        setSuite(detail);
        setProjectCases(cases);
        setEnvironments(environmentRows);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId, suiteId]);

  async function handleAdd(testCaseIds: string[]) {
    if (!projectId || !suiteId) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.addTestCasesToSuite(projectId, suiteId, testCaseIds);
      setSuite(updated);
      setAddOpen(false);
      toast.success(`Added ${testCaseIds.length} test case${testCaseIds.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add test cases");
    } finally {
      setBusy(false);
    }
  }

  /** Removes immediately (nothing is lost) with an Undo that re-adds the case. */
  async function handleRemove(testCaseId: string, name: string) {
    if (!projectId || !suiteId) return;
    setError("");
    try {
      const updated = await api.removeTestCaseFromSuite(projectId, suiteId, testCaseId);
      setSuite(updated);
      toast.success("Removed from suite", {
        description: name,
        action: {
          label: "Undo",
          onClick: () => {
            api
              .addTestCasesToSuite(projectId, suiteId, [testCaseId])
              .then(setSuite)
              .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Couldn’t add it back"));
          },
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove test case");
    }
  }

  async function handleEdit(input: { name: string; description?: string; category?: string }) {
    if (!projectId || !suiteId) return;
    setBusy(true);
    setError("");
    try {
      await api.updateTestSuite(projectId, suiteId, input);
      const refreshed = await api.testSuite(projectId, suiteId);
      setSuite(refreshed);
      setEditOpen(false);
      toast.success("Suite updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update suite");
    } finally {
      setBusy(false);
    }
  }

  async function runSuite() {
    if (!projectId || !suiteId || starting || !environmentId) return;
    cancelStart.current = false;
    setCancelling(false);
    setStarting(true);
    setError("");
    try {
      const started = await api.startSuiteRun(projectId, suiteId, environmentId);
      if (cancelStart.current) await api.cancelBatchRun(started.batchId);
      setRunOpen(false);
      navigate(`/runs/batches/${started.batchId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the suite run");
      setStarting(false);
      setCancelling(false);
    }
  }

  function closeRunDialog() {
    if (starting) {
      cancelStart.current = true;
      setCancelling(true);
      return;
    }
    setRunOpen(false);
  }

  async function handleDelete() {
    if (!projectId || !suiteId) return;
    setError("");
    const deleted = await confirm({
      title: "Delete suite?",
      description: (
        <>
          <strong>{suite?.name ?? "This suite"}</strong> will be permanently deleted. Test cases in this suite are kept.
        </>
      ),
      confirmLabel: "Delete suite",
      tone: "danger",
      onConfirm: async () => {
        await api.deleteTestSuite(projectId, suiteId);
      },
    });
    if (!deleted) return;
    toast.success("Suite deleted");
    navigate(`/projects/${projectId}/suites`);
  }

  usePublishEntityName("suite", suite?.id, suite?.name);

  // The handlers only close over projectId/suiteId, so columns rebuild on those.
  const columns = useMemo(
    () => [
      column.accessor("code", {
        header: "Code",
        meta: { className: "w-24" },
        cell: (info) => <span className="font-mono text-xs text-muted-foreground">{info.getValue()}</span>,
      }),
      column.accessor("name", {
        header: "Name",
        meta: { className: "whitespace-normal" },
        cell: (info) => (
          <div className="min-w-0">
            <div className="font-medium text-foreground">{info.getValue()}</div>
            {info.row.original.categories?.length ? (
              <div className="mt-1">
                <SuiteCategoryBadges categories={info.row.original.categories} />
              </div>
            ) : null}
          </div>
        ),
      }),
      column.accessor((testCase) => testCase.category ?? "Functional", {
        id: "category",
        header: "Category",
        cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
      }),
      column.accessor((testCase) => testCase.scenario ?? "Happy Path", {
        id: "scenario",
        header: "Scenario",
        cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
      }),
      column.accessor("automationStatus", {
        header: "Automation",
        cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
      }),
      column.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        meta: { align: "right", className: "w-12" },
        cell: (info) => {
          const testCase = info.row.original;
          return (
            <div
              className="flex items-center justify-end gap-1"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${testCase.name} from suite`}
                    className="reveal-on-hover"
                    onClick={() => void handleRemove(testCase.id, testCase.name)}
                  >
                    <ListMinus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove from suite</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers are recreated each render but only read projectId/suiteId
    [projectId, suiteId]
  );

  if (loading) {
    return (
      <PageContainer>
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <DataTable columns={columns} data={[]} loading skeletonRows={5} />
      </PageContainer>
    );
  }

  if (!suite) {
    return (
      <PageContainer>
        <EmptyState
          variant="panel"
          icon={FileCheck2}
          title="Suite not found"
          description={error || "This suite may have been deleted."}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectId}/suites`}>
                <ArrowLeft />
                Back to suites
              </Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={suite.name}
        description={suite.description || undefined}
        meta={<SuiteCategoryBadges categories={suite.categories} category={suite.category} />}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </Button>
            <Button variant="outline" onClick={handleDelete} className="hover:border-destructive/40 hover:text-destructive">
              <Trash2 />
              Delete
            </Button>
            <Button onClick={() => setRunOpen(true)}>
              <Play />
              Run suite
            </Button>
          </>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Test cases"
          count={suite.testCases.length}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                <Plus />
                Add existing
              </Button>
              <Button
                size="sm"
                loading={createDraft.creating}
                onClick={() => void createDraft.create(projectId, { suiteId, from: `/projects/${projectId}/suites/${suiteId}` })}
              >
                {!createDraft.creating ? <Plus /> : null}
                Create test case
              </Button>
            </>
          }
        />
        <DataTable
          columns={columns}
          data={suite.testCases}
          getRowId={(testCase) => testCase.id}
          searchable={suite.testCases.length > 0}
          searchPlaceholder="Search test cases…"
          onRowClick={(testCase) => navigate(`/projects/${projectId}/test-cases/${testCase.id}`)}
          rowLabel={(testCase) => `Open ${testCase.code} ${testCase.name}`}
          minWidth={760}
          empty={
            suite.testCases.length > 0 ? undefined : (
              <EmptyState
                icon={FileCheck2}
                title="No test cases in this suite"
                description="Add existing test cases from this project or create a new one."
                action={
                  <>
                    <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                      Add existing
                    </Button>
                    <Button
                      size="sm"
                      loading={createDraft.creating}
                      onClick={() => void createDraft.create(projectId, { suiteId, from: `/projects/${projectId}/suites/${suiteId}` })}
                    >
                      {!createDraft.creating ? <Plus /> : null}
                      Create test case
                    </Button>
                  </>
                }
              />
            )
          }
        />
      </section>


      <AddTestCasesModal
        open={addOpen}
        loading={busy}
        testCases={projectCases}
        alreadyInSuite={inSuite}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAdd}
      />

      <Modal
        open={runOpen}
        onClose={closeRunDialog}
        title="Run test suite"
        description={suite.name}
        footer={
          <>
            <Button variant="outline" disabled={cancelling} onClick={closeRunDialog}>
              {starting ? (cancelling ? "Cancelling…" : "Cancel run") : "Cancel"}
            </Button>
            <Button loading={starting} disabled={starting || !environmentId} onClick={runSuite}>
              {starting ? "Starting…" : (
                <>
                  <Play />
                  Run suite
                </>
              )}
            </Button>
          </>
        }
      >
        {environments.length === 0 ? (
          <Alert variant="warning" title="No environments configured">
            Add an environment to this project before running tests.
          </Alert>
        ) : (
          <Select
            label="Environment"
            value={environmentId}
            onChange={setEnvironmentId}
            placeholder="Select environment"
            options={environments.map((environment) => ({ value: environment.id, label: environment.name }))}
          />
        )}
      </Modal>

      <EditSuiteModal
        open={editOpen}
        suite={suite}
        loading={busy}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEdit}
      />
    </PageContainer>
  );
}

export default TestSuiteDetailPage;
