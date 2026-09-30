"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, TerminalSquare } from "lucide-react";
import { Link, useNavigate } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="grid min-h-screen place-items-center bg-[#f7f9fc] px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-7 shadow-xl shadow-slate-200/60">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-indigo-600 text-white">
            <TerminalSquare size={22} />
          </span>
          <h1 className="mt-3 text-lg font-bold">Choose a new password</h1>
          <p className="mt-1 text-sm text-slate-500">This replaces the password for your TestFlow account.</p>
        </div>
        {!ready ? null : token ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="relative">
              <Input
                label="New password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
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
            <Input
              label="Confirm password"
              type={show ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={6}
              required
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading} loading={loading}>
              Update password
            </Button>
          </form>
        ) : (
          <p className="text-sm text-red-600">{error || "This reset link is invalid or has expired."}</p>
        )}
        <Link to="/forgot-password" className="mt-4 block text-center text-sm text-indigo-700 hover:underline">
          Request a new reset link
        </Link>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
