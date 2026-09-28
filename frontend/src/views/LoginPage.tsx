"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, TerminalSquare } from "lucide-react";
import { Link, useNavigate } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    if (readAccount()) navigate("/dashboard");
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
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#f7f9fc] px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-7 shadow-xl shadow-slate-200/60">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-indigo-600 text-white">
            <TerminalSquare size={22} />
          </span>
          <h1 className="mt-3 text-lg font-bold">TestFlow</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "login" ? "Sign in to your account." : "Create your TestFlow account."}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" required />
          )}
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
          <div className="relative">
            <Input
              label="Password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="pr-10"
            />
            <button
              type="button"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((current) => !current)}
              className="absolute bottom-2.5 right-3 text-slate-400"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {mode === "login" ? (
            <Link to="/forgot-password" className="block text-right text-sm text-indigo-700 hover:underline">
              Forgot password?
            </Link>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {notice ? <p className="text-sm text-slate-600">{notice}</p> : null}
          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading} loading={loading}>
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-indigo-700 hover:underline"
          onClick={() => {
            setMode((current) => (current === "login" ? "signup" : "login"));
            setError("");
            setNotice("");
          }}
        >
          {mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

export default LoginPage;
