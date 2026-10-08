"use client";

import { useState } from "react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { AuthLayout } from "@/components/layout/auth-layout";
import { accountApi } from "@/lib/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const result = await accountApi.forgotPassword(email.trim());
      setNotice(result.message || "If an account exists for that email, a reset link is on its way.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter the email for your Attest account and we'll send a reset link."
      footer={
        <Link to="/login" className="font-medium text-brand-accent underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        {error ? <Alert variant="error">{error}</Alert> : null}
        {notice ? <Alert variant="success">{notice}</Alert> : null}
        <Button type="submit" className="w-full" disabled={loading} loading={loading}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}

export default ForgotPasswordPage;
