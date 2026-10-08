"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { ThemeSegmentedControl } from "@/components/theme/theme-toggle";
import { NotificationPreferencesCard } from "@/components/notifications/notification-preferences";
import { accountApi } from "@/lib/api";
import { clearAccount, readAccount, writeAccount, type Account } from "@/lib/account";

export function SettingsPage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      return;
    }
    setProfileError("");
    setSavingProfile(true);
    try {
      const updated = await accountApi.updateProfile(name.trim());
      const next = { ...account, name: updated.name, email: updated.email };
      writeAccount(next);
      setAccount(next);
      toast.success("Name saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your name");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError("");
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
      toast.success("Password updated. Use it the next time you sign in.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your password");
    } finally {
      setSavingPassword(false);
    }
  }

  function signOut() {
    clearAccount();
    navigate("/login");
  }

  return (
    <PageContainer width="form">
      <PageHeader title="Settings" />

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose a theme, or follow your system setting.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ThemeSegmentedControl />
        </CardContent>
      </Card>

      <NotificationPreferencesCard />

      <Card>
        <form onSubmit={saveProfile} noValidate>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Profile</CardTitle>
              <CardDescription>How you appear on runs you trigger.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {account ? (
              <>
                <Input
                  label="Name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (profileError) setProfileError("");
                  }}
                  error={profileError || undefined}
                  autoComplete="name"
                />
                <Input label="Email" value={account.email} readOnly disabled hint="Email can't be changed here." />
              </>
            ) : (
              <SettingsFieldSkeleton count={2} />
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" loading={savingProfile} disabled={!account || savingProfile}>
              Save profile
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <form onSubmit={savePassword} noValidate>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Password</CardTitle>
              <CardDescription>Choose a new password for this account.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="New password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              hint="At least 6 characters."
            />
            <Input
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              error={passwordError || undefined}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" loading={savingPassword} disabled={!account || savingPassword}>
              Update password
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Sign out</h3>
            <p className="mt-0.5 text-[13px] text-muted-foreground">End this session on this browser.</p>
          </div>
          <Button type="button" variant="secondary" onClick={signOut}>
            <LogOut />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function SettingsFieldSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-4" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

export default SettingsPage;
