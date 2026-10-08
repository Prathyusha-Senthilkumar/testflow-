"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountApi } from "@/lib/api";
import { clearAccount, readAccount, writeAccount, type Account } from "@/lib/account";

export function SettingsPage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const current = readAccount();
    if (!current) {
      navigate("/login");
      return;
    }
    setAccount(current);
    setName(current.name);
    let cancelled = false;
    accountApi
      .me()
      .then((fresh) => {
        if (cancelled) return;
        const next = { ...current, name: fresh.name, email: fresh.email };
        writeAccount(next);
        setAccount(next);
        setName(fresh.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Load once on entry. `navigate` is only used for the signed-out redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!account) return;
    if (!name.trim()) {
      setProfileError("Name is required.");
      setProfileMessage("");
      return;
    }
    setProfileError("");
    setProfileMessage("");
    setSavingProfile(true);
    try {
      const updated = await accountApi.updateProfile(name.trim());
      const next = { ...account, name: updated.name, email: updated.email };
      writeAccount(next);
      setAccount(next);
      setProfileMessage("Name saved.");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Could not save your name");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      await accountApi.updatePassword(password);
      setPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated. Use it the next time you sign in.");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Could not update your password");
    } finally {
      setSavingPassword(false);
    }
  }

  function signOut() {
    clearAccount();
    navigate("/login");
  }

  if (!account) return null;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
      <p className="mt-2 text-sm text-slate-500">Your TestFlow account.</p>

      <div className="mt-8 space-y-4">
      <form onSubmit={saveProfile} noValidate className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold">Profile</h2>
        <div className="mt-4 space-y-4">
          <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <Input label="Email" value={account.email} readOnly />
        </div>
        {profileError ? <p className="mt-3 text-sm text-red-600">{profileError}</p> : null}
        {profileMessage ? <p className="mt-3 text-sm text-slate-600">{profileMessage}</p> : null}
        <Button type="submit" className="mt-5" loading={savingProfile} disabled={savingProfile}>
          Save profile
        </Button>
      </form>

      <form onSubmit={savePassword} noValidate className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold">Password</h2>
        <p className="mt-1 text-sm text-slate-500">Choose a new password for this account.</p>
        <div className="mt-4 space-y-4">
          <Input
            label="New password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
          <Input
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        {passwordError ? <p className="mt-3 text-sm text-red-600">{passwordError}</p> : null}
        {passwordMessage ? <p className="mt-3 text-sm text-slate-600">{passwordMessage}</p> : null}
        <Button type="submit" className="mt-5" loading={savingPassword} disabled={savingPassword}>
          Update password
        </Button>
      </form>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold">Sign out</h2>
        <p className="mt-1 text-sm text-slate-500">End this session on this browser.</p>
        <Button type="button" variant="secondary" className="mt-4" onClick={signOut}>
          Sign out
        </Button>
      </div>
      </div>
    </div>
  );
}

export default SettingsPage;
