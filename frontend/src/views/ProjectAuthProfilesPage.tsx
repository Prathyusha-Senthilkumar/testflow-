"use client";

import { LoadingArea } from "@/components/common/LoadingArea";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, Mic, Plus, RefreshCw, SearchX, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "@/lib/navigation";
import { api, type AuthProfileInput, type AuthProfileSummary, type AuthRefreshConfig, type AuthSessionStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/ui/search-input";
import { Toolbar } from "@/components/ui/toolbar";
import { EmptyState } from "@/components/common/EmptyState";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { usePublishEntityName } from "@/components/layout/shell-context";

const emptyForm: AuthProfileInput = { name: "", loginUrl: "", username: "", password: "" };

type RefreshForm = {
  strategy: "" | "cookie" | "localStorage";
  url: string;
  method: "GET" | "POST";
  origin: string;
  accessTokenKey: string;
  refreshTokenKey: string;
  sendToken: "accessToken" | "refreshToken";
  accessTokenJsonPath: string;
  refreshTokenJsonPath: string;
};

const emptyRefresh: RefreshForm = {
  strategy: "",
  url: "",
  method: "POST",
  origin: "",
  accessTokenKey: "",
  refreshTokenKey: "",
  sendToken: "refreshToken",
  accessTokenJsonPath: "",
  refreshTokenJsonPath: "",
};

function refreshToForm(refresh: AuthRefreshConfig | null | undefined): RefreshForm {
  if (!refresh) return { ...emptyRefresh };
  return {
    strategy: refresh.strategy,
    url: refresh.url || "",
    method: refresh.method === "GET" ? "GET" : "POST",
    origin: refresh.origin || "",
    accessTokenKey: refresh.accessTokenKey || "",
    refreshTokenKey: refresh.refreshTokenKey || "",
    sendToken: refresh.sendToken === "accessToken" ? "accessToken" : "refreshToken",
    accessTokenJsonPath: refresh.accessTokenJsonPath || "",
    refreshTokenJsonPath: refresh.refreshTokenJsonPath || "",
  };
}

function formatStamp(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function sessionLabel(profile: AuthProfileSummary): string {
  const expires = formatStamp(profile.sessionExpiresAt);
  const recorded = formatStamp(profile.sessionRecordedAt);
  switch (profile.sessionStatus) {
    case "expired":
      return expires
        ? `Session expired ${expires} - renew it`
        : `Session may have expired (recorded ${recorded}) - renew it`;
    case "expiring":
      return expires
        ? `Session expires ${expires} - renew it soon`
        : `Session is close to expiring (recorded ${recorded}) - renew it soon`;
    case "active":
      return expires ? `Session active until ${expires}` : `Session saved ${recorded}`;
    default:
      return "No session yet";
  }
}

function sessionBadge(status: AuthProfileSummary["sessionStatus"]) {
  if (status === "expired") return { variant: "error" as const, label: "Expired" };
  if (status === "expiring") return { variant: "warning" as const, label: "Expiring" };
  if (status === "active") return { variant: "ok" as const, label: "Active" };
  return { variant: "default" as const, label: "No session" };
}

function sessionToneClass(status: AuthProfileSummary["sessionStatus"]): string {
  if (status === "expired") return "text-destructive";
  if (status === "expiring") return "text-warning";
  return "text-muted-foreground";
}

type SessionFilter = "" | AuthSessionStatus | "renewal";
const SESSION_FILTER_OPTIONS: { value: SessionFilter; label: string }[] = [
  { value: "", label: "All sessions" },
  { value: "active", label: "Active" },
  { value: "expiring", label: "Expiring" },
  { value: "expired", label: "Expired" },
  { value: "none", label: "No session" },
  { value: "renewal", label: "Needs renewal" },
];

export function ProjectAuthProfilesPage() {
  const { id: projectId = "" } = useParams();
  const [projectName, setProjectName] = useState("");
  const [defaultLoginUrl, setDefaultLoginUrl] = useState("");
  const [profiles, setProfiles] = useState<AuthProfileSummary[]>([]);
  const [search, setSearch] = useState("");
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("");
  const filtering = Boolean(search.trim() || sessionFilter);
  const visibleProfiles = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (sessionFilter === "renewal" ? !profile.needsRenewal : sessionFilter && profile.sessionStatus !== sessionFilter) return false;
      if (!needle) return true;
      return [profile.name, profile.loginUrl, profile.username].some((field) => field?.toLowerCase().includes(needle));
    });
  }, [profiles, search, sessionFilter]);
  function clearFilters() {
    setSearch("");
    setSessionFilter("");
  }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AuthProfileInput>(emptyForm);
  const [refreshProfileId, setRefreshProfileId] = useState<string | null>(null);
  const [refreshForm, setRefreshForm] = useState<RefreshForm>(emptyRefresh);
  const [savingRefresh, setSavingRefresh] = useState(false);

  usePublishEntityName("project", projectId, projectName);

  useEffect(() => {
    if (!projectId) return;
     
    setLoading(true);
    // Project data only supplies the name and default login URL; don't block the list on it.
    api
      .project(projectId)
      .then((project) => {
        setProjectName(project.name);
        setDefaultLoginUrl(project.baseUrl);
      })
      .catch(() => undefined);
    api
      .authProfiles(projectId)
      .then(setProfiles)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  function openCreate() {
    setForm({ name: "", loginUrl: defaultLoginUrl, username: "", password: "" });
    setFormOpen(true);
    setFormError("");
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setFormError("");
    try {
      const created = await api.createAuthProfile(projectId, {
        name: form.name,
        loginUrl: form.loginUrl || undefined,
        username: form.username?.trim() || undefined,
        password: form.password || undefined,
      });
      setProfiles((current) => [...current, created]);
      setFormOpen(false);
      await recordLogin(created.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create auth profile");
    } finally {
      setSaving(false);
    }
  }

  async function recordLogin(profileId: string) {
    if (!projectId) return;
    setRecordingId(profileId);
    try {
      const updated = await api.recordAuthProfileLogin(projectId, profileId);
      setProfiles((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success(`Session saved for “${updated.name}”`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login recording did not save a session");
    } finally {
      setRecordingId(null);
    }
  }

  function openRefresh(profile: AuthProfileSummary) {
    setRefreshProfileId(profile.id);
    setRefreshForm(refreshToForm(profile.refresh));
    setRefreshError("");
  }

  async function submitRefresh(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId || !refreshProfileId) return;
    setSavingRefresh(true);
    setRefreshError("");
    try {
      const refresh: AuthRefreshConfig | null =
        refreshForm.strategy === ""
          ? null
          : {
              strategy: refreshForm.strategy,
              url: refreshForm.url.trim(),
              method: refreshForm.method,
              ...(refreshForm.strategy === "localStorage"
                ? {
                    origin: refreshForm.origin.trim() || undefined,
                    accessTokenKey: refreshForm.accessTokenKey.trim(),
                    refreshTokenKey: refreshForm.refreshTokenKey.trim(),
                    sendToken: refreshForm.sendToken,
                    accessTokenJsonPath: refreshForm.accessTokenJsonPath.trim(),
                    refreshTokenJsonPath: refreshForm.refreshTokenJsonPath.trim() || undefined,
                  }
                : {}),
            };
      const updated = await api.setAuthProfileRefresh(projectId, refreshProfileId, refresh);
      setProfiles((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setRefreshProfileId(null);
      toast.success("Refresh settings saved");
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Could not save refresh settings");
    } finally {
      setSavingRefresh(false);
    }
  }

  async function removeProfile(profileId: string) {
    if (!projectId) return;
    try {
      await api.deleteAuthProfile(projectId, profileId);
      setProfiles((current) => current.filter((item) => item.id !== profileId));
      toast.success("Auth profile deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete auth profile");
    }
  }

  const renewals = profiles.filter((profile) => profile.needsRenewal);

  return (
    <PageContainer>
      <PageHeader
        title="Auth Profiles"
        description="Record a login once. Attest saves the session so later recordings and runs start already logged in."
        actions={
          // No profiles yet: the empty state carries the only "Record login" CTA.
          !loading && !error && profiles.length === 0 ? undefined : (
            <Button onClick={openCreate} disabled={saving || recordingId !== null}>
              <Plus /> Record login
            </Button>
          )
        }
      />

      {error ? <Alert variant="error" title="Could not load auth profiles">{error}</Alert> : null}
      {recordingId ? (
        <Alert variant="info" title="A login browser is open">
          Log in, then close the recorder window to save the session.
        </Alert>
      ) : null}
      {!loading && renewals.length > 0 ? (
        <Alert
          variant="warning"
          title={
            renewals.length === 1
              ? "1 auth profile needs session renewal"
              : `${renewals.length} auth profiles need session renewal`
          }
        >
          {renewals.map((profile) => profile.name).join(", ")}: use Renew session so recording and test runs keep starting logged in.
        </Alert>
      ) : null}

      <section className="space-y-3">
        {!loading && profiles.length > 0 ? (
          <Toolbar
            search={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search profiles by name, login URL or username…"
                shortcut="/"
                bindShortcut
              />
            }
            filters={
              <Select
                aria-label="Filter by session status"
                value={sessionFilter}
                onChange={(value) => setSessionFilter(value as SessionFilter)}
                options={SESSION_FILTER_OPTIONS}
              />
            }
            actions={
              filtering ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {visibleProfiles.length} of {profiles.length}
                </span>
              ) : null
            }
          />
        ) : null}
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {loading ? (
            <LoadingArea
              loading
              label="Loading auth profiles…"
              skeleton={
                <ul className="divide-y divide-border-subtle">
                  {[1, 2].map((item) => (
                    <li key={item} className="space-y-2 px-4 py-3.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-64" />
                      <Skeleton className="h-3 w-52" />
                    </li>
                  ))}
                </ul>
              }
            />
          ) : profiles.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No auth profiles configured"
              action={
                <Button size="sm" onClick={openCreate} disabled={saving || recordingId !== null}>
                  <Plus /> Record login
                </Button>
              }
            />
          ) : visibleProfiles.length === 0 ? (
            <EmptyState
              icon={SearchX}
              size="sm"
              title={search.trim() ? `No auth profiles match “${search.trim()}”` : "No auth profiles match this filter"}
              action={
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  Clear
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {visibleProfiles.map((profile) => {
                const badge = sessionBadge(profile.sessionStatus);
                return (
                  <li
                    key={profile.id}
                    className={cn(
                      "flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 py-3.5 transition-colors duration-150 hover:bg-state-hover",
                      profile.needsRenewal && "bg-warning-soft/60"
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{profile.name}</p>
                        <Badge variant={badge.variant} dot>
                          {badge.label}
                        </Badge>
                      </div>
                      <p className="truncate font-mono text-xs text-muted-foreground">{profile.loginUrl}</p>
                      <p className={cn("text-xs", sessionToneClass(profile.sessionStatus))}>{sessionLabel(profile)}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <KeyRound className="size-3" aria-hidden />
                          {profile.hasCredentials
                            ? `Credentials configured${profile.username ? ` (${profile.username})` : ""}, Attest can sign in automatically`
                            : "No credentials stored, automatic sign-in unavailable"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <RefreshCw className="size-3" aria-hidden />
                          {profile.refresh ? `Refresh configured (${profile.refresh.strategy})` : "No refresh configured"}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => openRefresh(profile)}>
                        <Settings2 /> Refresh
                      </Button>
                      <Button
                        variant={profile.needsRenewal ? "primary" : "outline"}
                        size="sm"
                        onClick={() => recordLogin(profile.id)}
                        disabled={recordingId !== null}
                        loading={recordingId === profile.id}
                      >
                        {recordingId === profile.id ? null : profile.hasStorageState ? <RefreshCw /> : <Mic />}
                        {profile.hasStorageState ? "Renew session" : "Record login"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="reveal-on-hover hover:text-destructive"
                        aria-label={`Delete ${profile.name}`}
                        onClick={() => removeProfile(profile.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Record login"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="auth-profile-form" loading={saving} disabled={saving}>
              Open login browser
            </Button>
          </>
        }
      >
        <form id="auth-profile-form" onSubmit={submitForm} className="space-y-4">
          <Input
            label="Profile name"
            required
            value={form.name}
            onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
            placeholder="Admin"
          />
          <Input
            label="Login URL"
            required
            value={form.loginUrl}
            className="font-mono text-[13px]"
            onChange={(e) => setForm((current) => ({ ...current, loginUrl: e.target.value }))}
            placeholder="https://example.com/login"
          />
          <Input
            label="Username or email"
            value={form.username ?? ""}
            onChange={(e) => setForm((current) => ({ ...current, username: e.target.value }))}
            placeholder="qa.user@example.com"
          />
          <Input
            label="Password"
            type="password"
            value={form.password ?? ""}
            onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
            placeholder="••••••••"
          />
          <div className="space-y-1.5 rounded-md border border-border bg-elevated/50 px-3 py-2.5 text-xs text-muted-foreground">
            <p>
              Credentials are encrypted before they are stored and are never shown again. Attest uses them to sign in
              automatically when a saved session stops working, so Run Test never needs you to log in manually.
            </p>
            <p>A browser window will open at the login page. Log in, then close the recorder window to save the session.</p>
          </div>
          {formError ? <Alert variant="error">{formError}</Alert> : null}
        </form>
      </Modal>

      <Modal
        open={refreshProfileId !== null}
        onClose={() => setRefreshProfileId(null)}
        title="Refresh settings"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefreshProfileId(null)}>
              Cancel
            </Button>
            <Button type="submit" form="auth-refresh-form" loading={savingRefresh} disabled={savingRefresh}>
              Save refresh
            </Button>
          </>
        }
      >
        <form id="auth-refresh-form" onSubmit={submitRefresh} className="space-y-4">
          <Select
            label="Strategy"
            value={refreshForm.strategy}
            onChange={(value) =>
              setRefreshForm((current) => ({
                ...current,
                strategy: value as RefreshForm["strategy"],
              }))
            }
            options={[
              { value: "", label: "Off: use saved session, then credentials" },
              { value: "cookie", label: "Cookie session" },
              { value: "localStorage", label: "localStorage tokens" },
            ]}
          />
          {refreshForm.strategy !== "" && (
            <>
              <Input
                label="Refresh URL"
                required
                value={refreshForm.url}
                className="font-mono text-[13px]"
                onChange={(e) => setRefreshForm((current) => ({ ...current, url: e.target.value }))}
                placeholder="https://example.com/api/auth/refresh"
              />
              <Select
                label="Method"
                value={refreshForm.method}
                onChange={(value) =>
                  setRefreshForm((current) => ({
                    ...current,
                    method: value === "GET" ? "GET" : "POST",
                  }))
                }
                options={[
                  { value: "POST", label: "POST" },
                  { value: "GET", label: "GET" },
                ]}
              />
            </>
          )}
          {refreshForm.strategy === "localStorage" && (
            <>
              <Input
                label="Origin"
                value={refreshForm.origin}
                className="font-mono text-[13px]"
                onChange={(e) => setRefreshForm((current) => ({ ...current, origin: e.target.value }))}
                placeholder="https://example.com"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Access token key"
                  required
                  value={refreshForm.accessTokenKey}
                  className="font-mono text-[13px]"
                  onChange={(e) => setRefreshForm((current) => ({ ...current, accessTokenKey: e.target.value }))}
                  placeholder="Name of the localStorage key"
                />
                <Input
                  label="Refresh token key"
                  required
                  value={refreshForm.refreshTokenKey}
                  className="font-mono text-[13px]"
                  onChange={(e) => setRefreshForm((current) => ({ ...current, refreshTokenKey: e.target.value }))}
                  placeholder="Name of the localStorage key"
                />
              </div>
              <Select
                label="Send"
                value={refreshForm.sendToken}
                onChange={(value) =>
                  setRefreshForm((current) => ({
                    ...current,
                    sendToken: value === "accessToken" ? "accessToken" : "refreshToken",
                  }))
                }
                options={[
                  { value: "refreshToken", label: "Refresh token key" },
                  { value: "accessToken", label: "Access token key" },
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Access token JSON path"
                  required
                  value={refreshForm.accessTokenJsonPath}
                  className="font-mono text-[13px]"
                  onChange={(e) => setRefreshForm((current) => ({ ...current, accessTokenJsonPath: e.target.value }))}
                  placeholder="accessToken"
                />
                <Input
                  label="Refresh token JSON path"
                  value={refreshForm.refreshTokenJsonPath}
                  className="font-mono text-[13px]"
                  onChange={(e) => setRefreshForm((current) => ({ ...current, refreshTokenJsonPath: e.target.value }))}
                  placeholder="refreshToken"
                />
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            These fields name the endpoint and the storage keys. Token values and passwords stay out of this configuration.
            When a saved session fails, Attest calls this refresh, and only then the encrypted credentials.
          </p>
          {refreshError ? <Alert variant="error">{refreshError}</Alert> : null}
        </form>
      </Modal>
    </PageContainer>
  );
}

export default ProjectAuthProfilesPage;
