"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Plus, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { Link, useNavigate, useParams } from "@/lib/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TestCaseFormModal } from "@/components/test-cases/TestCaseFormModal";
import {
  api,
  TEST_CASE_CATEGORIES,
  type ReportRun,
  type TestCaseInput,
  type TestCaseSummary,
  type TestSuiteDetail,
} from "@/lib/api";

export function TestCasesPage() {
  const { id: projectId = "" } = useParams();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("Project");
  const [cases, setCases] = useState<TestCaseSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [suiteFilter, setSuiteFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [suites, setSuites] = useState<TestSuiteDetail[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");

  const suiteByCase = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const suite of suites) {
      for (const testCase of suite.testCases) {
        map.set(testCase.id, { id: suite.id, name: suite.name });
      }
    }
    return map;
  }, [suites]);

  const latestRunByCase = useMemo(() => {
    const map = new Map<string, ReportRun>();
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

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    Promise.all([api.project(projectId), api.testCases(projectId), api.testSuites(projectId), api.reportRuns()])
      .then(async ([project, testCases, suiteSummaries, reportRuns]) => {
        const details = await Promise.all(
          suiteSummaries.map((suite) => api.testSuite(projectId, suite.id))
        );
        setProjectName(project.name);
        setCases(testCases);
        setSuites(details);
        setRuns(reportRuns);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function createTestCase(input: TestCaseInput) {
    if (!projectId) return;
    setSaving(true);
    setError("");
    try {
      const created = await api.createTestCase(projectId, input);
      setCases((current) => [created, ...current]);
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create test case");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <PageHeader
        eyebrow={
          <>
            <Link to="/projects">Projects</Link>
            <span className="mx-1">›</span>
            {projectName}
            <span className="mx-1">›</span>
            <span className="text-indigo-600">Test Cases</span>
          </>
        }
        title="Test Cases (All Suites)"
        description="Manage, organize into suites, and execute all automated test cases"
        actions={
          <>
            <button type="button" className="rounded-lg border bg-white px-4 py-2 text-sm font-medium">
              <Upload size={15} className="mr-1 inline" />
              Import Test Cases
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus size={15} className="mr-1 inline" />
              Create Test Case
            </button>
          </>
        }
      />

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-lg bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={17} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm"
              placeholder="Search test cases..."
            />
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <select
              aria-label="Status"
              className="rounded-lg border bg-indigo-50 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All Statuses</option>
              {["Passed", "Failed", "Running", "Queued", "Untested"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              aria-label="Suite"
              className="rounded-lg border bg-indigo-50 px-3 py-2 text-sm"
              value={suiteFilter}
              onChange={(event) => setSuiteFilter(event.target.value)}
            >
              <option value="all">All Suites</option>
              {suites.map((suite) => (
                <option key={suite.id} value={suite.id}>
                  {suite.name}
                </option>
              ))}
              {cases.some((testCase) => !suiteByCase.has(testCase.id)) && (
                <option value="unassigned">Unassigned</option>
              )}
            </select>
            <select
              aria-label="Type"
              className="rounded-lg border bg-indigo-50 px-3 py-2 text-sm"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="all">All Types</option>
              {TEST_CASE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm">
          <b>{selected.length} test cases selected</b>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border bg-white px-3 py-1.5 text-sm">
              <Sparkles size={14} className="mr-1 inline" />
              Automate
            </button>
            <button type="button" className="rounded-lg border bg-white px-3 py-1.5 text-sm">
              + Add to Suite
            </button>
            <button type="button" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white text-sm">
              <Play size={14} className="mr-1 inline" />
              Run Selected
            </button>
            <button type="button" className="rounded-lg border bg-white px-3 py-1.5 text-red-600 text-sm">
              <Trash2 size={14} className="mr-1 inline" />
              Delete
            </button>
            <button type="button" className="px-2 text-indigo-700" onClick={() => setSelected([])}>
              Clear Selection
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-lg bg-white shadow-sm">
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">Loading test cases...</div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            {cases.length === 0
              ? "No test cases yet. Create your first test case to get started."
              : "No test cases match these filters."}
          </div>
        ) : (
          <table className="w-full min-w-[950px] text-sm">
            <thead className="bg-indigo-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={all}
                    onChange={() => setSelected(all ? [] : rows.map((r) => r.id))}
                  />
                </th>
                <th className="px-3 py-3 text-left">Test ID</th>
                <th className="px-3 py-3 text-left">Test Case</th>
                <th className="px-3 py-3 text-left">Category</th>
                <th className="px-3 py-3 text-left">Scenario</th>
                <th className="px-3 py-3 text-left">Automation</th>
                <th className="px-3 py-3 text-left">Suites</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-left">Last Run</th>
                <th className="px-3 py-3 text-left">Run By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const suite = suiteByCase.get(t.id);
                const run = latestRunByCase.get(t.id);
                const status = caseStatus(run);
                return (
                <tr
                  key={t.id}
                  className="cursor-pointer border-t hover:bg-slate-50"
                  tabIndex={0}
                  aria-label={`Open ${t.code} ${t.name}`}
                  onClick={() => navigate(`/projects/${projectId}/test-cases/${t.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/projects/${projectId}/test-cases/${t.id}`);
                    }
                  }}
                >
                  <td
                    className="px-4 py-4"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(t.id)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() =>
                        setSelected((s) =>
                          s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id]
                        )
                      }
                    />
                  </td>
                  <td className="px-3 font-mono text-xs">
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-sm">{t.code}</span>
                  </td>
                  <td className="px-3 font-medium">{t.name}</td>
                  <td className="px-3 text-slate-700">{t.category ?? "Functional"}</td>
                  <td className="px-3 text-slate-700">{t.scenario ?? "Happy Path"}</td>
                  <td className="px-3">
                    <span className="rounded-lg border bg-indigo-50 px-2 py-1 font-mono text-xs text-slate-600">
                      {t.automationStatus}
                    </span>
                  </td>
                  <td className="px-3">
                    <span className={suite ? "text-xs text-slate-700" : "text-xs text-slate-400"}>
                      {suite?.name ?? "Unassigned"}
                    </span>
                  </td>
                  <td className="px-3">
                    {status === "Queued" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        Queued
                      </span>
                    ) : (
                      <StatusBadge status={status} />
                    )}
                  </td>
                  <td className="px-3 text-slate-500">
                    {run ? formatWhen(run.completedAt || run.startedAt) : "Not run"}
                  </td>
                  <td className="px-3">{run?.runBy || "—"}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && rows.length > 0 && (
          <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-slate-600">
            <span>Showing {rows.length} test case{rows.length === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>

      <TestCaseFormModal
        open={modalOpen}
        loading={saving}
        onClose={() => setModalOpen(false)}
        onSubmit={createTestCase}
      />
    </div>
  );
}

function caseStatus(run: ReportRun | undefined): "Passed" | "Failed" | "Running" | "Untested" | "Queued" {
  if (!run) return "Untested";
  if (run.status === "Passed" || run.status === "Failed" || run.status === "Running" || run.status === "Queued") {
    return run.status;
  }
  return "Untested";
}

function runTime(run: ReportRun): number {
  const value = new Date(run.completedAt || run.startedAt || "").getTime();
  return Number.isNaN(value) ? 0 : value;
}

function formatWhen(value?: string | null): string {
  if (!value) return "Not run";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not run" : parsed.toLocaleString();
}

export default TestCasesPage;
