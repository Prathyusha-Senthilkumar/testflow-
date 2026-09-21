"use client";

import { useEffect, useState } from "react";
import { Mic, Plus, Trash2 } from "lucide-react";
import { Link, useParams } from "@/lib/navigation";
import { api, type AuthProfileInput, type AuthProfileSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const emptyForm: AuthProfileInput = { name: "", loginUrl: "" };

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
    setForm({ name: "", loginUrl: defaultLoginUrl });
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

      <div className="mt-6 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">AUTH PROFILES</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading auth profiles...</p>
        ) : profiles.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No auth profiles configured.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {profiles.map((profile) => (
              <li key={profile.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 px-4 py-3">
                <div>
                  <p className="font-medium">{profile.name}</p>
                  <p className="font-mono text-xs text-slate-600">{profile.loginUrl}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {profile.hasStorageState ? "Session saved" : "No session yet"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => recordLogin(profile.id)}
                    disabled={recordingId !== null}
                    loading={recordingId === profile.id}
                  >
                    <Mic size={14} className="mr-1 inline" />
                    {profile.hasStorageState ? "Re-record" : "Record login"}
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
          <p className="text-xs text-slate-500">
            Playwright will open this URL. Log in, then close the Inspector to save cookies and storage.
          </p>
        </form>
      </Modal>
    </div>
  );
}

export default ProjectAuthProfilesPage;
