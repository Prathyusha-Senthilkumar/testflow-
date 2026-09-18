"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "@/lib/navigation";
import { api, type TestCaseSummary, type TestSuiteDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AddTestCasesModal } from "@/components/suites/AddTestCasesModal";
import { EditSuiteModal } from "@/components/suites/EditSuiteModal";

export function TestSuiteDetailPage() {
  const navigate = useNavigate();
  const { id: projectId = "", suiteId = "" } = useParams();
  const [suite, setSuite] = useState<TestSuiteDetail | null>(null);
  const [projectCases, setProjectCases] = useState<TestCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const inSuite = useMemo(
    () => new Set((suite?.testCases ?? []).map((testCase) => testCase.id)),
    [suite]
  );

  useEffect(() => {
    if (!projectId || !suiteId) return;
    setLoading(true);
    Promise.all([api.testSuite(projectId, suiteId), api.testCases(projectId)])
      .then(([detail, cases]) => {
        setSuite(detail);
        setProjectCases(cases);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add test cases");
    } finally {
      setBusy(false);
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

  async function handleEdit(input: { name: string; description?: string }) {
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
    return <div className="p-6 lg:p-8 text-sm text-slate-500">Loading suite…</div>;
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
          <h1 className="mt-2 text-3xl font-bold">{suite.name}</h1>
          {suite.description ? <p className="mt-1 text-sm text-slate-500">{suite.description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
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
        <Button type="button" onClick={() => setAddOpen(true)}>
          <Plus size={15} className="mr-1 inline" />
          Add Test Cases
        </Button>
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
                <tr key={testCase.id} className="border-t">
                  <td className="px-5 py-4 font-mono text-xs">{testCase.code}</td>
                  <td className="px-5 py-4">
                    <Link
                      to={`/projects/${projectId}/test-cases/${testCase.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {testCase.name}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{testCase.category ?? "Functional"}</td>
                  <td className="px-5 py-4 text-slate-600">{testCase.scenario ?? "Happy Path"}</td>
                  <td className="px-5 py-4 text-slate-600">{testCase.automationStatus}</td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(testCase.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AddTestCasesModal
        open={addOpen}
        loading={busy}
        testCases={projectCases}
        alreadyInSuite={inSuite}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAdd}
      />

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
