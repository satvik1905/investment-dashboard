import { useState } from "react";
import { useSignals, useRemoveSignal, useGenerateSignal } from "../hooks/useSignals";
import { useLiveQuotes } from "../hooks/useLivePrice";
import { StockDetailModal } from "../components/StockDetailModal";
import type { Signal } from "../hooks/useSignals";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SIGNAL_BADGE_VARIANT: Record<string, "buy" | "strongBuy" | "sell" | "strongSell" | "hold"> = {
  STRONG_BUY: "strongBuy",
  BUY: "buy",
  HOLD: "hold",
  SELL: "sell",
  STRONG_SELL: "strongSell",
};

const SIGNAL_LABEL: Record<string, string> = {
  STRONG_BUY: "STRONG BUY",
  BUY: "BUY",
  HOLD: "HOLD",
  SELL: "SELL",
  STRONG_SELL: "STRONG SELL",
};

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
  const badgeVariant = SIGNAL_BADGE_VARIANT[signal.signal] ?? "hold";
  const badgeLabel = SIGNAL_LABEL[signal.signal] ?? "HOLD";
  const price = quote?.current_price;
  const pct = quote?.change_pct ?? 0;
  const isUp = pct >= 0;
  const confidence = signal.confidence ?? 0;

  const dirArrow = (d: string | null) => d === "UP" ? "↑" : d === "DOWN" ? "↓" : "→";
  const dirColor = (d: string | null) =>
    d === "UP" ? "text-accent-green" : d === "DOWN" ? "text-accent-red" : "text-text-tertiary";

  return (
    <TableRow
      onClick={onOpen}
      className="cursor-pointer group"
    >
      {/* Ticker + signal */}
      <TableCell className="py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono text-sm font-semibold text-text-primary group-hover:text-accent-blue transition-colors truncate">
            {signal.ticker}
          </span>
          <Badge variant={badgeVariant} className="text-[10px] font-bold shrink-0">
            {badgeLabel}
          </Badge>
        </div>
      </TableCell>

      {/* Danny color + RSI */}
      <TableCell className="py-3 hidden lg:table-cell">
        <div className="flex items-center gap-2">
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
                  <Badge variant="outline" className={`text-[10px] font-bold font-mono ${dc.cls}`}>
                    {dc.label}
                  </Badge>
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
      </TableCell>

      {/* Price */}
      <TableCell className="py-3 text-right">
        <span className="font-mono text-sm text-text-primary">
          {price != null ? `$${price.toFixed(2)}` : "—"}
        </span>
      </TableCell>

      {/* Change % */}
      <TableCell className="py-3 text-right">
        <span className={`font-mono text-sm ${isUp ? "text-accent-green" : "text-accent-red"}`}>
          {isUp ? "+" : ""}{pct.toFixed(2)}%
        </span>
      </TableCell>

      {/* Confidence bar */}
      <TableCell className="py-3">
        <div className="flex items-center gap-2">
          <Progress
            value={confidence}
            className="flex-1 h-1.5 min-w-[40px] max-w-[80px]"
          />
          <span className="font-mono text-xs text-text-tertiary w-7 text-right">{confidence}</span>
        </div>
      </TableCell>

      {/* Price direction */}
      <TableCell className="py-3">
        <div className="flex items-center gap-1.5 justify-center">
          {[signal.price_direction_3d, signal.price_direction_7d, signal.price_direction_14d].map((d, i) => (
            <span key={i} className={`text-xs font-mono ${dirColor(d)}`} title={["3D","7D","14D"][i]}>
              {dirArrow(d)}
            </span>
          ))}
        </div>
      </TableCell>

      {/* Generated at */}
      <TableCell className="py-3 text-right">
        <span className="text-text-tertiary text-xs">
          {timeAgo(signal.generated_at)}
        </span>
      </TableCell>

      {/* Actions */}
      <TableCell className="py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh signal"
            className="text-text-tertiary hover:text-accent-blue hover:bg-black/[0.04]"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className={refreshing ? "animate-spin" : ""}>
              <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 3.9 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M12 1v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onRemove}
            title="Remove from watchlist"
            className="text-text-tertiary hover:text-accent-red hover:bg-accent-red/10"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M6 4V2h4v2M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Button>
        </div>
      </TableCell>
    </TableRow>
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
        <div className="rounded-xl border border-black/[0.10] bg-bg-secondary overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-black/[0.02]">
                <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Ticker</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary hidden lg:table-cell">Signal Info</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary text-right">Price</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary text-right">Change</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Confidence</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary text-center">Direction</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary text-right">Updated</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <>
                  {[...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <div className="h-10 skeleton rounded-lg" />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ) : signals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-20">
                    <div className="flex flex-col items-center gap-3 text-text-tertiary">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" opacity="0.3">
                        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      </svg>
                      <p className="text-sm">No stocks in watchlist.</p>
                      <p className="text-xs opacity-60">Add stocks from the Dashboard to start tracking.</p>
                    </div>
                  </TableCell>
                </TableRow>
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
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
