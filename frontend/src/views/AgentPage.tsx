"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useNavigate, useParams } from "@/lib/navigation";
import { api, type AgentCase, type AgentJob, type AuthProfileSummary, type EnvironmentSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { usePublishEntityName } from "@/components/layout/shell-context";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

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

  async function decide(accepted: boolean) {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      setJob(await api.approveAgentJob(projectId, job.id, accepted));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The plan could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api.saveAgentDraft(projectId, job.id);
      setJob(saved);
      if (saved.suiteId) navigate(`/projects/${projectId}/suites/${saved.suiteId}`);
      else if (saved.testCaseId) navigate(`/projects/${projectId}/test-cases/${saved.testCaseId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The draft could not be saved.");
    } finally {
      setBusy(false);
    }
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
                {job.cases?.length} test cases. Saved cases are grouped into one suite.
              </p>
            ) : null}
            {job && !finding && job.phase !== "rejected" && (job.cases || []).length > 0 ? <CaseList cases={job.cases || []} /> : null}
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
            <CardFooter>
              <Button variant="outline" onClick={() => void decide(false)} disabled={busy}>
                Reject
              </Button>
              <Button onClick={() => void decide(true)} loading={busy}>
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
          {showRecording && job ? <RecordingList cases={job.cases || []} running={job.phase === "recording"} /> : null}
          {job?.phase === "failed" && showRecording ? <Alert variant="error">{job.error || "Recording stopped."}</Alert> : null}
        </CardContent>
          {job && (job.phase === "draft" || job.phase === "saved" || (job.phase === "failed" && showRecording)) ? (
            <CardFooter>
              {job.phase === "draft" || job.phase === "saved" ? (
                <Button onClick={() => void saveDraft()} loading={busy}>
                  {(job.cases?.length || 0) > 1 ? "Save test cases" : "Save as test case"}
                </Button>
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

function CaseList({ cases }: { cases: AgentCase[] }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {cases.map((item, index) => (
        <div key={item.id || `${item.path}-${index}`} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
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

function RecordingList({ cases, running }: { cases: AgentCase[]; running: boolean }) {
  if (cases.length === 0) {
    return running ? null : <p className="text-[13px] text-muted-foreground">No cases were recorded.</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-border">
      {cases.map((item, index) => {
        const pending = running && item.phase !== "failed" && item.phase !== "recorded" && item.phase !== "draft" && item.phase !== "saved";
        const done = item.phase === "recorded" || item.phase === "draft" || item.phase === "saved";
        return (
          <div key={item.id || `${item.path}-${index}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {index + 1}. {item.name}
              </p>
              <p className="truncate text-[13px] text-muted-foreground">{item.path}</p>
              {item.error ? <p className="text-[13px] text-muted-foreground">{item.error}</p> : null}
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
