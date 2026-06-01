import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "./store/appStore";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Journal } from "./pages/Journal";
import { Settings } from "./pages/Settings";
import { Scanner } from "./pages/Scanner";
import { Watchlist } from "./pages/Watchlist";
import { News } from "./pages/News";
import api, { setAuthKey, clearAuthKey } from "./api/client";

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
      <form onSubmit={submit} className="w-full max-w-xs space-y-4">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">
            SwingIQ
          </h1>
          <p className="text-text-tertiary text-sm mt-1">Enter password to continue</p>
        </div>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false); }}
          placeholder="Password"
          className="w-full bg-bg-secondary text-text-primary font-mono text-sm px-4 py-3 rounded-xl border border-white/[0.08] focus:outline-none focus:border-accent-blue/50 placeholder:text-text-tertiary"
        />
        {error && (
          <p className="text-accent-red text-xs font-mono text-center">Wrong password</p>
        )}
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className="w-full py-3 rounded-xl bg-accent-blue/15 border border-accent-blue/30 text-accent-blue text-sm font-mono font-medium hover:bg-accent-blue/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {checking ? "Checking..." : "Unlock"}
        </button>
      </form>
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
    return <PasswordGate onUnlock={() => setAuthState("open")} />;
  }

  return (
    <div className="flex min-h-screen bg-bg-primary font-sans">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "watchlist" && <Watchlist />}
        {activeTab === "news" && <News />}
        {activeTab === "journal" && <Journal />}
        {activeTab === "scanner" && <Scanner />}
        {activeTab === "settings" && <Settings />}
      </main>
    </div>
  );
}
