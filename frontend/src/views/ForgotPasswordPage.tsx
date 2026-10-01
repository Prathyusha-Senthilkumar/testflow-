"use client";

import { useState } from "react";
import { TerminalSquare } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountApi } from "@/lib/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetLink, setResetLink] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setResetLink("");
    setLoading(true);
    try {
      const result = await accountApi.forgotPassword(email.trim());
      setNotice(result.message);
      setResetLink(result.resetLink || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset email");
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
          <h1 className="mt-3 text-lg font-bold">Reset your password</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the email for your TestFlow account.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {notice ? <p className="text-sm text-slate-600">{notice}</p> : null}
          {resetLink ? (
            <a
              href={resetLink}
              className="block w-full rounded-lg bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-indigo-700"
            >
              Choose a new password
            </a>
          ) : (
            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading} loading={loading}>
              Send reset link
            </Button>
          )}
        </form>
        <Link to="/login" className="mt-4 block text-center text-sm text-indigo-700 hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
