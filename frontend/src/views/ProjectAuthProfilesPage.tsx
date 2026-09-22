"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Mic, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Link, useParams } from "@/lib/navigation";
import { api, type AuthProfileInput, type AuthProfileSummary, type AuthRefreshConfig } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

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

function sessionToneClass(status: AuthProfileSummary["sessionStatus"]): string {
  if (status === "expired") return "text-red-600";
  if (status === "expiring") return "text-amber-700";
  if (status === "active") return "text-emerald-700";
  return "text-slate-500";
}

export function ProjectAuthProfilesPage() {
  const { id: projectId = "" } = useParams();
  const [projectName, setProjectName] = useState("Project");
  const [defaultLoginUrl, setDefaultLoginUrl] = useState("");
  const [profiles, setProfiles] = useState<AuthProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AuthProfileInput>(emptyForm);
  const [refreshProfileId, setRefreshProfileId] = useState<string | null>(null);
  const [refreshForm, setRefreshForm] = useState<RefreshForm>(emptyRefresh);
  const [savingRefresh, setSavingRefresh] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([api.project(projectId), api.authProfiles(projectId)])
      .then(([project, items]) => {
        setProjectName(project.name);
        setDefaultLoginUrl(project.baseUrl);
        setProfiles(items);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  function openCreate() {
    setForm({ name: "", loginUrl: defaultLoginUrl, username: "", password: "" });
    setFormOpen(true);
    setError("");
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setError("");
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
      setError(err instanceof Error ? err.message : "Could not create auth profile");
    } finally {
      setSaving(false);
    }
  }

  async function recordLogin(profileId: string) {
    if (!projectId) return;
    setRecordingId(profileId);
    setError("");
    try {
      const updated = await api.recordAuthProfileLogin(projectId, profileId);
      setProfiles((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login recording did not save a session");
    } finally {
      setRecordingId(null);
    }
  }

  function openRefresh(profile: AuthProfileSummary) {
    setRefreshProfileId(profile.id);
    setRefreshForm(refreshToForm(profile.refresh));
    setError("");
  }

  async function submitRefresh(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId || !refreshProfileId) return;
    setSavingRefresh(true);
    setError("");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save refresh settings");
    } finally {
      setSavingRefresh(false);
    }
  }

  async function removeProfile(profileId: string) {
    if (!projectId) return;
    setError("");
    try {
      await api.deleteAuthProfile(projectId, profileId);
      setProfiles((current) => current.filter((item) => item.id !== profileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete auth profile");
    }
  }

  const renewals = profiles.filter((profile) => profile.needsRenewal);

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            <Link to="/projects" className="text-indigo-600 hover:underline">Projects</Link>
            <span className="mx-1">/</span>
            <Link to={`/projects/${projectId}`} className="text-indigo-600 hover:underline">{projectName}</Link>
            <span className="mx-1">/</span>
            Auth Profiles
          </p>
          <h1 className="mt-2 text-3xl font-bold">Auth Profiles</h1>
          <p className="mt-1 text-sm text-slate-500">
            Record a login once. Playwright saves the session so later record and run start already logged in.
          </p>
        </div>
        <Button type="button" onClick={openCreate} disabled={saving || recordingId !== null}>
          <Plus size={16} className="mr-1 inline" />
          Record Login
        </Button>
      </div>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {recordingId && (
        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          Playwright Codegen is open. Log in, then close the Inspector to save the session.
        </div>
      )}
      {!loading && renewals.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">
            <AlertTriangle size={14} className="mr-1 inline" />
            {renewals.length === 1
              ? "1 auth profile needs session renewal"
              : `${renewals.length} auth profiles need session renewal`}
          </p>
          <p className="mt-1">
            {renewals.map((profile) => profile.name).join(", ")} - use Renew session so recording and
            test runs keep starting logged in.
          </p>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">AUTH PROFILES</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading auth profiles...</p>
        ) : profiles.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No auth profiles configured.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {profiles.map((profile) => (
              <li
                key={profile.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                  profile.needsRenewal ? "border-amber-200 bg-amber-50/50" : "border-slate-100"
                }`}
              >
                <div>
                  <p className="font-medium">{profile.name}</p>
                  <p className="font-mono text-xs text-slate-600">{profile.loginUrl}</p>
                  <p className={`mt-1 text-xs ${sessionToneClass(profile.sessionStatus)}`}>
                    {sessionLabel(profile)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {profile.hasCredentials
                      ? `Credentials configured${profile.username ? ` (${profile.username})` : ""} — TestFlow can sign in automatically`
                      : "No credentials stored — automatic sign-in unavailable"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {profile.refresh
                      ? `Refresh configured (${profile.refresh.strategy})`
                      : "No refresh configured"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => openRefresh(profile)}>
                    Refresh
                  </Button>
                  <Button
                    type="button"
                    variant={profile.needsRenewal ? "primary" : "outline"}
                    size="sm"
                    onClick={() => recordLogin(profile.id)}
                    disabled={recordingId !== null}
                    loading={recordingId === profile.id}
                  >
                    {profile.hasStorageState ? (
                      <RefreshCw size={14} className="mr-1 inline" />
                    ) : (
                      <Mic size={14} className="mr-1 inline" />
                    )}
                    {profile.hasStorageState ? "Renew session" : "Record login"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => removeProfile(profile.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Record Login"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" form="auth-profile-form" loading={saving} disabled={saving}>
              Open Playwright
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
          <p className="text-xs text-slate-500">
            Credentials are encrypted before they are stored and are never shown again. TestFlow
            uses them to sign in automatically when a saved session stops working, so Run Test
            never needs you to log in manually.
          </p>
          <p className="text-xs text-slate-500">
            Playwright will open the login URL. Log in, then close the Inspector to save cookies and storage.
          </p>
        </form>
      </Modal>

      <Modal
        open={refreshProfileId !== null}
        onClose={() => setRefreshProfileId(null)}
        title="Refresh settings"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setRefreshProfileId(null)}>Cancel</Button>
            <Button type="submit" form="auth-refresh-form" loading={savingRefresh} disabled={savingRefresh}>
              Save refresh
            </Button>
          </>
        }
      >
        <form id="auth-refresh-form" onSubmit={submitRefresh} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Strategy</span>
            <select
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={refreshForm.strategy}
              onChange={(e) =>
                setRefreshForm((current) => ({
                  ...current,
                  strategy: e.target.value as RefreshForm["strategy"],
                }))
              }
            >
              <option value="">Off — use saved session, then credentials</option>
              <option value="cookie">Cookie session</option>
              <option value="localStorage">localStorage tokens</option>
            </select>
          </label>
          {refreshForm.strategy !== "" && (
            <>
              <Input
                label="Refresh URL"
                required
                value={refreshForm.url}
                onChange={(e) => setRefreshForm((current) => ({ ...current, url: e.target.value }))}
                placeholder="https://example.com/api/auth/refresh"
              />
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Method</span>
                <select
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={refreshForm.method}
                  onChange={(e) =>
                    setRefreshForm((current) => ({
                      ...current,
                      method: e.target.value === "GET" ? "GET" : "POST",
                    }))
                  }
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                </select>
              </label>
            </>
          )}
          {refreshForm.strategy === "localStorage" && (
            <>
              <Input
                label="Origin"
                value={refreshForm.origin}
                onChange={(e) => setRefreshForm((current) => ({ ...current, origin: e.target.value }))}
                placeholder="https://example.com"
              />
              <Input
                label="Access token key"
                required
                value={refreshForm.accessTokenKey}
                onChange={(e) => setRefreshForm((current) => ({ ...current, accessTokenKey: e.target.value }))}
                placeholder="Name of the localStorage key"
              />
              <Input
                label="Refresh token key"
                required
                value={refreshForm.refreshTokenKey}
                onChange={(e) => setRefreshForm((current) => ({ ...current, refreshTokenKey: e.target.value }))}
                placeholder="Name of the localStorage key"
              />
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Send</span>
                <select
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={refreshForm.sendToken}
                  onChange={(e) =>
                    setRefreshForm((current) => ({
                      ...current,
                      sendToken: e.target.value === "accessToken" ? "accessToken" : "refreshToken",
                    }))
                  }
                >
                  <option value="refreshToken">Refresh token key</option>
                  <option value="accessToken">Access token key</option>
                </select>
              </label>
              <Input
                label="Access token JSON path"
                required
                value={refreshForm.accessTokenJsonPath}
                onChange={(e) =>
                  setRefreshForm((current) => ({ ...current, accessTokenJsonPath: e.target.value }))
                }
                placeholder="accessToken"
              />
              <Input
                label="Refresh token JSON path"
                value={refreshForm.refreshTokenJsonPath}
                onChange={(e) =>
                  setRefreshForm((current) => ({ ...current, refreshTokenJsonPath: e.target.value }))
                }
                placeholder="refreshToken"
              />
            </>
          )}
          <p className="text-xs text-slate-500">
            These fields name the endpoint and the storage keys. Token values and passwords stay out of
            this configuration. When a saved session fails, TestFlow calls this refresh, and only then
            the encrypted credentials.
          </p>
        </form>
      </Modal>
    </div>
  );
}

export default ProjectAuthProfilesPage;
