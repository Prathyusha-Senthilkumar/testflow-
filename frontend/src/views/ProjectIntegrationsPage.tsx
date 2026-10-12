"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useParams } from "@/lib/navigation";
import { api, type GitHubConnection, type GitHubConnectionInput } from "@/lib/api";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { GitHubConnectionCard } from "@/components/integrations/GitHubConnectionCard";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { usePublishEntityName } from "@/components/layout/shell-context";

export function ProjectIntegrationsPage() {
  const { id: projectId = "" } = useParams();
  const confirm = useConfirm();
  const [projectName, setProjectName] = useState("");
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  usePublishEntityName("project", projectId, projectName);

  useEffect(() => {
    if (!projectId) return;
    api
      .project(projectId)
      .then((project) => setProjectName(project.name))
      .catch(() => undefined);
    api
      .githubConnection(projectId)
      .then(setConnection)
      .catch((err: Error) => setLoadError(err.message || "Could not load the GitHub connection."));
  }, [projectId]);

  async function save(input: GitHubConnectionInput) {
    const wasConnected = Boolean(connection?.connected);
    setSaving(true);
    setSaveError("");
    try {
      const next = await api.saveGithubConnection(projectId, input);
      setConnection(next);
      toast.success(wasConnected ? "GitHub settings saved" : `Connected ${next.owner}/${next.repo}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save the GitHub connection.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect({ revoke }: { revoke: boolean }) {
    const repoName = connection?.owner && connection.repo ? `${connection.owner}/${connection.repo}` : "this repository";
    await confirm({
      title: revoke ? "Revoke the GitHub token?" : "Disconnect GitHub?",
      tone: "danger",
      confirmLabel: revoke ? "Revoke and disconnect" : "Disconnect",
      description: (
        <p>
          Failed tests will stop opening issues in <strong>{repoName}</strong>. The stored token is deleted from Attest
          {revoke ? " and GitHub revokes it, so it stops working everywhere it was used" : ""}. Issues already opened on
          GitHub stay there.
        </p>
      ),
      onConfirm: async () => {
        const result = await api.disconnectGithub(projectId, { revoke });
        setSaveError("");
        setConnection({
          connected: false,
          owner: null,
          repo: null,
          repoUrl: null,
          tokenHint: null,
          autoCreateIssues: true,
          connectedAt: null,
        });
        if (revoke && !result.revoked) toast.warning(result.message);
        else toast.success(result.message);
      },
    });
  }

  // A fresh key after each save or disconnect resets the card's form to the stored values.
  const cardKey = connection
    ? `${connection.connected}|${connection.connectedAt}|${connection.tokenHint}|${connection.autoCreateIssues}`
    : "loading";

  return (
    <PageContainer width="detail">
      <PageHeader title="Integrations" description="Connect this project to the tools your team already uses." />
      {loadError ? (
        <Alert variant="error" title="Could not load integrations">
          {loadError}
        </Alert>
      ) : (
        <GitHubConnectionCard
          key={cardKey}
          connection={connection}
          onSave={save}
          onDisconnect={(options) => void disconnect(options)}
          saving={saving}
          error={saveError}
        />
      )}
    </PageContainer>
  );
}

export default ProjectIntegrationsPage;
