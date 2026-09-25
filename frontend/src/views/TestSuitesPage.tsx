"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Link, useParams } from "@/lib/navigation";
import { api, type TestSuiteSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CreateSuiteModal } from "@/components/suites/CreateSuiteModal";
import { SuiteCategoryBadge } from "@/components/suites/SuiteCategoryBadge";

export function TestSuitesPage() {
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

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="text-sm text-slate-500">Loading suites…</p>
        ) : suites.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No test suites yet. Create one to group test cases.
          </div>
        ) : (
          suites.map((suite) => (
            <Link
              key={suite.id}
              to={`/projects/${projectId}/suites/${suite.id}`}
              className="block rounded-lg border bg-white p-5 shadow-sm transition hover:border-indigo-200"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-semibold text-slate-900">{suite.name}</div>
                <SuiteCategoryBadge category={suite.category} />
              </div>
              {suite.description ? (
                <p className="mt-1 text-sm text-slate-500">{suite.description}</p>
              ) : null}
              <p className="mt-2 text-sm text-slate-600">
                {suite.caseCount} Test Case{suite.caseCount === 1 ? "" : "s"}
              </p>
            </Link>
          ))
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
