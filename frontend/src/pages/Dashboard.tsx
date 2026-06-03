import { useState } from "react";
import { useSignals } from "../hooks/useSignals";
import { usePositions, usePositionAlerts } from "../hooks/usePositions";
import { useDashboard } from "../hooks/useJournal";
import { useLiveQuotes } from "../hooks/useLivePrice";
import type { LiveQuote } from "../hooks/useLivePrice";
import { SignalsTable } from "../components/SignalsTable";
import { PositionCard } from "../components/PositionCard";
import { StockDetailModal } from "../components/StockDetailModal";
import { ToastContainer, useToast } from "../components/Toast";
import { useRemoveSignal, useGenerateSignal } from "../hooks/useSignals";
import { TickerAutocomplete } from "../components/TickerAutocomplete";
import { AlertBanner } from "../components/AlertBanner";
import { cn } from "../lib/utils";

// ── Market status pill ────────────────────────────────────────────────────────

function MarketPill({ status }: { status: LiveQuote["market_status"] | null }) {
  if (!status) return null;
  const cfg = {
    OPEN:        { dot: "bg-accent-green animate-pulse", label: "Market Open",  cls: "border-accent-green/20 text-accent-green" },
    PRE_MARKET:  { dot: "bg-accent-amber animate-pulse", label: "Pre-Market",   cls: "border-accent-amber/20 text-accent-amber" },
    AFTER_HOURS: { dot: "bg-accent-amber",               label: "After Hours",  cls: "border-accent-amber/20 text-accent-amber" },
    CLOSED:      { dot: "bg-accent-red",                 label: "Market Closed",cls: "border-accent-red/20 text-text-secondary" },
  }[status];
  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full border bg-bg-secondary text-xs font-mono", cfg.cls)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
      {cfg.label}
    </div>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-bg-secondary border border-[rgba(255,255,255,0.06)]">
      <div>
        <div className="text-text-tertiary text-[10px] uppercase tracking-widest font-mono">{label}</div>
        <div className={cn("font-mono text-sm font-semibold mt-0.5", valueClass ?? "text-text-primary")}>{value}</div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 border border-[rgba(255,255,255,0.05)] rounded-xl text-center">
      <div className="w-10 h-10 rounded-full border border-[rgba(255,255,255,0.08)] flex items-center justify-center mb-3">
        <span className="text-text-muted text-lg">◎</span>
      </div>
      <p className="text-text-tertiary text-sm">{message}</p>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-text-secondary text-xs font-semibold uppercase tracking-widest font-mono">
        {title}
      </h2>
      {count !== undefined && (
        <span className="px-2 py-0.5 rounded-md bg-bg-secondary border border-[rgba(255,255,255,0.06)] text-text-tertiary text-xs font-mono">
          {count}
        </span>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { data: signals, isLoading: signalsLoading } = useSignals();
  const { data: positions, isLoading: positionsLoading } = usePositions();
  const { data: dashboard } = useDashboard();
  const { data: alerts } = usePositionAlerts();
  const activeAlerts = alerts?.filter((a) => a.urgency !== "LOW") ?? [];
  const tickers = signals?.map((s) => s.ticker) ?? [];
  const { quotes, marketStatus } = useLiveQuotes(tickers);

  const [detailTicker, setDetailTicker] = useState<string | null>(null);
  const [tickerInput, setTickerInput] = useState("");

  const { toasts, show: showToast, dismiss: dismissToast } = useToast();

  const removeSignal = useRemoveSignal({
    onSuccess: (ticker) => showToast(`${ticker} removed`, "success"),
    onError:   (ticker) => showToast(`Failed to remove ${ticker}`, "error"),
  });

  const addSignal = useGenerateSignal({
    onSettled: () => setTickerInput(""),
  });

  const handleAdd = () => {
    const t = tickerInput.trim().toUpperCase();
    if (!t) return;
    addSignal.mutate(t, {
      onSuccess: (sig) => showToast(`${sig.ticker} added — ${sig.signal}`, "success"),
      onError:   (err: unknown) => {
        const detail = (err as { response?: { data?: { detail?: { message?: string; warnings?: string[] } | string } } })?.response?.data?.detail;
        let msg: string;
        if (detail && typeof detail === "object") {
          msg = detail.warnings?.[0] ?? detail.message ?? `Could not add ${t}`;
        } else {
          msg = typeof detail === "string" ? detail : `Could not add ${t}`;
        }
        showToast(msg, "error");
      },
    });
  };

  const pnl = dashboard?.total_pnl ?? 0;
  const wr  = dashboard?.win_rate  ?? 0;

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {detailTicker && (
        <StockDetailModal
          ticker={detailTicker}
          onClose={() => setDetailTicker(null)}
        />
      )}

      <div className="p-6 max-w-screen-xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">
              Dashboard
            </h1>
            <p className="text-text-tertiary text-sm mt-0.5">
              Watchlist signals and open positions
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <MarketPill status={marketStatus} />
            <StatPill
              label="Total P&L"
              value={`${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`}
              valueClass={pnl >= 0 ? "text-accent-green" : "text-accent-red"}
            />
            <StatPill
              label="Win Rate"
              value={`${wr.toFixed(0)}%`}
              valueClass={wr >= 50 ? "text-accent-green" : "text-text-primary"}
            />
          </div>
        </div>

        {/* Position alerts */}
        {activeAlerts.length > 0 && (
          <div className="space-y-2">
            {activeAlerts.map((alert) => (
              <AlertBanner
                key={alert.position_id}
                ticker={alert.ticker}
                reason={alert.reason}
                urgency={alert.urgency}
              />
            ))}
          </div>
        )}

        {/* Signals */}
        <section>
          <SectionHeader title="Signals" count={signals?.length} />
          {signalsLoading ? (
            <div className="skeleton h-64 rounded-xl" />
          ) : signals?.length ? (
            <SignalsTable
              signals={signals}
              quotes={quotes}
              onRowClick={(signal) => setDetailTicker(signal.ticker)}
              onRemove={(ticker) => removeSignal.mutate(ticker)}
              tickerInput={tickerInput}
              onTickerInputChange={setTickerInput}
              onTickerSelect={(symbol) => setTickerInput(symbol)}
              onAddSubmit={handleAdd}
              addPending={addSignal.isPending}
            />
          ) : (
            <div>
              {/* Add ticker bar for empty state */}
              <div className="flex gap-3 mb-4">
                <TickerAutocomplete
                  value={tickerInput}
                  onChange={setTickerInput}
                  onSelect={(symbol) => setTickerInput(symbol)}
                  onSubmit={handleAdd}
                  disabled={addSignal.isPending}
                  placeholder="Add stock to watchlist — e.g. AAPL, TSLA, NVDA"
                />
                <button
                  onClick={handleAdd}
                  disabled={!tickerInput.trim() || addSignal.isPending}
                  className={cn(
                    "px-5 py-3 rounded-xl border text-sm font-semibold flex items-center gap-2 shrink-0 transition-all",
                    "bg-accent-green/10 hover:bg-accent-green/20 border-accent-green/30 text-accent-green",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                  )}
                >
                  {addSignal.isPending ? (
                    <span className="w-4 h-4 border-2 border-accent-green/30 border-t-accent-green rounded-full animate-spin" />
                  ) : (
                    <span className="text-lg leading-none font-light">+</span>
                  )}
                  <span>{addSignal.isPending ? "Adding…" : "Add"}</span>
                </button>
              </div>
              <EmptyState message="No signals yet. Enter a ticker above to analyze." />
            </div>
          )}
        </section>

        {/* Positions */}
        <section>
          <SectionHeader title="Open Positions" count={positions?.length} />
          {positionsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="skeleton h-52 rounded-xl" />
              <div className="skeleton h-52 rounded-xl" />
            </div>
          ) : positions?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {positions.map((pos, i) => (
                <div
                  key={pos.id}
                  className="animate-slide-up"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <PositionCard position={pos} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No open positions. Log a trade to track it here." />
          )}
        </section>
      </div>
    </>
  );
}
