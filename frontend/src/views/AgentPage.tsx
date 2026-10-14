"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useNavigate, useParams } from "@/lib/navigation";
import { api, type AgentJob, type AuthProfileSummary, type EnvironmentSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, FieldLabel } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { usePublishEntityName } from "@/components/layout/shell-context";

function joinUrl(base: string, startPath: string): string {
  const path = startPath.trim() || "/";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  let url: URL;
  try {
    url = new URL(base.trim());
  } catch {
    const root = base.trim().replace(/\/$/, "");
    return normalized === "/" ? root : `${root}${normalized}`;
  }
  const basePath = url.pathname.replace(/\/$/, "");
  if (normalized === "/") url.pathname = basePath || "/";
  else if (basePath && (normalized === basePath || normalized.startsWith(`${basePath}/`))) url.pathname = normalized;
  else url.pathname = `${basePath}${normalized}`.replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function AgentPage() {
  const { id: projectId = "" } = useParams();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [profiles, setProfiles] = useState<AuthProfileSummary[]>([]);
  const [prompt, setPrompt] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [authProfileId, setAuthProfileId] = useState("");
  const [startPath, setStartPath] = useState("/");
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
    if (!projectId || !job || job.phase !== "recording") return;
    const timer = window.setInterval(() => {
      api
        .agentJob(projectId, job.id)
        .then((next) => {
          if (next.phase !== "recording") setJob(next);
        })
        .catch((err: Error) => setError(err.message));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [projectId, job]);

  const environment = environments.find((item) => item.id === environmentId);

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
        startPath: startPath.trim() || "/",
        startUrl: joinUrl(environment.baseUrl, startPath),
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
      if (saved.testCaseId) navigate(`/projects/${projectId}/test-cases/${saved.testCaseId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The draft could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer width="form">
      <PageHeader
        title="Agent"
        description="Describe a flow. Review the steps, then the worker records them into a draft test case."
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      {loading ? <p className="text-[13px] text-muted-foreground">Loading environments…</p> : null}

      {!job || job.phase === "rejected" ? (
        <Card>
          <CardHeader>
            <CardTitle>What should this test do?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <FieldLabel htmlFor="agent-prompt" required>
                Description
              </FieldLabel>
              <Textarea
                id="agent-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Open curricula and confirm Algebra is listed."
                rows={4}
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
            <Input label="Start path" value={startPath} onChange={(event) => setStartPath(event.target.value)} />
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
            <Button onClick={() => void plan()} loading={busy} disabled={!prompt.trim() || !environment}>
              {!busy ? <Sparkles /> : null} Plan the test
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {job && job.phase !== "rejected" ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {job.phase === "review"
                ? "Review the plan"
                : job.phase === "draft" || job.phase === "saved"
                  ? "Draft test"
                  : job.phase === "recording"
                    ? "Recording"
                    : "Recording stopped"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {job.steps.map((step, index) => (
                <li key={`${step.action}-${index}`}>
                  {step.action} {step.target}
                  {step.value ? ` “${step.value}”` : ""}
                </li>
              ))}
            </ol>
            {job.expected ? <p className="text-[13px] text-muted-foreground">Expected: {job.expected}</p> : null}
            {job.phase === "recording" ? (
              <p className="text-[13px] text-muted-foreground">The worker is opening the page and recording the steps.</p>
            ) : null}
            {job.phase === "needs_choice" || job.phase === "failed" ? (
              <Alert variant="error">{job.error || "Recording stopped."}</Alert>
            ) : null}
            {job.script ? (
              <pre className="max-h-80 overflow-auto rounded-md border border-border bg-elevated p-3 text-xs">{job.script}</pre>
            ) : null}
          </CardContent>
          <CardFooter>
            {job.phase === "review" ? (
              <>
                <Button variant="outline" onClick={() => void decide(false)} disabled={busy}>
                  Reject
                </Button>
                <Button onClick={() => void decide(true)} loading={busy}>
                  Accept and record
                </Button>
              </>
            ) : null}
            {job.phase === "draft" || job.phase === "saved" ? (
              <Button onClick={() => void saveDraft()} loading={busy}>
                Save as test case
              </Button>
            ) : null}
            {job.phase === "failed" || job.phase === "needs_choice" ? (
              <Button variant="outline" onClick={() => setJob(null)}>
                Start over
              </Button>
            ) : null}
          </CardFooter>
        </Card>
      ) : null}
    </PageContainer>
  );
}
