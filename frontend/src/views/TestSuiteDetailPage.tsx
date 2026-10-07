"use client";

import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "@/lib/navigation";
import { api, type EnvironmentSummary, type TestCaseInput, type TestCaseSummary, type TestSuiteDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { AddTestCasesModal } from "@/components/suites/AddTestCasesModal";
import { EditSuiteModal } from "@/components/suites/EditSuiteModal";
import { SuiteCategoryBadges } from "@/components/suites/SuiteCategoryBadge";
import { TestCaseFormModal } from "@/components/test-cases/TestCaseFormModal";

export function TestSuiteDetailPage() {
  const navigate = useNavigate();
  const { id: projectId = "", suiteId = "" } = useParams();
  const [suite, setSuite] = useState<TestSuiteDetail | null>(null);
  const [projectCases, setProjectCases] = useState<TestCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
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

  async function handleCreate(input: TestCaseInput) {
    if (!projectId || !suiteId) return;
    setCreating(true);
    setError("");
    try {
      const created = await api.createTestCase(projectId, { ...input, suiteId });
      const updated = await api.testSuite(projectId, suiteId);
      setSuite(updated);
      setProjectCases((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create test case");
    } finally {
      setCreating(false);
    }
  }

  async function handleAdd(testCaseIds: string[]) {
    if (!projectId || !suiteId) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.addTestCasesToSuite(projectId, suiteId, testCaseIds);
      setSuite(updated);
      setAddOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add test cases");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCase(testCaseId: string, name: string) {
    if (!projectId || !suiteId) return;
    if (!window.confirm(`Delete test case “${name}”? This cannot be undone.`)) return;
    setError("");
    try {
      await api.deleteTestCase(projectId, testCaseId);
      const updated = await api.testSuite(projectId, suiteId);
      setSuite(updated);
      setProjectCases((current) => current.filter((item) => item.id !== testCaseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete test case");
    }
  }

  async function handleRemove(testCaseId: string) {
    if (!projectId || !suiteId) return;
    setError("");
    try {
      const updated = await api.removeTestCaseFromSuite(projectId, suiteId, testCaseId);
      setSuite(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove test case");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update suite");
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
      setError(err instanceof Error ? err.message : "Could not start the suite run");
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
    if (!window.confirm("Delete this test suite? Test cases will not be deleted.")) return;
    setError("");
    try {
      await api.deleteTestSuite(projectId, suiteId);
      navigate(`/projects/${projectId}/suites`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete suite");
    }
  }

  if (loading) {
    return <div className="p-6 lg:p-8"><LoadingSpinner label="Loading suite…" /></div>;
  }

  if (!suite) {
    return (
      <div className="p-6 lg:p-8">
        <p className="text-sm text-red-600">{error || "Suite not found."}</p>
        <Link to={`/projects/${projectId}/suites`} className="mt-2 inline-block text-sm text-indigo-600">
          ← Test Suites
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to={`/projects/${projectId}/suites`} className="text-sm text-indigo-600 hover:underline">
            ← Test Suites
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold">{suite.name}</h1>
            <SuiteCategoryBadges categories={suite.categories} category={suite.category} />
          </div>
          {suite.description ? <p className="mt-1 text-sm text-slate-500">{suite.description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setRunOpen(true)}>
            <Play size={15} className="mr-1 inline" />
            Run Test Suite
          </Button>
          <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil size={15} className="mr-1 inline" />
            Edit Suite
          </Button>
          <Button type="button" variant="outline" onClick={handleDelete}>
            <Trash2 size={15} className="mr-1 inline" />
            Delete Suite
          </Button>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Test Cases</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus size={15} className="mr-1 inline" />
            Add Test Cases
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus size={15} className="mr-1 inline" />
            Create Test Case
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-5 py-3 text-left">Code</th>
              <th className="px-5 py-3 text-left">Name</th>
              <th className="px-5 py-3 text-left">Category</th>
              <th className="px-5 py-3 text-left">Scenario</th>
              <th className="px-5 py-3 text-left">Automation</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {suite.testCases.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                  No test cases in this suite yet.
                </td>
              </tr>
            ) : (
              suite.testCases.map((testCase) => (
                <tr
                  key={testCase.id}
                  className="cursor-pointer border-t hover:bg-slate-50"
                  tabIndex={0}
                  aria-label={`Open ${testCase.code} ${testCase.name}`}
                  onClick={() => navigate(`/projects/${projectId}/test-cases/${testCase.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/projects/${projectId}/test-cases/${testCase.id}`);
                    }
                  }}
                >
                  <td className="px-5 py-4 font-mono text-xs">{testCase.code}</td>
                  <td className="px-5 py-4 font-medium text-indigo-600">
                    <div>{testCase.name}</div>
                    {testCase.categories?.length ? (
                      <div className="mt-1">
                        <SuiteCategoryBadges categories={testCase.categories} />
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-slate-600">{testCase.category ?? "Functional"}</td>
                  <td className="px-5 py-4 text-slate-600">{testCase.scenario ?? "Happy Path"}</td>
                  <td className="px-5 py-4 text-slate-600">{testCase.automationStatus}</td>
                  <td
                    className="px-5 py-4 text-right"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleRemove(testCase.id)}
                      className="mr-3 text-sm text-slate-600 hover:underline"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${testCase.name}`}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => handleDeleteCase(testCase.id, testCase.name)}
                    >
                      <Trash2 size={16} className="inline" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TestCaseFormModal
        open={createOpen}
        projectId={projectId}
        loading={creating}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />

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
        title="Run Test Suite"
        description={suite.name}
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border border-orange-300 px-4 py-2 text-sm font-medium text-orange-800 disabled:opacity-60"
              disabled={cancelling}
              onClick={closeRunDialog}
            >
              {starting ? (cancelling ? "Cancelling..." : "Cancel run") : "Cancel"}
            </button>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={starting || !environmentId}
              onClick={runSuite}
            >
              {starting ? "Starting..." : "Run Suite"}
            </button>
          </>
        }
      >
        {environments.length === 0 ? (
          <p className="text-sm text-amber-700">
            No environments are configured for this project. Add an environment before running tests.
          </p>
        ) : (
          <label className="block text-sm font-medium text-slate-700">
            Environment
            <select
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
              value={environmentId}
              onChange={(event) => setEnvironmentId(event.target.value)}
            >
              <option value="">Select Environment</option>
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </Modal>

      <EditSuiteModal
        open={editOpen}
        suite={suite}
        loading={busy}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEdit}
      />
    </div>
  );
}

export default TestSuiteDetailPage;
