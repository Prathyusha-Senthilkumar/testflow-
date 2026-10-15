"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useNavigate, useParams } from "@/lib/navigation";
import { api, type AgentCase, type AgentJob, type AuthProfileSummary, type EnvironmentSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldLabel } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { usePublishEntityName } from "@/components/layout/shell-context";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { CategoryMultiSelect } from "@/components/suites/CategoryMultiSelect";
import { type SuiteCategory } from "@/lib/suiteCategory";

const WAITING = new Set(["discovering", "planning", "recording"]);

export function AgentPage() {
  const { id: projectId = "" } = useParams();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [profiles, setProfiles] = useState<AuthProfileSummary[]>([]);
  const [prompt, setPrompt] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [authProfileId, setAuthProfileId] = useState("");
  const [job, setJob] = useState<AgentJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suiteCategories, setSuiteCategories] = useState<SuiteCategory[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [runNotice, setRunNotice] = useState("");
  const confirm = useConfirm();

  usePublishEntityName("project", projectId, projectName);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([api.project(projectId), api.environments(projectId), api.authProfiles(projectId)])
      .then(([project, envs, auths]) => {
        setProjectName(project.name);
        setEnvironments(envs);
        setProfiles(auths);
        const preferred = envs.find((item) => item.isDefault) || envs[0];
        if (preferred) setEnvironmentId(preferred.id);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !job || !WAITING.has(job.phase)) return;
    const timer = window.setInterval(() => {
      api
        .agentJob(projectId, job.id)
        .then((next) => {
          const before = (job.cases || []).map((item) => `${item.phase}:${item.error || ""}`).join("|");
          const after = (next.cases || []).map((item) => `${item.phase}:${item.error || ""}`).join("|");
          if (next.phase !== job.phase || next.error !== job.error || before !== after) setJob(next);
        })
        .catch((err: Error) => setError(err.message));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [projectId, job]);

  useEffect(() => {
    if (!job) return;
    if (job.phase === "review") {
      setSelected((job.cases || []).map((item) => item.id));
      return;
    }
    if (job.phase !== "draft" && job.phase !== "saved") return;
    setSelected((job.cases || []).filter(canSave).map((item) => item.id));
  }, [job?.id, job?.phase]);

  const environment = environments.find((item) => item.id === environmentId);
  const finding = job?.phase === "discovering" || job?.phase === "planning";
  const showRecording = Boolean(
    job &&
      (job.phase === "recording" ||
        job.phase === "draft" ||
        job.phase === "saved" ||
        (job.phase === "failed" && (job.cases || []).some((item) => item.phase === "failed" || item.phase === "recorded")))
  );

  async function plan() {
    if (!environment) {
      setError("Choose an environment.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api.createAgentJob(projectId, {
        prompt: prompt.trim(),
        environmentId: environment.id,
        authProfileId: authProfileId || undefined,
      });
      setJob(created);
      setSelected([]);
      setRunNotice("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The planner did not start.");
    } finally {
      setBusy(false);
    }
  }

  async function choosePage(path: string) {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      setJob(await api.chooseAgentPage(projectId, job.id, path));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That page could not be used.");
    } finally {
      setBusy(false);
    }
  }

  const recommended = (job?.cases || []).filter((item) => job?.phase === "review" && selected.includes(item.id));

  async function decide(accepted: boolean) {
    if (!job) return;
    const ids = (job.cases || []).length > 0 ? recommended.map((item) => item.id) : [];
    if ((job.cases || []).length > 0 && ids.length === 0) {
      setError("Choose a recommended test case.");
      return;
    }
    if (!accepted) {
      await confirm({
        title: ids.length > 1 ? `Reject ${ids.length} test cases?` : "Reject this test case?",
        description: "Rejected recommendations are removed. Nothing is recorded.",
        confirmLabel: "Reject",
        tone: "danger",
        onConfirm: async () => {
          const next = await api.approveAgentJob(projectId, job.id, false, ids);
          setJob(next);
          setSelected((next.cases || []).map((item) => item.id));
        },
      });
      return;
    }
    setBusy(true);
    setError("");
    try {
      setJob(await api.approveAgentJob(projectId, job.id, true, ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The plan could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  const chosen = (job?.cases || []).filter((item) => selected.includes(item.id));
  const runnable = chosen.filter(canSave);
  const needsCategory = runnable.length > 1 && !job?.suiteId;

  async function saveSelected(andRun: boolean) {
    if (!job) return;
    if (runnable.length === 0) {
      setError("Choose a recorded test case.");
      return;
    }
    if (needsCategory && suiteCategories.length === 0) {
      setError("Choose at least one category.");
      return;
    }
    setBusy(true);
    setError("");
    setRunNotice("");
    try {
      const previousSuite = job.suiteId;
      const saved = await api.saveAgentDraft(
        projectId,
        job.id,
        needsCategory ? suiteCategories : undefined,
        runnable.map((item) => item.id)
      );
      setJob(saved);
      const savedCases = (saved.cases || []).filter((item) => runnable.some((chosenItem) => chosenItem.id === item.id) && item.testCaseId);
      const leftovers = (saved.cases || []).filter((item) => item.phase === "draft" || item.phase === "recorded" || item.phase === "failed");
      setSelected(leftovers.filter(canChoose).map((item) => item.id));
      if (!andRun) {
        if (!leftovers.length) {
          if (saved.suiteId) navigate(`/projects/${projectId}/suites/${saved.suiteId}`);
          else if (saved.testCaseId) navigate(`/projects/${projectId}/test-cases/${saved.testCaseId}`);
        }
        return;
      }
      const href = await startSavedRun(saved, savedCases, previousSuite);
      if (leftovers.length) setRunNotice(href || "started");
      else if (href) navigate(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The draft could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function startSavedRun(saved: AgentJob, savedCases: AgentCase[], previousSuite?: string | null) {
    if (savedCases.length > 1 && saved.suiteId && saved.suiteId !== previousSuite) {
      const started = await api.startSuiteRun(projectId, saved.suiteId, environmentId);
      return `/runs/batches/${started.batchId}`;
    }
    if (savedCases.length > 1 && saved.suiteId && (saved.cases || []).filter((item) => item.testCaseId).length === savedCases.length) {
      const started = await api.startSuiteRun(projectId, saved.suiteId, environmentId);
      return `/runs/batches/${started.batchId}`;
    }
    for (const item of savedCases) {
      if (!item.testCaseId) continue;
      const testCase = await api.testCase(projectId, item.testCaseId);
      if (!testCase.testFile) throw new Error("This test case has no recorded steps yet.");
      await api.startExecution({
        projectId,
        testCaseId: testCase.id,
        testCaseCode: testCase.code,
        scriptPath: testCase.testFile,
        environmentId: environmentId || undefined,
      });
    }
    if (savedCases.length === 1 && savedCases[0].testCaseId) {
      return `/projects/${projectId}/test-cases/${savedCases[0].testCaseId}`;
    }
    return "";
  }

  function toggleSelected(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleAll() {
    const ids =
      job?.phase === "review"
        ? (job.cases || []).map((item) => item.id)
        : (job?.cases || []).filter(canChoose).map((item) => item.id);
    const all = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected(all ? [] : ids);
  }

  async function deleteSelected() {
    if (!job || chosen.length === 0) return;
    await confirm({
      title: chosen.length === 1 ? "Delete this test case?" : `Delete ${chosen.length} test cases?`,
      description: "Selected cases are removed from this recording. Cases that were already saved are deleted.",
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        const next = await api.removeAgentCases(projectId, job.id, chosen.map((item) => item.id));
        setJob(next);
        setSelected((next.cases || []).filter(canChoose).map((item) => item.id));
        setRunNotice("");
      },
    });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Agent"
        description="Describe one or more checks. Review the recommended cases, then watch them record."
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      {loading ? <p className="text-[13px] text-muted-foreground">Loading environments…</p> : null}

      <div className="grid items-stretch gap-4 lg:min-h-[calc(100dvh-10.5rem)] lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
      <Card className="flex h-full flex-col">
        <CardHeader>
          <CardTitle>What should this test do?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <div className="flex min-h-64 flex-1 flex-col">
            <FieldLabel htmlFor="agent-prompt" required>
              Description
            </FieldLabel>
            <Textarea
              id="agent-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="On curricula, confirm Algebra is listed, and confirm Java is listed."
              className="field-sizing-fixed min-h-64 flex-1"
            />
          </div>
          <Select
            label="Environment"
            required
            value={environmentId}
            onChange={setEnvironmentId}
            options={environments.map((item) => ({ value: item.id, label: item.name }))}
            placeholder="Choose an environment"
          />
          <Select
            label="Auth profile"
            value={authProfileId}
            onChange={setAuthProfileId}
            options={[
              { value: "", label: "No auth profile" },
              ...profiles.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
        </CardContent>
        <CardFooter>
          <Button onClick={() => void plan()} loading={busy || finding} disabled={!prompt.trim() || !environment || finding}>
            {!busy && !finding ? <Sparkles /> : null} Plan the test
          </Button>
        </CardFooter>
      </Card>

      <div className="grid gap-4 lg:grid-rows-2">
      <Card className="flex h-full flex-col">
        <CardHeader>
          <CardTitle>Recommended test cases</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          {!job ? (
            <p className="text-[13px] text-muted-foreground">Plan a test to see the recommended cases here.</p>
          ) : null}
          {finding ? (
            <LoadingSpinner compact label="Finding pages and writing the recommendations. Nothing is clicked yet." />
          ) : null}
            {job?.phase === "rejected" ? (
              <p className="text-[13px] text-muted-foreground">This plan was rejected. Change the description and plan again.</p>
            ) : null}
            {job && !finding && job.phase !== "rejected" && (job.cases || []).length > 1 ? (
              <p className="text-[13px] text-muted-foreground">
                {job.phase === "review"
                  ? `${job.cases?.length} test cases. Choose which ones to record.`
                  : `${job.cases?.length} test cases. Saved cases are grouped into one suite.`}
              </p>
            ) : null}
            {job && !finding && job.phase !== "rejected" && (job.cases || []).length > 0 ? (
              <CaseList
                cases={job.cases || []}
                selected={job.phase === "review" ? selected : undefined}
                onToggle={job.phase === "review" ? toggleSelected : undefined}
                onToggleAll={job.phase === "review" ? toggleAll : undefined}
              />
            ) : null}
            {job && !finding && job.phase !== "rejected" && !(job.cases || []).length && job.steps.length > 0 ? (
              <StepList steps={job.steps} expected={job.expected} path={job.startPath} />
            ) : null}
            {job && (job.phase === "needs_choice" || (job.phase === "failed" && !showRecording)) ? (
              <Alert variant="error">{job.error || "The plan stopped."}</Alert>
            ) : null}
            {job?.phase === "needs_choice" && job.pages && job.pages.length > 0 ? (
              <div className="flex flex-col gap-2">
                {job.pages.map((page) => (
                  <Button
                    key={`${page.path}-${page.name}`}
                    variant="outline"
                    disabled={busy}
                    onClick={() => void choosePage(page.path)}
                  >
                    {page.name} · {page.path}
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
          {job?.phase === "review" ? (
            <CardFooter className="flex-wrap">
              <Button
                variant="destructive"
                onClick={() => void decide(false)}
                disabled={busy || ((job.cases || []).length > 0 && recommended.length === 0)}
              >
                Reject
              </Button>
              <Button
                onClick={() => void decide(true)}
                loading={busy}
                disabled={(job.cases || []).length > 0 && recommended.length === 0}
              >
                Accept and record
              </Button>
            </CardFooter>
          ) : null}
      </Card>

      <Card className="flex h-full flex-col">
        <CardHeader>
          <CardTitle>Recording</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          {!showRecording ? (
            <p className="text-[13px] text-muted-foreground">Accept a plan to record the cases. Progress shows up here.</p>
          ) : null}
          {job?.phase === "recording" ? (
            <LoadingSpinner compact label="Recording the accepted cases, up to 3 at a time." />
          ) : null}
          {showRecording && job ? (
            <RecordingList
              cases={job.cases || []}
              running={job.phase === "recording"}
              selected={selected}
              onToggle={toggleSelected}
              onToggleAll={toggleAll}
            />
          ) : null}
          {job?.phase === "failed" && showRecording ? <Alert variant="error">{job.error || "Recording stopped."}</Alert> : null}
          {runNotice ? (
            <Alert
              variant="success"
              action={
                runNotice.startsWith("/") ? (
                  <Button variant="outline" onClick={() => navigate(runNotice)}>
                    View run
                  </Button>
                ) : undefined
              }
            >
              Saved the selected cases and started the run. The others are still here.
            </Alert>
          ) : null}
          {needsCategory && (job?.phase === "draft" || job?.phase === "saved") ? (
            <CategoryMultiSelect required value={suiteCategories} onChange={setSuiteCategories} />
          ) : null}
        </CardContent>
          {job && (job.phase === "draft" || job.phase === "saved" || (job.phase === "failed" && showRecording)) ? (
            <CardFooter className="flex-wrap">
              {job.phase === "draft" || job.phase === "saved" ? (
                (job.cases || []).length > 0 ? (
                  <>
                    <Button variant="destructive" onClick={() => void deleteSelected()} disabled={busy || chosen.length === 0}>
                      Delete
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void saveSelected(false)}
                      disabled={busy || runnable.length === 0 || (needsCategory && suiteCategories.length === 0)}
                    >
                      Save
                    </Button>
                    <Button
                      onClick={() => void saveSelected(true)}
                      loading={busy}
                      disabled={runnable.length === 0 || (needsCategory && suiteCategories.length === 0)}
                    >
                      Save and run
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => setJob(null)}>
                    Start over
                  </Button>
                )
              ) : (
                <Button variant="outline" onClick={() => setJob(null)}>
                  Start over
                </Button>
              )}
            </CardFooter>
          ) : null}
        </Card>
      </div>
      </div>
    </PageContainer>
  );
}

function CaseList({
  cases,
  selected,
  onToggle,
  onToggleAll,
}: {
  cases: AgentCase[];
  selected?: string[];
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
}) {
  const choosing = Boolean(onToggle && selected);
  const all = choosing && cases.length > 0 && cases.every((item) => selected?.includes(item.id));
  return (
    <div className="flex flex-col divide-y divide-border">
      {choosing && cases.length > 1 ? (
        <label className="flex items-center gap-2 pb-3 text-[13px] text-muted-foreground">
          <Checkbox
            aria-label="Select all recommended test cases"
            checked={all ? true : selected?.some((id) => cases.some((item) => item.id === id)) ? "indeterminate" : false}
            onCheckedChange={onToggleAll}
          />
          Select all
        </label>
      ) : null}
      {cases.map((item, index) => (
        <div key={item.id || `${item.path}-${index}`} className="flex items-start gap-2 py-3 first:pt-0 last:pb-0">
          {choosing ? (
            <Checkbox
              className="mt-0.5"
              aria-label={`Select ${item.name}`}
              checked={selected?.includes(item.id)}
              onCheckedChange={() => onToggle?.(item.id)}
            />
          ) : null}
          <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">
            {index + 1}. {item.name}
          </p>
          <p className="text-[13px] text-muted-foreground">Page: {item.path}</p>
          {item.steps.length > 0 ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {item.steps.map((step, stepIndex) => (
                <li key={`${step.action}-${stepIndex}`}>
                  {step.action} {step.target}
                  {step.value ? ` “${step.value}”` : ""}
                </li>
              ))}
            </ol>
          ) : null}
          {item.expected ? <p className="text-[13px] text-muted-foreground">Expected: {item.expected}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepList({
  steps,
  expected,
  path,
}: {
  steps: AgentJob["steps"];
  expected?: string;
  path?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {path ? <p className="text-[13px] text-muted-foreground">Page: {path}</p> : null}
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {steps.map((step, index) => (
          <li key={`${step.action}-${index}`}>
            {step.action} {step.target}
            {step.value ? ` “${step.value}”` : ""}
          </li>
        ))}
      </ol>
      {expected ? <p className="text-[13px] text-muted-foreground">Expected: {expected}</p> : null}
    </div>
  );
}

function canChoose(item: AgentCase) {
  return item.phase === "draft" || item.phase === "saved" || item.phase === "failed" || item.phase === "recorded";
}

function canSave(item: AgentCase) {
  return item.phase === "draft" || item.phase === "saved";
}

function RecordingList({
  cases,
  running,
  selected,
  onToggle,
  onToggleAll,
}: {
  cases: AgentCase[];
  running: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  if (cases.length === 0) {
    return running ? null : <p className="text-[13px] text-muted-foreground">No cases were recorded.</p>;
  }
  const choosable = cases.filter(canChoose);
  const all = choosable.length > 0 && choosable.every((item) => selected.includes(item.id));
  return (
    <div className="flex flex-col divide-y divide-border">
      {!running && choosable.length > 1 ? (
        <label className="flex items-center gap-2 pb-3 text-[13px] text-muted-foreground">
          <Checkbox
            aria-label="Select all test cases"
            checked={all ? true : selected.some((id) => choosable.some((item) => item.id === id)) ? "indeterminate" : false}
            onCheckedChange={onToggleAll}
          />
          Select all
        </label>
      ) : null}
      {cases.map((item, index) => {
        const pending = running && item.phase !== "failed" && item.phase !== "recorded" && item.phase !== "draft" && item.phase !== "saved";
        const done = item.phase === "recorded" || item.phase === "draft" || item.phase === "saved";
        const choice = !running && canChoose(item);
        return (
          <div key={item.id || `${item.path}-${index}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-start gap-2">
              {choice ? (
                <Checkbox
                  className="mt-0.5"
                  aria-label={`Select ${item.name}`}
                  checked={selected.includes(item.id)}
                  onCheckedChange={() => onToggle(item.id)}
                />
              ) : null}
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {index + 1}. {item.name}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">{item.path}</p>
                {item.error ? <p className="text-[13px] text-muted-foreground">{item.error}</p> : null}
              </div>
            </div>
            {pending ? <LoadingSpinner compact label="Recording…" /> : null}
            {done ? <p className="shrink-0 text-[13px] text-muted-foreground">Recorded</p> : null}
            {item.phase === "failed" ? <p className="shrink-0 text-[13px] text-muted-foreground">Failed</p> : null}
          </div>
        );
      })}
    </div>
  );
}
