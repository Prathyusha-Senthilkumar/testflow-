"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, KeyRound, ShieldOff, Unplug } from "lucide-react";
import type { GitHubConnection, GitHubConnectionInput } from "@/lib/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { GitHubMark } from "@/components/integrations/GitHubMark";

const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";
const DOCS_LINKS = [
  {
    label: "Create a fine-grained token",
    href: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token",
  },
  { label: "Issues API", href: "https://docs.github.com/en/rest/issues/issues" },
];

export type GitHubConnectionCardProps = {
  /** `null` while loading. */
  connection: GitHubConnection | null;
  /** Connect (first time) or save changes. The token is only sent when the user typed one. */
  onSave: (input: GitHubConnectionInput) => void | Promise<void>;
  /** Remove the stored token. With `revoke`, GitHub also revokes it so it stops working everywhere. */
  onDisconnect: (options: { revoke: boolean }) => void;
  saving?: boolean;
  /** Last save error from the API, shown inline. */
  error?: string;
};

/**
 * Links a project to one GitHub repository with a fine-grained token limited to that repo.
 * Presentational: the page owns loading, saving and the disconnect confirmation.
 */
export function GitHubConnectionCard({ connection, onSave, onDisconnect, saving = false, error }: GitHubConnectionCardProps) {
  const connected = Boolean(connection?.connected);
  const [repo, setRepo] = useState("");
  const [token, setToken] = useState("");
  const [replacingToken, setReplacingToken] = useState(false);
  const [autoCreateIssues, setAutoCreateIssues] = useState(connection?.connected ? connection.autoCreateIssues : true);
  const switchId = useId();
  const repoName = connection?.owner && connection.repo ? `${connection.owner}/${connection.repo}` : "";
  const dirty = connected && (autoCreateIssues !== connection?.autoCreateIssues || Boolean(token.trim()));
  const canConnect = Boolean(repo.trim() && token.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!connected) {
      if (!canConnect) return;
      void onSave({ repo: repo.trim(), token: token.trim(), autoCreateIssues });
      return;
    }
    if (!dirty) return;
    void onSave({ repo: repoName, autoCreateIssues, ...(token.trim() ? { token: token.trim() } : {}) });
  }

  if (!connection) {
    return (
      <Card aria-busy>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-5 w-64" />
        </CardContent>
      </Card>
    );
  }

  const tokenField = (
    <div>
      <Input
        label={connected ? "New token" : "Access token"}
        type="password"
        required={!connected}
        autoComplete="off"
        spellCheck={false}
        value={token}
        placeholder="github_pat_…"
        className="font-mono text-[13px]"
        onChange={(event) => setToken(event.target.value)}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        Fine-grained token with <span className="text-foreground">Issues</span> and{" "}
        <span className="text-foreground">Contents</span>: read &amp; write, this repo only. Contents stores screenshots and the PDF
        report on an <code className="font-mono text-[11px]">attest-reports</code> branch.{" "}
        <ExternalLink href={NEW_TOKEN_URL}>New token</ExternalLink>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Stored encrypted. Attest never shows it again — only the last 4 characters.</p>
    </div>
  );

  return (
    <Card>
      <form onSubmit={submit} aria-label="GitHub connection">
        <CardHeader>
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-border bg-surface text-foreground">
              <GitHubMark />
            </span>
            <div className="min-w-0">
              <CardTitle>GitHub</CardTitle>
              <CardDescription>Open an issue in this project&apos;s repository when a test fails.</CardDescription>
            </div>
          </div>
          <CardAction>
            {connected ? (
              <Badge variant="success" dot>
                Connected
              </Badge>
            ) : (
              <Badge variant="outline">Not connected</Badge>
            )}
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-4">
          {connected ? (
            <dl className="space-y-2.5 text-[13px]">
              <Detail label="Repository">
                {connection.repoUrl ? (
                  <ExternalLink href={connection.repoUrl} className="font-mono text-[13px] text-foreground">
                    {repoName}
                  </ExternalLink>
                ) : (
                  <span className="font-mono">{repoName}</span>
                )}
              </Detail>
              <Detail label="Token">
                <span className="inline-flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">•••• {connection.tokenHint?.replace(/^…/, "") || "????"}</span>
                  {!replacingToken ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setReplacingToken(true)}>
                      <KeyRound aria-hidden /> Replace token
                    </Button>
                  ) : null}
                </span>
              </Detail>
              {connection.connectedAt ? <Detail label="Connected">{formatDate(connection.connectedAt)}</Detail> : null}
            </dl>
          ) : (
            <Input
              label="Repository"
              required
              value={repo}
              placeholder="acme/web-app or https://github.com/acme/web-app"
              className="font-mono text-[13px]"
              spellCheck={false}
              hint="One repository per project. Disconnect to link a different one."
              onChange={(event) => setRepo(event.target.value)}
            />
          )}

          {!connected || replacingToken ? tokenField : null}

          <div className="flex items-start justify-between gap-4 rounded-md border border-border px-3 py-2.5">
            <label htmlFor={switchId} className="min-w-0 cursor-pointer">
              <span className="block text-[13px] font-medium text-foreground">Open issues for failed tests automatically</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                One open issue per failing test, with step screenshots, descriptions and a PDF report.
              </span>
            </label>
            <Switch id={switchId} checked={autoCreateIssues} onCheckedChange={setAutoCreateIssues} disabled={saving} className="mt-0.5" />
          </div>

          {error ? <Alert variant="error">{error}</Alert> : null}

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
            <span>GitHub docs:</span>
            {DOCS_LINKS.map((link) => (
              <ExternalLink key={link.href} href={link.href} className="text-faint hover:text-muted-foreground">
                {link.label}
              </ExternalLink>
            ))}
          </p>
        </CardContent>

        <CardFooter className={connected ? "justify-between" : undefined}>
          {connected ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onDisconnect({ revoke: false })}
                disabled={saving}
                className="text-muted-foreground hover:text-destructive"
              >
                <Unplug aria-hidden /> Disconnect
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onDisconnect({ revoke: true })}
                disabled={saving}
                title="Disconnect and ask GitHub to revoke the token"
                className="text-muted-foreground hover:text-destructive"
              >
                <ShieldOff aria-hidden /> Revoke token
              </Button>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            {connected && (dirty || replacingToken) ? (
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  setToken("");
                  setReplacingToken(false);
                  setAutoCreateIssues(connection.autoCreateIssues);
                }}
              >
                Cancel
              </Button>
            ) : null}
            <Button type="submit" loading={saving} disabled={saving || (connected ? !dirty : !canConnect)}>
              {connected ? "Save" : saving ? "Connecting…" : "Connect repository"}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-3">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}

function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className
          ? `inline-flex items-center gap-0.5 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring ${className}`
          : "inline-flex items-center gap-0.5 rounded-sm text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      }
    >
      {children}
      <ArrowUpRight className="size-3" aria-hidden />
    </a>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
