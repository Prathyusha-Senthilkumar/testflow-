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
    accountApi
      .me()
      .then((fresh) => {
        const next = { ...current, name: fresh.name, email: fresh.email };
        writeAccount(next);
        setAccount(next);
        setName(fresh.name);
      })
      .catch(() => undefined);
  }, [navigate]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!account) return;
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
    <div className="p-6 lg:p-8">
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">Your TestFlow account.</p>

      <form onSubmit={saveProfile} className="mt-6 max-w-xl rounded-xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold">Profile</h2>
        <div className="mt-4 space-y-4">
          <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
          <Input label="Email" value={account.email} readOnly />
        </div>
        {profileError ? <p className="mt-3 text-sm text-red-600">{profileError}</p> : null}
        {profileMessage ? <p className="mt-3 text-sm text-slate-600">{profileMessage}</p> : null}
        <Button type="submit" className="mt-5" loading={savingProfile} disabled={savingProfile}>
          Save profile
        </Button>
      </form>

      <form onSubmit={savePassword} className="mt-4 max-w-xl rounded-xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold">Password</h2>
        <p className="mt-1 text-sm text-slate-500">Choose a new password for this account.</p>
        <div className="mt-4 space-y-4">
          <Input
            label="New password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
          <Input
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={6}
            required
          />
        </div>
        {passwordError ? <p className="mt-3 text-sm text-red-600">{passwordError}</p> : null}
        {passwordMessage ? <p className="mt-3 text-sm text-slate-600">{passwordMessage}</p> : null}
        <Button type="submit" className="mt-5" loading={savingPassword} disabled={savingPassword}>
          Update password
        </Button>
      </form>

      <div className="mt-4 max-w-xl rounded-xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold">Sign out</h2>
        <p className="mt-1 text-sm text-slate-500">End this session on this browser.</p>
        <Button type="button" variant="secondary" className="mt-4" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

export default SettingsPage;
