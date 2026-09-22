"use client";

import { useEffect, useState } from "react";

import { CirclePlay, Code2, History, Mic, Play } from "lucide-react";

import { Link, useParams } from "@/lib/navigation";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Modal } from "@/components/ui/modal";

import { Select } from "@/components/ui/select";

import { Badge } from "@/components/ui/badge";

import {

  api,

  TEST_CASE_CATEGORIES,

  TEST_CASE_SCENARIOS,

  type TestCaseCategory,

  type TestCaseScenario,

  type EnvironmentSummary,

  type AuthProfileSummary,

  type TestCaseSummary,

  type TestCaseVersionDetail,

  type TestCaseVersionSummary,

  type TestRunResult,

} from "@/lib/api";

import { versionLabel } from "@/lib/roman";



function resolveExpectedResult(data: TestCaseSummary): string {

  if (data.expectedResult) return data.expectedResult;

  const legacy = data.assertions?.find((item) => item.value?.trim());

  return legacy?.value ?? "";

}



const RUN_POLL_MS = 2000;



/** Waits for the queued run to finish, reporting tester-facing progress only. */

async function waitForExecution(jobId: string, onPhase: (phase: string) => void) {

  for (;;) {

    const status = await api.getExecution(jobId);

    if (status.state === "completed" || status.state === "failed") return status;

    onPhase(status.state === "running" ? "Running test..." : "Preparing test...");

    await new Promise((resolve) => setTimeout(resolve, RUN_POLL_MS));

  }

}



function statusLabel(testCase: TestCaseSummary): string {

  if (testCase.isDraft && (testCase.publishedVersion ?? 0) === 0) return "Draft";

  if (testCase.isDraft) {

    return `Draft · ${versionLabel(testCase.publishedVersion ?? 0)} published`;

  }

  return `Published · ${versionLabel(testCase.publishedVersion ?? 0)}`;

}



export function TestCaseDetailPage() {

  const { id: projectId = "", caseId: testCaseId = "" } = useParams();

  const [testCase, setTestCase] = useState<TestCaseSummary | null>(null);

  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);

  const [authProfiles, setAuthProfiles] = useState<AuthProfileSummary[]>([]);

  const [environmentId, setEnvironmentId] = useState<string>("env-default");

  const [authProfileId, setAuthProfileId] = useState<string>("");

  const [startPath, setStartPath] = useState("/");

  const [resolvedPreview, setResolvedPreview] = useState("");

  const [category, setCategory] = useState<TestCaseCategory>("Functional");

  const [scenario, setScenario] = useState<TestCaseScenario>("Happy Path");

  const [expectedResult, setExpectedResult] = useState("");

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [recording, setRecording] = useState(false);

  const [running, setRunning] = useState(false);

  const [publishing, setPublishing] = useState(false);

  const [error, setError] = useState("");

  const [lastResult, setLastResult] = useState<TestRunResult | null>(null);

  const [runPhase, setRunPhase] = useState("");



  const [scriptOpen, setScriptOpen] = useState(false);

  const [scriptContent, setScriptContent] = useState("");

  const [scriptPath, setScriptPath] = useState("");

  const [scriptLoading, setScriptLoading] = useState(false);

  const [scriptSaving, setScriptSaving] = useState(false);



  const [historyOpen, setHistoryOpen] = useState(false);

  const [versions, setVersions] = useState<TestCaseVersionSummary[]>([]);

  const [selectedVersion, setSelectedVersion] = useState<TestCaseVersionDetail | null>(null);



  const hasScript = Boolean(testCase?.testFile);



  useEffect(() => {

    if (!projectId || !testCaseId) return;

    setLoading(true);

    setError("");

    Promise.all([api.testCase(projectId, testCaseId), api.environments(projectId), api.authProfiles(projectId)])

      .then(([data, envs, profiles]) => {

        setEnvironments(envs);

        setAuthProfiles(profiles);

        setTestCase(data);

        setEnvironmentId(data.environmentId ?? envs[0]?.id ?? "env-default");

        setAuthProfileId(data.authProfileId ?? "");

        setStartPath(data.startPath ?? "/");

        setResolvedPreview(data.resolvedStartUrl ?? "");

        setCategory(data.category ?? "Functional");

        setScenario(data.scenario ?? "Happy Path");

        setExpectedResult(resolveExpectedResult(data));

      })

      .catch((err: Error) => setError(err.message))

      .finally(() => setLoading(false));

  }, [projectId, testCaseId]);



  useEffect(() => {

    if (!projectId) return;

    const timer = window.setTimeout(() => {

      api

        .resolveStartUrl(projectId, startPath, environmentId)

        .then((data) => setResolvedPreview(data.resolvedStartUrl))

        .catch(() => setResolvedPreview(""));

    }, 200);

    return () => window.clearTimeout(timer);

  }, [projectId, startPath, environmentId]);



  async function handleSave() {

    if (!projectId || !testCaseId) return;

    setSaving(true);

    setError("");

    try {

      const updated = await api.updateTestCase(projectId, testCaseId, {

        environmentId,

        authProfileId: authProfileId || null,

        startPath,

        expectedResult: expectedResult.trim() || null,

        category,

        scenario,

      });

      setTestCase(updated);

      setEnvironmentId(updated.environmentId ?? environmentId);

      setAuthProfileId(updated.authProfileId ?? "");

      setStartPath(updated.startPath ?? "/");

      setResolvedPreview(updated.resolvedStartUrl ?? "");

      setCategory(updated.category ?? "Functional");

      setScenario(updated.scenario ?? "Happy Path");

      setExpectedResult(resolveExpectedResult(updated));

    } catch (err) {

      setError(err instanceof Error ? err.message : "Could not save test case");

    } finally {

      setSaving(false);

    }

  }



  async function handlePublish() {

    if (!projectId || !testCaseId) return;

    setPublishing(true);

    setError("");

    try {

      await handleSave();

      const updated = await api.publishTestCase(projectId, testCaseId);

      setTestCase(updated);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Could not publish test case");

    } finally {

      setPublishing(false);

    }

  }



  async function openScriptViewer() {

    if (!projectId || !testCaseId) return;

    setScriptOpen(true);

    setScriptLoading(true);

    setError("");

    try {

      const data = await api.getTestScript(projectId, testCaseId);

      setScriptContent(data.content);

      setScriptPath(data.testFile);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Could not load script");

      setScriptContent("");

    } finally {

      setScriptLoading(false);

    }

  }



  async function handleSaveScript() {

    if (!projectId || !testCaseId) return;

    setScriptSaving(true);

    setError("");

    try {

      const updated = await api.saveTestScript(projectId, testCaseId, scriptContent);

      setTestCase(updated);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Could not save script");

    } finally {

      setScriptSaving(false);

    }

  }



  async function handleRecord() {

    if (!projectId || !testCaseId) return;

    setRecording(true);

    setError("");

    try {

      await api.updateTestCase(projectId, testCaseId, {

        environmentId,

        authProfileId: authProfileId || null,

        startPath,

        expectedResult: expectedResult.trim() || null,

        category,

        scenario,

      });

      const updated = await api.recordTestCase(projectId, testCaseId);

      setTestCase(updated);

      if (scriptOpen) {

        const data = await api.getTestScript(projectId, testCaseId);

        setScriptContent(data.content);

        setScriptPath(data.testFile);

      }

    } catch (err) {

      setError(err instanceof Error ? err.message : "Recording failed");

    } finally {

      setRecording(false);

    }

  }



  async function handleRun() {

    if (!projectId || !testCaseId || !hasScript) return;

    setRunning(true);

    setError("");

    setLastResult(null);

    setRunPhase("Preparing test...");

    try {

      const updated = await api.updateTestCase(projectId, testCaseId, {

        environmentId,

        authProfileId: authProfileId || null,

        startPath,

        expectedResult: expectedResult.trim() || null,

        category,

        scenario,

      });

      setTestCase(updated);

      const scriptPath = updated.testFile ?? testCase?.testFile;

      if (!scriptPath) {

        throw new Error("No Playwright script path is configured for this test case.");

      }

      const execution = await api.startExecution({

        projectId,

        testCaseId: updated.id,

        testCaseCode: updated.code,

        scriptPath,

      });

      const finished = await waitForExecution(execution.jobId, setRunPhase);

      setRunPhase("Retrieving result...");

      const payload = finished.result;

      setLastResult({

        status: finished.state === "completed" && payload?.success ? "Passed" : "Failed",

        duration: (payload?.durationMs ?? 0) / 1000,

        error: payload?.errorMessage ?? finished.error ?? null,

      });

    } catch (err) {

      setError(err instanceof Error ? err.message : "Test run failed");

    } finally {

      setRunning(false);

      setRunPhase("");

    }

  }



  async function openVersionHistory() {

    if (!projectId || !testCaseId) return;

    setHistoryOpen(true);

    setSelectedVersion(null);

    setError("");

    try {

      const items = await api.testCaseVersions(projectId, testCaseId);

      setVersions(items);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Could not load version history");

    }

  }



  async function viewVersion(versionNumber: number) {

    if (!projectId || !testCaseId) return;

    try {

      const detail = await api.testCaseVersion(projectId, testCaseId, versionNumber);

      setSelectedVersion(detail);

    } catch (err) {

      setError(err instanceof Error ? err.message : "Could not load version");

    }

  }



  if (loading) {

    return <div className="p-6 text-sm text-slate-500 lg:p-8">Loading test case...</div>;

  }



  if (error && !testCase) {

    return (

      <div className="p-6 lg:p-8">

        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>

      </div>

    );

  }



  if (!testCase) {

    return (

      <div className="p-6 lg:p-8">

        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Test case not found.</div>

      </div>

    );

  }



  return (

    <div className="p-6 lg:p-8">

      <div className="rounded-xl bg-white p-6 shadow-sm">

        <div className="flex flex-wrap items-start justify-between gap-5">

          <div>

            <div className="mb-2 flex flex-wrap items-center gap-2">

              <span className="rounded-lg bg-indigo-50 px-2 py-1 font-mono text-xs text-indigo-700">{testCase.code}</span>

              <Badge variant={testCase.isDraft ? "warning" : "success"}>{statusLabel(testCase)}</Badge>

              <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">

                {testCase.automationStatus}

              </span>

            </div>

            <h1 className="text-3xl font-bold">{testCase.name}</h1>

            <p className="mt-1.5 max-w-3xl text-sm text-slate-500">

              {testCase.description || "No description provided."}

            </p>

          </div>

          <div className="flex flex-wrap gap-2">

            <Button type="button" variant="secondary" onClick={handleSave} disabled={saving || recording || running}>

              {saving ? "Saving..." : "Save"}

            </Button>

            <Button type="button" variant="secondary" onClick={handlePublish} disabled={publishing || saving || recording}>

              {publishing ? "Publishing..." : "Publish"}

            </Button>

            <Button type="button" variant="secondary" onClick={openVersionHistory}>

              <History size={15} className="mr-1 inline" />

              Version History

            </Button>

            <Button type="button" variant="secondary" onClick={handleRecord} disabled={recording || running}>

              <Mic size={15} className="mr-1 inline" />

              {recording ? "Recording..." : "Record Test"}

            </Button>

            <Button type="button" onClick={handleRun} disabled={!hasScript || recording || running}>

              <Play size={15} className="mr-1 inline" />

              {running ? "Running..." : "Run Test"}

            </Button>

            <Link

              to={`/projects/${projectId}/test-cases`}

              className="inline-flex h-10 items-center justify-center rounded-lg border bg-white px-4 text-sm font-medium"

            >

              ← Back to Test Cases

            </Link>

          </div>

        </div>



        {recording && (

          <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">

            Playwright Codegen should be open on this machine. Perform your actions, then close the Codegen window to

            finish recording.

          </div>

        )}



        {error && (

          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>

        )}



        <div className="mt-6 grid gap-4 border-t pt-6 lg:grid-cols-2">

          <div className="space-y-4">

            <div className="rounded-xl border border-slate-100 p-5">

              <h2 className="font-semibold">CLASSIFICATION</h2>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">

                <div>

                  <dt className="mb-1 text-slate-500">Category</dt>

                  <dd>

                    <Select

                      value={category}

                      onChange={(value) => setCategory(value as TestCaseCategory)}

                      options={TEST_CASE_CATEGORIES.map((option) => ({ value: option, label: option }))}

                    />

                  </dd>

                </div>

                <div>

                  <dt className="mb-1 text-slate-500">Scenario</dt>

                  <dd>

                    <Select

                      value={scenario}

                      onChange={(value) => setScenario(value as TestCaseScenario)}

                      options={TEST_CASE_SCENARIOS.map((option) => ({ value: option, label: option }))}

                    />

                  </dd>

                </div>

              </dl>

            </div>



            <div className="rounded-xl border border-slate-100 p-5">

              <dl className="space-y-3 text-sm">

                <div>

                  <dt className="mb-1 text-slate-500">Environment</dt>

                  <dd>

                    <Select

                      value={environmentId}

                      onChange={setEnvironmentId}

                      options={environments.map((env) => ({ value: env.id, label: env.name }))}

                    />

                  </dd>

                </div>

                <div>

                  <dt className="mb-1 text-slate-500">Auth profile</dt>

                  <dd>

                    <Select

                      value={authProfileId}

                      onChange={setAuthProfileId}

                      options={[
                        { value: "", label: "None" },
                        ...authProfiles.map((profile) => ({
                          value: profile.id,
                          label: profile.hasStorageState ? profile.name : `${profile.name} (no session)`,
                        })),
                      ]}

                    />

                  </dd>

                </div>

                <div>

                  <dt className="text-slate-500">Start path</dt>

                  <dd className="mt-1">

                    <input

                      className="w-full rounded-lg border px-3 py-2 font-mono text-sm"

                      value={startPath}

                      onChange={(e) => setStartPath(e.target.value)}

                      placeholder="/ or https://example.com"

                    />

                  </dd>

                </div>

                <div className="flex justify-between gap-3">

                  <dt className="text-slate-500">Resolved start URL</dt>

                  <dd className="max-w-[16rem] truncate font-mono text-xs text-right text-slate-700">

                    {resolvedPreview || testCase.resolvedStartUrl || "—"}

                  </dd>

                </div>

              </dl>

            </div>



            <div className="rounded-xl border border-slate-100 p-5">

              <div className="flex items-center justify-between gap-3">

                <h2 className="font-semibold">ACT</h2>

                <Button type="button" variant="secondary" size="sm" onClick={openScriptViewer}>

                  <Code2 size={14} className="mr-1 inline" />

                  View Script

                </Button>

              </div>

              <dl className="mt-4 space-y-3 text-sm">

                <div className="flex justify-between gap-3">

                  <dt className="text-slate-500">Automation status</dt>

                  <dd className="font-medium">{testCase.automationStatus}</dd>

                </div>

                <div className="flex justify-between gap-3">

                  <dt className="text-slate-500">Script path</dt>

                  <dd className="max-w-[16rem] truncate font-mono text-xs text-right">{testCase.testFile || "—"}</dd>

                </div>

              </dl>

            </div>



            <div className="rounded-xl border border-slate-100 p-5">

              <div>

                <Input

                  label="Expected result"

                  value={expectedResult}

                  onChange={(event) => setExpectedResult(event.target.value)}

                  placeholder="Welcome to Dashboard"

                />

                <p className="mt-2 text-xs text-slate-500">

                  Optional while drafting. When provided, Run Test checks that this text is visible on the page after ACT.

                </p>

              </div>

            </div>

          </div>



          <div className="rounded-xl border border-slate-100 p-5">

            <h2 className="flex items-center gap-2 font-semibold">

              <CirclePlay size={16} className="text-indigo-600" />

              RESULT

            </h2>

            {running || runPhase ? (

              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-indigo-700">

                <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-600" />

                {runPhase || "Preparing test..."}

              </p>

            ) : !lastResult ? (

              <p className="mt-4 text-sm text-slate-500">Run the test to see pass/fail here.</p>

            ) : (

              <dl className="mt-4 space-y-3 text-sm">

                <div className="flex justify-between gap-3">

                  <dt className="text-slate-500">Outcome</dt>

                  <dd

                    className={`font-semibold ${lastResult.status === "Passed" ? "text-teal-700" : "text-red-600"}`}

                  >

                    {lastResult.status === "Passed" ? "PASS" : "FAIL"}

                  </dd>

                </div>

                <div className="flex justify-between gap-3">

                  <dt className="text-slate-500">Duration</dt>

                  <dd className="font-medium">{lastResult.duration.toFixed(2)}s</dd>

                </div>

                {lastResult.error && (

                  <div>

                    <dt className="text-slate-500">Error</dt>

                    <dd className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-red-200">

                      {lastResult.error}

                    </dd>

                  </div>

                )}

              </dl>

            )}

          </div>

        </div>

      </div>



      <Modal

        open={scriptOpen}

        onClose={() => setScriptOpen(false)}

        title="Playwright script"

        description={scriptPath || "Python Playwright test for this case"}

        panelClassName="max-w-4xl"

        footer={

          <>

            <Button type="button" variant="secondary" onClick={() => setScriptOpen(false)}>Close</Button>

            <Button type="button" onClick={handleSaveScript} loading={scriptSaving} disabled={scriptLoading}>

              Save Script

            </Button>

          </>

        }

      >

        {scriptLoading ? (

          <p className="text-sm text-slate-500">Loading script...</p>

        ) : (

          <>

            {!scriptContent.trim() ? (

              <p className="mb-3 text-sm text-slate-500">

                No Playwright script is saved for this test case yet. Use <strong>Record Test</strong> to generate one

                from browser actions, or paste a Python Playwright script below and click <strong>Save Script</strong>.

              </p>

            ) : null}

            <textarea

              className="min-h-[320px] w-full rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-xs text-slate-100"

              value={scriptContent}

              onChange={(event) => setScriptContent(event.target.value)}

              spellCheck={false}

            />

            {scriptPath ? (

              <p className="mt-2 font-mono text-xs text-slate-500">File: {scriptPath}</p>

            ) : null}

          </>

        )}

      </Modal>



      <Modal

        open={historyOpen}

        onClose={() => {

          setHistoryOpen(false);

          setSelectedVersion(null);

        }}

        title="Version history"

        description="Published snapshots of this test case"

        panelClassName="max-w-3xl"

        footer={

          <Button type="button" variant="secondary" onClick={() => setHistoryOpen(false)}>Close</Button>

        }

      >

        {versions.length === 0 ? (

          <p className="text-sm text-slate-500">No published versions yet.</p>

        ) : (

          <div className="grid gap-4 md:grid-cols-2">

            <ul className="space-y-2">

              {versions.map((version) => (

                <li key={version.versionNumber}>

                  <button

                    type="button"

                    onClick={() => viewVersion(version.versionNumber)}

                    className="w-full rounded-lg border border-slate-100 px-3 py-2 text-left text-sm hover:border-indigo-200"

                  >

                    <span className="font-medium">{version.label}</span>

                    <span className="mt-1 block text-xs text-slate-500">{version.publishedAt}</span>

                  </button>

                </li>

              ))}

            </ul>

            <div className="rounded-lg border border-slate-100 p-3 text-sm">

              {!selectedVersion ? (

                <p className="text-slate-500">Select a version to view its snapshot.</p>

              ) : (

                <dl className="space-y-2">

                  <div><dt className="text-slate-500">Name</dt><dd>{selectedVersion.name}</dd></div>

                  <div><dt className="text-slate-500">Classification</dt><dd>{selectedVersion.category} · {selectedVersion.scenario}</dd></div>

                  <div><dt className="text-slate-500">Start path</dt><dd className="font-mono text-xs">{selectedVersion.startPath}</dd></div>

                  <div><dt className="text-slate-500">Expected result</dt><dd>{selectedVersion.expectedResult || "—"}</dd></div>

                  <div><dt className="text-slate-500">Script</dt><dd className="font-mono text-xs">{selectedVersion.testFile || "—"}</dd></div>

                  {selectedVersion.scriptSnapshot ? (

                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-100">

                      {selectedVersion.scriptSnapshot}

                    </pre>

                  ) : null}

                </dl>

              )}

            </div>

          </div>

        )}

      </Modal>

    </div>

  );

}

export default TestCaseDetailPage;


