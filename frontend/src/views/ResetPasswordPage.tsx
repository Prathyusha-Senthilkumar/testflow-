"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthLayout, PasswordVisibilityToggle } from "@/components/layout/auth-layout";
import { accountApi } from "@/lib/api";

function readRecoveryToken(): { token: string; error: string } {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const description = hash.get("error_description") || query.get("error_description") || "";
  if (description) return { token: "", error: description.replace(/\+/g, " ") };
  const type = hash.get("type") || query.get("type");
  if (type && type !== "recovery") return { token: "", error: "This reset link is invalid or has expired." };
  return { token: hash.get("access_token") || query.get("access_token") || "", error: "" };
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const recovery = readRecoveryToken();
    setToken(recovery.token);
    setError(recovery.error);
    setReady(true);
    window.history.replaceState(null, "", "/reset-password");
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await accountApi.resetPassword(token, password);
      navigate("/login?reset=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the password");
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      description="This replaces the password for your Attest account."
      footer={
        <Link to="/forgot-password" className="font-medium text-brand-accent underline-offset-4 hover:underline">
          Request a new reset link
        </Link>
      }
    >
      {!ready ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : token ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <Input
              label="New password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
              className="pr-9"
            />
            <PasswordVisibilityToggle shown={show} onToggle={() => setShow((current) => !current)} />
          </div>
          <Input
            label="Confirm password"
            type={show ? "text" : "password"}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
          {error ? <Alert variant="error">{error}</Alert> : null}
          <Button type="submit" className="w-full" disabled={loading} loading={loading}>
            Update password
          </Button>
        </form>
      ) : (
        <Alert variant="error">{error || "This reset link is invalid or has expired."}</Alert>
      )}
    </AuthLayout>
  );
}

export default ResetPasswordPage;
