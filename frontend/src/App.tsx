import { useState } from "react";
import { useAppStore } from "./store/appStore";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Scanner } from "./pages/Scanner";
import { News } from "./pages/News";
import { useAuth } from "./hooks/useAuth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-xs">
        <CardHeader className="text-center">
          <CardTitle className="font-sans text-2xl font-bold text-foreground tracking-tight">
            SwingIQ
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm mt-1">
            Sign in to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              placeholder="Email"
              className="bg-card text-foreground font-mono text-sm px-4 py-3 h-auto rounded-xl placeholder:text-muted-foreground"
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="Password"
              className="bg-card text-foreground font-mono text-sm px-4 py-3 h-auto rounded-xl placeholder:text-muted-foreground"
            />
            {error && (
              <p className="text-destructive text-xs font-mono text-center">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={submitting || !email.trim() || !password.trim()}
              className="w-full py-3 h-auto rounded-xl bg-ring/15 border border-ring/30 text-ring text-sm font-mono font-medium hover:bg-ring/25"
            >
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <p className="text-muted-foreground text-xs text-center mt-4">
            Access is invite-only
          </p>
        </CardContent>
      </Card>
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
