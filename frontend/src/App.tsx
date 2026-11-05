import { useState } from "react";
import { useAppStore } from "./store/appStore";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Scanner } from "./pages/Scanner";
import { News } from "./pages/News";
import { useAuth } from "./hooks/useAuth";
import { TooltipProvider } from "@/components/ui/tooltip";

// ── Login page ──────────────────────────────────────────────────────────────

function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password.trim());
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Sign in failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !submitting && !!email.trim() && !!password.trim();

  const inputClass =
    "w-full h-11 rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-hidden transition focus:border-primary focus:ring-4 focus:ring-primary/10";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 font-sans">
      {/* faint grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />

      <div className="relative w-full max-w-[400px] animate-slide-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <svg width="40" height="40" viewBox="0 0 22 22" fill="none" className="mb-4">
            <path
              d="M11 1L21 11L11 21L1 11L11 1Z"
              fill="hsl(138 76% 97%)"
              stroke="var(--primary)"
              strokeWidth="1.5"
            />
            <path d="M11 5L17 11L11 17L5 11L11 5Z" fill="var(--primary)" opacity="0.5" />
          </svg>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            SwingIQ
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to your trading terminal
          </p>
        </div>

        <div className="rounded-2xl border border-black/[0.06] bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-medium text-slate-600">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-medium text-slate-600">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 active:translate-y-px disabled:cursor-not-allowed disabled:bg-primary/60"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Access is invite-only
        </p>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { activeTab } = useAppStore();
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-2 h-2 rounded-full bg-ring animate-pulse" />
      </div>
    );
  }

  if (!session) {
    return (
      <TooltipProvider>
        <LoginPage />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-background font-sans">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto">
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "news" && <News />}
          {activeTab === "scanner" && <Scanner />}
        </main>
      </div>
    </TooltipProvider>
  );
}
