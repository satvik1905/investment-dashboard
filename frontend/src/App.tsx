import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "./store/appStore";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Journal } from "./pages/Journal";
import { Scanner } from "./pages/Scanner";
import { Watchlist } from "./pages/Watchlist";
import { News } from "./pages/News";
import api, { setAuthKey, clearAuthKey } from "./api/client";
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

// ── Password gate ────────────────────────────────────────────────────────────

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setError(false);
    setChecking(true);
    setAuthKey(value.trim());
    try {
      await api.get("/api/signals/latest");
      onUnlock();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        clearAuthKey();
        setError(true);
      } else {
        // Non-auth error (network, 500, etc.) — key may be fine, let them in
        onUnlock();
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-primary">
      <Card className="w-full max-w-xs">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl font-bold text-text-primary tracking-tight">
            SwingIQ
          </CardTitle>
          <CardDescription className="text-text-tertiary text-sm mt-1">
            Enter password to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Input
              type="password"
              autoFocus
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(false); }}
              placeholder="Password"
              className="bg-bg-secondary text-text-primary font-mono text-sm px-4 py-3 h-auto rounded-xl placeholder:text-text-tertiary"
            />
            {error && (
              <p className="text-accent-red text-xs font-mono text-center">Wrong password</p>
            )}
            <Button
              type="submit"
              disabled={checking || !value.trim()}
              className="w-full py-3 h-auto rounded-xl bg-accent-blue/15 border border-accent-blue/30 text-accent-blue text-sm font-mono font-medium hover:bg-accent-blue/25"
            >
              {checking ? "Checking..." : "Unlock"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { activeTab } = useAppStore();
  const [authState, setAuthState] = useState<"checking" | "locked" | "open">("checking");

  const handleAuthRequired = useCallback(() => setAuthState("locked"), []);

  useEffect(() => {
    window.addEventListener("swingiq:auth-required", handleAuthRequired);
    return () => window.removeEventListener("swingiq:auth-required", handleAuthRequired);
  }, [handleAuthRequired]);

  // Probe on mount: is the gate on?
  useEffect(() => {
    let cancelled = false;
    api.get("/api/signals/latest").then(() => {
      if (!cancelled) setAuthState("open");
    }).catch((err) => {
      if (cancelled) return;
      if (err?.response?.status === 401) {
        setAuthState("locked");
      } else {
        // Gate is off or backend is down — show the app either way
        setAuthState("open");
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (authState === "checking") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
      </div>
    );
  }

  if (authState === "locked") {
    return (
      <TooltipProvider>
        <PasswordGate onUnlock={() => setAuthState("open")} />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-bg-primary font-sans">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto">
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "watchlist" && <Watchlist />}
          {activeTab === "news" && <News />}
          {activeTab === "journal" && <Journal />}
          {activeTab === "scanner" && <Scanner />}
        </main>
      </div>
    </TooltipProvider>
  );
}
