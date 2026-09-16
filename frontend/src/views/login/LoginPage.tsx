import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSupabaseConfigured, signInWithPasswordApi } from "@/lib/supabase";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isSupabaseConfigured) {
      navigate("/dashboard");
      return;
    }

    setLoading(true);
    const { error: loginError } = await signInWithPasswordApi(email, password);
    setLoading(false);

    if (loginError) {
      setError(loginError.message);
      return;
    }

    navigate("/dashboard");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 text-white">
            <FlaskConical />
          </span>
          <h1 className="text-2xl font-bold">Welcome to TestFlow</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to manage and run your automated tests.
          </p>
        </div>

        <form onSubmit={submit} className="rounded-xl border bg-white p-6 shadow-sm">
          <label className="mb-1.5 block text-sm font-medium">Email</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="qa@example.com"
            required
          />

          <label className="mb-1.5 mt-4 block text-sm font-medium">Password</label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="pr-10"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-700"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <Button className="mt-5 w-full" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </Button>

          {!isSupabaseConfigured && (
            <p className="mt-3 text-center text-xs text-amber-600">
              Demo mode: Supabase keys are not configured yet.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
