import { useState } from "react";
import { useSignals, useRemoveSignal, useGenerateSignal } from "../hooks/useSignals";
import { useLiveQuotes } from "../hooks/useLivePrice";
import { StockDetailModal } from "../components/StockDetailModal";
import type { Signal } from "../hooks/useSignals";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SIGNAL_CFG = {
  STRONG_BUY:  { label: "STRONG BUY",  cls: "bg-accent-green/20 text-accent-green border-accent-green/40" },
  BUY:         { label: "BUY",         cls: "bg-accent-green/10 text-accent-green border-accent-green/30" },
  HOLD:        { label: "HOLD",        cls: "bg-accent-amber/10 text-accent-amber border-accent-amber/30" },
  SELL:        { label: "SELL",        cls: "bg-accent-red/10 text-accent-red border-accent-red/30" },
  STRONG_SELL: { label: "STRONG SELL", cls: "bg-accent-red/20 text-accent-red border-accent-red/40" },
} as const;

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor(diff / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ago`;
  if (h >= 1) return `${h}h ago`;
  if (m >= 1) return `${m}m ago`;
  return "just now";
}

// ── Row component ─────────────────────────────────────────────────────────────

function WatchlistRow({
  signal,
  quote,
  onOpen,
  onRemove,
  onRefresh,
  refreshing,
}: {
  signal: Signal;
  quote: { current_price: number | null; change_pct: number } | undefined;
  onOpen: () => void;
  onRemove: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const cfg = SIGNAL_CFG[signal.signal] ?? SIGNAL_CFG.HOLD;
  const price = quote?.current_price;
  const pct = quote?.change_pct ?? 0;
  const isUp = pct >= 0;
  const confidence = signal.confidence ?? 0;

  const dirArrow = (d: string | null) => d === "UP" ? "↑" : d === "DOWN" ? "↓" : "→";
  const dirColor = (d: string | null) =>
    d === "UP" ? "text-accent-green" : d === "DOWN" ? "text-accent-red" : "text-text-tertiary";

  return (
    <div
      onClick={onOpen}
      className="grid items-center gap-4 px-5 py-4 border-b border-white/[0.05] hover:bg-white/[0.02] cursor-pointer transition-colors group"
      style={{ gridTemplateColumns: "140px 1fr 90px 90px 110px 120px 80px 56px" }}
    >
      {/* Ticker + signal */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="font-mono text-sm font-semibold text-text-primary group-hover:text-accent-blue transition-colors truncate">
          {signal.ticker}
        </span>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.cls}`}>
          {cfg.label}
        </span>
      </div>

      {/* Danny color + RSI */}
      <div className="flex items-center gap-2 hidden lg:flex">
        {(() => {
          const color = signal.raw_indicators?.danny_current_color as string | undefined;
          const rsi = signal.raw_indicators?.rsi_14 as number | undefined;
          const DC_STYLE: Record<string, { label: string; cls: string }> = {
            RED:    { label: "RED",    cls: "bg-red-500/20 text-red-400 border-red-500/30" },
            BLUE:   { label: "BLUE",  cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
            CYAN:   { label: "CYAN",  cls: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
            YELLOW: { label: "YELLOW", cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
          };
          const dc = color ? DC_STYLE[color] : null;
          return (
            <>
              {dc && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border font-mono ${dc.cls}`}>
                  {dc.label}
                </span>
              )}
              {rsi != null && (
                <span className={`font-mono text-xs ${
                  rsi >= 70 ? "text-accent-red" : rsi <= 30 ? "text-accent-green" : "text-text-tertiary"
                }`}>
                  RSI {rsi.toFixed(0)}
                </span>
              )}
            </>
          );
        })()}
      </div>

      {/* Price */}
      <div className="font-mono text-sm text-text-primary text-right">
        {price != null ? `$${price.toFixed(2)}` : "—"}
      </div>

      {/* Change % */}
      <div className={`font-mono text-sm text-right ${isUp ? "text-accent-green" : "text-accent-red"}`}>
        {isUp ? "+" : ""}{pct.toFixed(2)}%
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${confidence}%`,
              background: confidence >= 70 ? "#22c55e" : confidence >= 40 ? "#f59e0b" : "#ef4444",
            }}
          />
        </div>
        <span className="font-mono text-xs text-text-tertiary w-7 text-right">{confidence}</span>
      </div>

      {/* Price direction */}
      <div className="flex items-center gap-1.5 justify-center">
        {[signal.price_direction_3d, signal.price_direction_7d, signal.price_direction_14d].map((d, i) => (
          <span key={i} className={`text-xs font-mono ${dirColor(d)}`} title={["3D","7D","14D"][i]}>
            {dirArrow(d)}
          </span>
        ))}
      </div>

      {/* Generated at */}
      <div className="text-text-tertiary text-xs text-right">
        {timeAgo(signal.generated_at)}
      </div>

      {/* Actions */}
      <div
        className="flex items-center justify-end gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh signal"
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-accent-blue hover:bg-white/[0.05] transition-all disabled:opacity-40"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className={refreshing ? "animate-spin" : ""}>
            <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 3.9 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M12 1v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          onClick={onRemove}
          title="Remove from watchlist"
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-accent-red hover:bg-accent-red/10 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M6 4V2h4v2M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function Watchlist() {
  const { data: signals = [], isLoading } = useSignals();
  const tickers = signals.map((s) => s.ticker);
  const { quotes } = useLiveQuotes(tickers);

  const [detailTicker, setDetailTicker] = useState<string | null>(null);
  const [refreshingTicker, setRefreshingTicker] = useState<string | null>(null);

  const removeSignal = useRemoveSignal();
  const generateSignal = useGenerateSignal();

  const handleRefresh = (ticker: string) => {
    setRefreshingTicker(ticker);
    generateSignal.mutate(ticker, {
      onSettled: () => setRefreshingTicker(null),
    });
  };

  return (
    <>
      {detailTicker && (
        <StockDetailModal
          ticker={detailTicker}
          onClose={() => setDetailTicker(null)}
        />
      )}

      <div className="p-6 max-w-screen-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">Watchlist</h1>
            <p className="text-text-tertiary text-sm mt-0.5">
              {signals.length} stock{signals.length !== 1 ? "s" : ""} tracked
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-white/[0.08] bg-bg-secondary overflow-hidden">
          {/* Column headers */}
          <div
            className="grid items-center gap-4 px-5 py-2.5 border-b border-white/[0.08] bg-white/[0.02]"
            style={{ gridTemplateColumns: "140px 1fr 90px 90px 110px 120px 80px 56px" }}
          >
            {["Ticker", "Signal Info", "Price", "Change", "Confidence", "Direction", "Updated", ""].map((h) => (
              <div key={h} className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary text-right first:text-left [&:nth-child(2)]:text-left">
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="space-y-px">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 skeleton mx-5 my-2 rounded-lg" />
              ))}
            </div>
          ) : signals.length === 0 ? (
            <div className="py-20 flex flex-col items-center gap-3 text-text-tertiary">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" opacity="0.3">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
              <p className="text-sm">No stocks in watchlist.</p>
              <p className="text-xs opacity-60">Add stocks from the Dashboard to start tracking.</p>
            </div>
          ) : (
            signals.map((signal) => (
              <WatchlistRow
                key={signal.id}
                signal={signal}
                quote={quotes[signal.ticker]}
                onOpen={() => setDetailTicker(signal.ticker)}
                onRemove={() => removeSignal.mutate(signal.ticker)}
                onRefresh={() => handleRefresh(signal.ticker)}
                refreshing={refreshingTicker === signal.ticker}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
