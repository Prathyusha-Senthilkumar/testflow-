"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, Copy, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "@/lib/navigation";
import { api, type AgentCase, type AgentJob, type AgentPageLink, type AuthProfileSummary, type EnvironmentSummary } from "@/lib/api";
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
import { RunStatusBadge } from "@/components/runs/RunStatusBadge";
import { CategoryMultiSelect } from "@/components/suites/CategoryMultiSelect";
import { type SuiteCategory } from "@/lib/suiteCategory";
import { watchBatch, watchRun } from "@/lib/watchedRuns";

const WAITING = new Set(["discovering", "planning", "recording"]);
const STAGES = ["describe", "recommend", "record"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABELS: Record<Stage, string> = {
  describe: "Test description",
  recommend: "Recommended cases",
  record: "Record cases",
};

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
  const [reply, setReply] = useState("");
  const [pageNote, setPageNote] = useState("");
  const [stage, setStage] = useState<Stage>("describe");
  const stageRank = useRef(0);
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
          const before = (job.cases || []).map((item) => `${item.phase}:${item.error || ""}:${item.diary?.length || 0}:${item.script?.length || 0}`).join("|");
          const after = (next.cases || []).map((item) => `${item.phase}:${item.error || ""}:${item.diary?.length || 0}:${item.script?.length || 0}`).join("|");
          const diaryChanged = (next.diary || []).length !== (job.diary || []).length || next.script !== job.script;
          if (next.phase !== job.phase || next.error !== job.error || before !== after || diaryChanged) setJob(next);
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
  const furthest = furthestStage(job, showRecording);

  useEffect(() => {
    if (!job) {
      setStage("describe");
      stageRank.current = 0;
      return;
    }
    const rank = STAGES.indexOf(furthest);
    if (rank > stageRank.current) setStage(furthest);
    stageRank.current = rank;
  }, [job, furthest]);

  async function plan(description = prompt) {
    if (!environment) {
      setError("Choose an environment.");
      return;
    }
    const text = description.trim();
    if (!text) {
      setError("Describe what to test.");
      return;
    }
    setBusy(true);
    setError("");
    setPrompt(text);
    try {
      const created = await api.createAgentJob(projectId, {
        prompt: text,
        environmentId: environment.id,
        authProfileId: authProfileId || undefined,
      });
      setJob(created);
      setSelected([]);
      setRunNotice("");
      setPageNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The planner did not start.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!job || !reply.trim()) return;
    setBusy(true);
    setError("");
    try {
      const next = await api.replyToAgent(projectId, job.id, reply.trim());
      setJob(next);
      setReply("");
      setSelected((next.cases || []).map((item) => item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The correction could not be applied.");
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
      watchBatch({ kind: "batch", batchId: started.batchId, projectId, label: `${started.suiteName || "Suite"} run` });
      return `/runs/batches/${started.batchId}`;
    }
    if (savedCases.length > 1 && saved.suiteId && (saved.cases || []).filter((item) => item.testCaseId).length === savedCases.length) {
      const started = await api.startSuiteRun(projectId, saved.suiteId, environmentId);
      watchBatch({ kind: "batch", batchId: started.batchId, projectId, label: `${started.suiteName || "Suite"} run` });
      return `/runs/batches/${started.batchId}`;
    }
    for (const item of savedCases) {
      if (!item.testCaseId) continue;
      const testCase = await api.testCase(projectId, item.testCaseId);
      if (!testCase.testFile) throw new Error("This test case has no recorded steps yet.");
      const execution = await api.startExecution({
        projectId,
        testCaseId: testCase.id,
        testCaseCode: testCase.code,
        scriptPath: testCase.testFile,
        environmentId: environmentId || undefined,
      });
      watchRun({
        jobId: execution.jobId,
        projectId,
        testCaseId: testCase.id,
        code: testCase.code,
        name: testCase.name,
        testRunId: execution.testRunId,
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
    <PageContainer className="min-h-full">
      <PageHeader
        title="Agent"
        description="Describe the test, correct the recommendations in the conversation, then approve the recording."
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      {loading ? <p className="text-[13px] text-muted-foreground">Loading environments…</p> : null}

      <AgentStepBar stage={stage} furthest={furthest} onChange={setStage} />

      {stage === "describe" ? (
        <StepFrame
          title="What should this test do?"
          placement="bottom"
          action={
            <Button onClick={() => void plan()} loading={busy || finding} disabled={!prompt.trim() || !environment || finding}>
              Continue
              {!busy && !finding ? <ArrowRight /> : null}
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col">
              <FieldLabel htmlFor="agent-prompt" required>
                Description
              </FieldLabel>
              <Textarea
                id="agent-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="On curricula, check if Algebra, Java, and curr are listed."
                className="field-sizing-fixed min-h-48"
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
          </div>
        </StepFrame>
      ) : null}

      {stage === "recommend" ? (
        <StepFrame
          title="Choose cases to record"
          description="This step only chooses what to record. Nothing is recorded yet."
          placement="bottom"
          fill
          action={
            job?.phase === "review" ? (
              <>
                <Button
                  variant="destructive"
                  onClick={() => void decide(false)}
                  disabled={busy || ((job.cases || []).length > 0 && recommended.length === 0)}
                >
                  Disapprove
                </Button>
                <Button
                  onClick={() => void decide(true)}
                  loading={busy}
                  disabled={(job.cases || []).length > 0 && recommended.length === 0}
                >
                  Approve and record
                </Button>
              </>
            ) : job?.phase === "needs_choice" ? (
              <Button onClick={() => void plan(`${prompt.trim()}\n${pageNote.trim()}`)} loading={busy} disabled={busy || !pageNote.trim()}>
                Plan again
              </Button>
            ) : (
              <Button disabled loading={finding || busy}>
                {finding ? "Finding pages…" : "Continue"}
              </Button>
            )
          }
        >
          <div className="flex flex-col gap-4">
            {finding ? (
              <LoadingSpinner compact label="Finding pages and writing the recommendations. Nothing is clicked yet." />
            ) : null}
            {job?.phase === "rejected" ? (
              <p className="text-[13px] text-muted-foreground">This plan was rejected. Change the description and plan again.</p>
            ) : null}
            {job && !finding && job.phase !== "rejected" && (job.cases || []).length > 1 ? (
              <p className="text-[13px] text-muted-foreground">
                {job.phase === "review"
                  ? `${job.cases?.length} test cases. Select the ones to record.`
                  : `${job.cases?.length} test cases. Saved cases are grouped into one suite.`}
              </p>
            ) : null}
            {job && !finding && job.phase !== "rejected" && (job.cases || []).length > 0 ? (
              <CaseMilestones
                job={job}
                cases={job.cases || []}
                mode="plan"
                selected={job.phase === "review" ? selected : undefined}
                onToggle={job.phase === "review" ? toggleSelected : undefined}
                onToggleAll={job.phase === "review" ? toggleAll : undefined}
              />
            ) : null}
            {job && !finding && job.phase !== "rejected" && !(job.cases || []).length && job.steps.length > 0 ? (
              <MilestoneList
                title="Planned steps"
                items={milestonesFor(job.steps, job.expected, "waiting")}
              />
            ) : null}
            {job && job.phase === "failed" && !showRecording ? (
              <Alert variant="error">{job.error || "The plan stopped."}</Alert>
            ) : null}
            {job && (job.phase === "review" || job.phase === "needs_choice") ? (
              <AgentThread
                note={(job.messages || []).filter((message) => message.role === "assistant").at(-1)?.text}
                reply={reply}
                onReply={setReply}
                sending={busy || finding}
                onSend={() => void sendReply()}
              />
            ) : null}
            {job?.error && job.phase === "review" ? <Alert variant="error">{job.error}</Alert> : null}
            {job?.phase === "needs_choice" ? (
              <PageChoices
                prompt={prompt}
                pages={job.pages || []}
                note={pageNote}
                busy={busy}
                onNote={setPageNote}
                onChoose={(path) => void choosePage(path)}
              />
            ) : null}
          </div>
        </StepFrame>
      ) : null}

      {stage === "record" ? (
        <StepFrame
          title="Review the result"
          description="This step shows the result of each case. The steps stay on Recommended cases."
          placement="bottom"
          fill
          action={
            job && (job.phase === "draft" || job.phase === "saved" || (job.phase === "failed" && showRecording)) ? (
              job.phase === "draft" || job.phase === "saved" ? (
                (job.cases || []).length > 0 ? (
                  <>
                    <Button
                      onClick={() => void saveSelected(true)}
                      loading={busy}
                      disabled={runnable.length === 0 || (needsCategory && suiteCategories.length === 0)}
                    >
                      Approve and run
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void saveSelected(false)}
                      disabled={busy || runnable.length === 0 || (needsCategory && suiteCategories.length === 0)}
                    >
                      Approve
                    </Button>
                    <Button variant="destructive" onClick={() => void deleteSelected()} disabled={busy || chosen.length === 0}>
                      Disapprove
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
              )
            ) : (
              <Button disabled loading={job?.phase === "recording"}>
                {job?.phase === "recording" ? "Recording…" : "Approve and run"}
              </Button>
            )
          }
        >
          <div className="flex flex-col gap-4">
            {job?.phase === "recording" && !(job.cases || []).length ? (
              <p className="text-[13px] text-muted-foreground">Recording. The result shows here when it finishes.</p>
            ) : null}
            {showRecording && job ? (
              <CaseMilestones
                job={job}
                cases={job.cases || []}
                mode="record"
                running={job.phase === "recording"}
                selected={job.phase === "recording" ? undefined : selected}
                onToggle={job.phase === "recording" ? undefined : toggleSelected}
                onToggleAll={job.phase === "recording" ? undefined : toggleAll}
              />
            ) : null}
            {job && job.phase !== "recording" && !(job.cases || []).length && job.script ? (
              <ScriptBlock script={job.script} />
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
          </div>
        </StepFrame>
      ) : null}
    </PageContainer>
  );
}

function furthestStage(job: AgentJob | null, showRecording: boolean): Stage {
  if (showRecording) return "record";
  if (job) return "recommend";
  return "describe";
}

function AgentStepBar({
  stage,
  furthest,
  onChange,
}: {
  stage: Stage;
  furthest: Stage;
  onChange: (stage: Stage) => void;
}) {
  const far = STAGES.indexOf(furthest);
  return (
    <nav aria-label="Agent steps" className="w-full rounded-lg border border-border bg-card px-2 py-2">
      <ol className="grid w-full grid-cols-3 gap-1">
        {STAGES.map((id, index) => {
          const active = stage === id;
          const enabled = index <= far;
          const done = index < far && !active;
          return (
            <li key={id} className="min-w-0">
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                disabled={!enabled}
                onClick={() => onChange(id)}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  active && "bg-primary text-primary-foreground",
                  !active && enabled && "text-muted-foreground hover:bg-state-hover hover:text-foreground",
                  !enabled && "cursor-default text-muted-foreground/45"
                )}
              >
                <span className="inline-flex size-4 items-center justify-center text-xs font-semibold tabular-nums">
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className="truncate">{STAGE_LABELS[id]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepFrame({
  title,
  description,
  action,
  placement = "side",
  fill = false,
  children,
}: {
  title: string;
  description?: string;
  action: ReactNode;
  placement?: "side" | "bottom";
  fill?: boolean;
  children: ReactNode;
}) {
  const body = (
    <Card className={cn(fill && "flex h-full min-h-0 flex-1 flex-col")}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-[13px] text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className={cn(fill && "min-h-0 flex-1")}>{children}</CardContent>
      {placement === "bottom" ? (
        <CardFooter className={cn(fill && "sticky bottom-0 z-10 mt-auto bg-card")}>{action}</CardFooter>
      ) : null}
    </Card>
  );
  if (placement === "bottom") {
    return fill ? <div className="flex min-h-0 flex-1 flex-col">{body}</div> : body;
  }
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(13rem,1fr)]">
      {body}
      <div className="flex flex-col gap-2 lg:sticky lg:top-4">{action}</div>
    </div>
  );
}

function pageMatch(prompt: string, page: AgentPageLink): number {
  const words = prompt.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  if (words.length === 0) return 0;
  const haystack = `${page.name} ${page.path}`.toLowerCase();
  const hits = words.filter((word) => haystack.includes(word)).length;
  return Math.round((hits / words.length) * 100);
}

function PageChoices({
  prompt,
  pages,
  note,
  busy,
  onNote,
  onChoose,
}: {
  prompt: string;
  pages: AgentPageLink[];
  note: string;
  busy: boolean;
  onNote: (value: string) => void;
  onChoose: (path: string) => void;
}) {
  const ranked = [...pages].sort((a, b) => pageMatch(prompt, b) - pageMatch(prompt, a));
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">Pages found</p>
        <p className="text-[13px] text-muted-foreground">
          Match is how many words from your description appear in the page name. Choose the page this test should use.
        </p>
      </div>
      {ranked.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No pages were found. Add a detail below and plan again.</p>
      ) : (
        ranked.map((page) => (
          <Button
            key={`${page.path}-${page.name}`}
            variant="outline"
            className="h-auto justify-between gap-3 py-2"
            disabled={busy}
            onClick={() => onChoose(page.path)}
          >
            <span className="min-w-0 truncate text-left">
              {page.name} · {page.path}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{pageMatch(prompt, page)}% match</span>
          </Button>
        ))
      )}
      <div className="flex flex-col">
        <FieldLabel htmlFor="agent-page-note">Add a detail</FieldLabel>
        <Textarea
          id="agent-page-note"
          value={note}
          onChange={(event) => onNote(event.target.value)}
          placeholder="The curricula list is under the Curricula tab."
          className="field-sizing-fixed min-h-20"
        />
      </div>
    </div>
  );
}

function CaseResult({ item, running }: { item: AgentCase; running: boolean }) {
  const passed = item.phase === "recorded" || item.phase === "draft" || item.phase === "saved";
  const failed = item.phase === "failed";
  const status = running ? "running" : failed ? "failed" : passed ? "passed" : "running";
  const label = running ? "Recording" : failed ? "Failed" : passed ? "Passed" : "Recording";
  const page = [...(item.diary || [])].reverse().find((line) => line.url)?.url;
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Result</p>
        <RunStatusBadge status={status} label={label} />
      </div>
      <dl className="grid gap-3 px-4 py-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Path</dt>
          <dd className="mt-0.5 truncate text-[13px] font-medium">{item.path || "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Expected result</dt>
          <dd className="mt-0.5 text-[13px] font-medium">{item.expected || "—"}</dd>
        </div>
        {page ? (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Page</dt>
            <dd className="mt-0.5 truncate text-[13px] font-medium">{page}</dd>
          </div>
        ) : null}
        {item.error ? (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Error</dt>
            <dd className="mt-0.5 text-[13px] font-medium text-destructive">{item.error}</dd>
          </div>
        ) : null}
      </dl>
      {item.script ? (
        <pre className="max-h-72 overflow-auto border-t border-border px-4 py-3 font-mono text-xs whitespace-pre-wrap">{item.script}</pre>
      ) : null}
    </div>
  );
}

function ScriptBlock({ script }: { script: string }) {
  if (!script.trim()) return null;
  return (
    <div className="rounded-lg border border-border">
      <p className="border-b border-border px-4 py-3 text-sm font-semibold">Generated code</p>
      <pre className="max-h-72 overflow-auto px-4 py-3 font-mono text-xs whitespace-pre-wrap">{script}</pre>
    </div>
  );
}

type MilestoneState = "done" | "current" | "waiting" | "failed";

type MilestoneItem = {
  title: string;
  detail?: string;
  state: MilestoneState;
  aside?: string;
};

function debugRecord(job: AgentJob, item: AgentCase) {
  const diary = item.diary ?? [];
  const failedStep = item.steps[diary.length] ?? null;
  const openedUrl = [...diary].reverse().find((line) => line.url)?.url ?? null;
  let openedPath = item.path;
  try {
    if (openedUrl) openedPath = new URL(openedUrl).pathname;
  } catch {
    openedPath = item.path;
  }
  const pages = (job.pages ?? []).map((page) => ({
    name: page.name,
    path: page.path,
    controls: (page.controls ?? []).map((control) => ({
      role: control.role,
      name: control.name,
      ...(control.path ? { path: control.path } : {}),
    })),
  }));
  const openedPage = pages.filter((page) => page.path === openedPath || page.path === item.path);
  return {
    summary: failedStep
      ? `Step ${diary.length + 1} failed: ${failedStep.action} "${failedStep.target}". ${item.error ?? ""}`.trim()
      : item.error ?? "Recording failed.",
    error: item.error ?? null,
    jobError: job.error ?? null,
    diagnosis: diagnosisFor(item, failedStep, openedUrl),
    prompt: job.prompt,
    case: {
      id: item.id,
      name: item.name,
      phase: item.phase,
      path: item.path,
      expected: item.expected,
    },
    failedStep: failedStep
      ? {
          number: diary.length + 1,
          action: failedStep.action,
          target: failedStep.target,
          value: failedStep.value,
          valueWasEmpty: !failedStep.value.trim(),
        }
      : null,
    completedStepCount: diary.length,
    openedUrl,
    openedPage,
    discoveredPages: pages,
    steps: item.steps,
    diary,
  };
}

function diagnosisFor(item: AgentCase, failedStep: AgentCase["steps"][number] | null, openedUrl: string | null): string {
  if (item.error === "Nothing on this page can be used as the search text.") {
    return "The prompt did not name the text to type, so the fill value is empty. After the goto, the recorder looked for an item title on the opened page that is not the current screen. It found none, so the fill did not run. The expected text is the screen name taken from the prompt. Steps after the diary did not run.";
  }
  if (!failedStep) {
    return "Every stored step completed. The failure is the result check, not one of the actions. The diary is the list of actions that ran.";
  }
  const failedNumber = (item.diary?.length ?? 0) + 1;
  return `The diary has the actions that finished. Step ${failedNumber} is the one that threw. The page at that moment was ${openedUrl ?? item.path}. Later steps did not run. The case error is the recorder exception, not a separate failure for each red row.`;
}

function ErrorJson({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <p className="text-sm font-semibold">Error</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto bg-muted/40 p-3 font-mono text-xs leading-5 text-foreground">{text}</pre>
    </div>
  );
}

function CaseMilestones({
  job,
  cases,
  mode,
  running = false,
  selected,
  onToggle,
  onToggleAll,
}: {
  job?: AgentJob;
  cases: AgentCase[];
  mode: "plan" | "record";
  running?: boolean;
  selected?: string[];
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
}) {
  if (cases.length === 0) {
    return running ? null : <p className="text-[13px] text-muted-foreground">No cases were recorded.</p>;
  }
  const choosing = Boolean(onToggle && selected);
  const choosable = mode === "record" ? cases.filter(canChoose) : cases;
  const all = choosing && choosable.length > 0 && choosable.every((item) => selected?.includes(item.id));
  return (
    <div className="flex flex-col gap-5">
      {choosing && choosable.length > 1 ? (
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Checkbox
            aria-label={mode === "plan" ? "Select all recommended test cases" : "Select all test cases"}
            checked={all ? true : selected?.some((id) => choosable.some((item) => item.id === id)) ? "indeterminate" : false}
            onCheckedChange={onToggleAll}
          />
          Select all
        </label>
      ) : null}
      {cases.map((item, index) => {
        const recorded = item.phase === "recorded" || item.phase === "draft" || item.phase === "saved";
        const failed = item.phase === "failed";
        const pending = mode === "record" && running && !recorded && !failed;
        const choice = choosing && (mode === "plan" || canChoose(item));
        return (
          <section key={item.id || `${item.path}-${index}`} className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              {choice ? (
                <Checkbox
                  className="mt-0.5"
                  aria-label={`Select ${item.name}`}
                  checked={selected?.includes(item.id)}
                  onCheckedChange={() => onToggle?.(item.id)}
                />
              ) : null}
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.name}</p>
                {mode === "plan" ? <p className="truncate text-[13px] text-muted-foreground">{item.path}</p> : null}
                {mode === "plan" && item.error ? <p className="text-[13px] text-destructive">{item.error}</p> : null}
              </div>
            </div>
            {mode === "plan" ? (
              <MilestoneList title="Steps" items={milestonesFor(item.steps, item.expected, "waiting", item.diary?.length ?? 0)} />
            ) : (
              <CaseResult item={item} running={pending} />
            )}
            {mode === "record" && failed && job ? <ErrorJson value={debugRecord(job, item)} /> : null}
          </section>
        );
      })}
    </div>
  );
}

function MilestoneList({ title, items }: { title: string; items: MilestoneItem[] }) {
  const done = items.filter((item) => item.state === "done").length;
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="size-4 text-muted-foreground" />
          {title}
        </div>
        <p className="text-[13px] text-muted-foreground">
          {done} of {items.length} done
        </p>
      </div>
      <ol className="px-4 py-4">
        {items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <MilestoneMark state={item.state} index={index} />
              {index < items.length - 1 ? (
                <span className={cn("my-1 w-px flex-1", item.state === "done" ? "bg-success/70" : "bg-border")} />
              ) : null}
            </div>
            <div className={cn("flex min-w-0 flex-1 items-start justify-between gap-4", index < items.length - 1 && "pb-5")}>
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                {item.detail ? <p className="text-[13px] text-muted-foreground">{item.detail}</p> : null}
              </div>
              {item.aside ? <p className="shrink-0 text-[13px] text-muted-foreground">{item.aside}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MilestoneMark({ state, index }: { state: MilestoneState; index: number }) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
        state === "done" && "border-success bg-success/15 text-success",
        state === "current" && "border-primary text-primary",
        state === "waiting" && "border-border text-muted-foreground",
        state === "failed" && "border-destructive bg-destructive/10 text-destructive"
      )}
    >
      {state === "done" ? <Check className="size-3.5" /> : index + 1}
    </span>
  );
}

const STEP_VERB: Record<string, string> = {
  goto: "Open",
  click: "Click",
  fill: "Fill",
  press: "Press",
};

function milestonesFor(
  steps: AgentJob["steps"],
  expected: string | undefined,
  status: MilestoneState,
  diaryCount = 0
): MilestoneItem[] {
  const items: MilestoneItem[] = steps.map((step, index) => {
    const failedHere = status === "failed" && index === diaryCount;
    const finished = status === "done" || (status === "failed" && index < diaryCount);
    return {
      title: `${index + 1}. ${STEP_VERB[step.action] || step.action}${step.target ? ` ${step.target}` : ""}`,
      detail: step.action === "fill" && step.value ? `Type “${step.value}”` : step.action === "goto" ? "" : step.value || "",
      state: finished ? "done" : failedHere ? "failed" : status === "current" && index === 0 ? "current" : "waiting",
      aside: failedHere ? "Failed" : status === "current" && index === 0 ? "Recording" : "",
    };
  });
  if (expected) {
    const confirmFailed = status === "failed" && diaryCount >= steps.length;
    items.push({
      title: `${items.length + 1}. Confirm the result`,
      detail: expected,
      state: status === "done" ? "done" : confirmFailed ? "failed" : "waiting",
      aside: confirmFailed ? "Failed" : "",
    });
  }
  if (items.length === 0) {
    items.push({
      title: "1. Run the check",
      state: status === "current" ? "current" : status,
      aside: status === "failed" ? "Failed" : status === "current" ? "Recording" : "",
    });
  }
  return items;
}

function canChoose(item: AgentCase) {
  return item.phase === "draft" || item.phase === "saved" || item.phase === "failed" || item.phase === "recorded";
}

function canSave(item: AgentCase) {
  return item.phase === "draft" || item.phase === "saved";
}

function AgentThread({
  note,
  reply,
  onReply,
  sending,
  onSend,
}: {
  note?: string;
  reply: string;
  onReply: (value: string) => void;
  sending: boolean;
  onSend: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {note ? <p className="text-[13px] text-muted-foreground">{note}</p> : null}
      <Textarea
        value={reply}
        onChange={(event) => onReply(event.target.value)}
        placeholder="These steps are one test case. Keep the click and the search together, and confirm only the item name."
        className="field-sizing-fixed min-h-20"
        disabled={sending}
      />
      <div className="flex justify-end">
        <Button variant="outline" onClick={onSend} disabled={sending || !reply.trim()} loading={sending}>
          Send correction
        </Button>
      </div>
    </div>
  );
}
