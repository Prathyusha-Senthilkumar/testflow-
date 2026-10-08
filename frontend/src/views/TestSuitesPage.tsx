"use client";

import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useEffect, useState, type MouseEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "@/lib/navigation";
import { api, type TestSuiteSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CreateSuiteModal } from "@/components/suites/CreateSuiteModal";
import { SuiteCategoryBadges } from "@/components/suites/SuiteCategoryBadge";

export function TestSuitesPage() {
  const navigate = useNavigate();
  const { id: projectId = "" } = useParams();
  const [suites, setSuites] = useState<TestSuiteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api
      .testSuites(projectId)
      .then(setSuites)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleDelete(event: MouseEvent, suiteId: string, name: string) {
    event.stopPropagation();
    if (!projectId) return;
    if (!window.confirm(`Delete test suite “${name}”? Test cases will not be deleted.`)) return;
    setError("");
    try {
      await api.deleteTestSuite(projectId, suiteId);
      setSuites((current) => current.filter((suite) => suite.id !== suiteId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete suite");
    }
  }

  async function handleCreate(input: { name: string; description?: string; category?: string }) {
    if (!projectId) return;
    setCreating(true);
    setError("");
    try {
      const created = await api.createTestSuite(projectId, input);
      setSuites((current) => [created, ...current]);
      setCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create suite");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to={`/projects/${projectId}`} className="text-sm text-indigo-600 hover:underline">
            ← Project
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Test Suites</h1>
          <p className="mt-1 text-sm text-slate-500">Group test cases into reusable suites.</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus size={15} className="mr-1 inline" />
          New Test Suite
        </Button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow-sm">
        {loading ? (
          <LoadingSpinner label="Loading suites…" />
        ) : suites.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            No test suites yet. Create one to group test cases.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-indigo-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-5 py-3 text-left">Name</th>
                <th className="px-5 py-3 text-left">Category</th>
                <th className="px-5 py-3 text-left">Description</th>
                <th className="px-5 py-3 text-left">Test Cases</th>
                <th className="w-12 px-5 py-3 text-right"><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody>
              {suites.map((suite) => (
                <tr
                  key={suite.id}
                  className="cursor-pointer border-t hover:bg-slate-50"
                  tabIndex={0}
                  aria-label={`Open ${suite.name}`}
                  onClick={() => navigate(`/projects/${projectId}/suites/${suite.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/projects/${projectId}/suites/${suite.id}`);
                    }
                  }}
                >
                  <td className="px-5 py-4 font-medium text-indigo-600">{suite.name}</td>
                  <td className="px-5 py-4">
                    <SuiteCategoryBadges categories={suite.categories} category={suite.category} />
                  </td>
                  <td className="px-5 py-4 text-slate-600">{suite.description || "—"}</td>
                  <td className="px-5 py-4 text-slate-700">
                    {suite.caseCount} Test Case{suite.caseCount === 1 ? "" : "s"}
                  </td>
                  <td className="px-5 py-4 text-right" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      aria-label={`Delete ${suite.name}`}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      onClick={(event) => handleDelete(event, suite.id, suite.name)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateSuiteModal
        open={createOpen}
        loading={creating}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}

export default TestSuitesPage;
