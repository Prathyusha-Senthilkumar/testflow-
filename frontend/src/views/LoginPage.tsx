"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/navigation";
import { safeNextPath } from "@/lib/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { AuthLayout, PasswordVisibilityToggle } from "@/components/layout/auth-layout";
import { accountApi } from "@/lib/api";
import { readAccount, writeAccount, type Account } from "@/lib/account";

function storeSession(result: { accessToken?: string | null; refreshToken?: string | null; userId?: string | null; email: string; name: string }) {
  if (!result.accessToken || !result.refreshToken || !result.userId) return false;
  const account: Account = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    userId: result.userId,
    email: result.email,
    name: result.name,
  };
  writeAccount(account);
  return true;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (readAccount()) navigate(safeNextPath(window.location.search));
    if (new URLSearchParams(window.location.search).get("reset") === "1") {
      setNotice("Password updated. Sign in with your new password.");
    }
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const result = await accountApi.signup(name.trim(), email.trim(), password);
        if (result.confirmationRequired || !storeSession(result)) {
          setNotice("Account created. Confirm the email if required, then sign in.");
          setMode("login");
          return;
        }
      } else {
        const result = await accountApi.login(email.trim(), password);
        if (!storeSession(result)) {
          setError("Sign-in did not return a session.");
          return;
        }
      }
      navigate(safeNextPath(window.location.search));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <AuthLayout
      title={isLogin ? "Sign in to Attest" : "Create your Attest account"}
      description={isLogin ? "Welcome back. Enter your details to continue." : "Start creating repeatable browser tests."}
      footer={
        <button
          type="button"
          className="font-medium text-brand-accent underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
          onClick={() => {
            setMode((current) => (current === "login" ? "signup" : "login"));
            setError("");
            setNotice("");
          }}
        >
          {isLogin ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && (
          <Input
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            autoComplete="name"
            required
          />
        )}
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <div>
          <div className="relative">
            <Input
              label="Password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={6}
              className="pr-9"
            />
            <PasswordVisibilityToggle shown={show} onToggle={() => setShow((current) => !current)} />
          </div>
          {isLogin ? (
            <div className="mt-1.5 text-right">
              <Link to="/forgot-password" className="text-[13px] text-brand-accent underline-offset-4 hover:underline">
                Forgot password?
              </Link>
            </div>
          ) : null}
        </div>
        {error ? <Alert variant="error">{error}</Alert> : null}
        {notice ? <Alert variant="info">{notice}</Alert> : null}
        <Button type="submit" className="w-full" disabled={loading} loading={loading}>
          {isLogin ? "Sign in" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default LoginPage;
