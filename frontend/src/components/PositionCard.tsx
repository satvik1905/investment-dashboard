import React, { useState } from "react";
import type { Position } from "../hooks/usePositions";
import { useClosePosition } from "../hooks/usePositions";
import { useLiveQuotes } from "../hooks/useLivePrice";
import { cn } from "../lib/utils";

interface Props {
  position: Position;
  style?:   React.CSSProperties;
}

export function PositionCard({ position, style }: Props) {
  const [showClose, setShowClose] = useState(false);
  const [exitPrice, setExitPrice]  = useState("");
  const closePosition = useClosePosition();

  // Live price for P&L calc
  const { quotes } = useLiveQuotes([position.ticker]);
  const liveQuote   = quotes[position.ticker];
  const currentPrice = liveQuote?.current_price ?? null;

  const entry    = parseFloat(position.entry_price);
  const pnl      = currentPrice !== null ? (currentPrice - entry) * position.quantity : null;
  const pnlPct   = currentPrice !== null ? ((currentPrice - entry) / entry) * 100 : null;
  const pnlPos   = pnl === null ? null : pnl >= 0;

  const holdDays = Math.floor(
    (Date.now() - new Date(position.entry_date).getTime()) / 86400000,
  );

  const stopLoss    = position.stop_loss    ? parseFloat(position.stop_loss)    : null;
  const targetPrice = position.target_price ? parseFloat(position.target_price) : null;

  // Alert state from position monitor math
  const nearStop = stopLoss !== null && currentPrice !== null
    && currentPrice > stopLoss
    && (currentPrice - stopLoss) / stopLoss <= 0.02;
  const stopHit = stopLoss !== null && currentPrice !== null && currentPrice <= stopLoss;
  const targetHit = targetPrice !== null && currentPrice !== null && currentPrice >= targetPrice;

  const borderCls = stopHit
    ? "border-accent-red/30"
    : nearStop
    ? "border-orange-500/20"
    : targetHit
    ? "border-accent-green/30"
    : "border-[rgba(255,255,255,0.07)]";

  return (
    <div
      className={cn(
        "relative bg-bg-secondary rounded-card border card-hover",
        borderCls,
      )}
      style={style}
    >
      {/* Top bar */}
      <div className={cn(
        "h-[2px] rounded-t-card",
        stopHit || nearStop ? "bg-gradient-to-r from-accent-red/50 to-transparent" :
        targetHit           ? "bg-gradient-to-r from-accent-green/50 to-transparent" :
                              "bg-gradient-to-r from-accent-blue/40 to-transparent",
      )} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="font-mono text-lg font-semibold text-text-primary ticker-glow cursor-default">
              {position.ticker}
            </span>
            <div className="text-text-tertiary text-[11px] mt-0.5 font-mono">
              {position.quantity} shares · {holdDays}d held
            </div>
          </div>

          {/* P&L badge */}
          {pnl !== null && (
            <div className={cn(
              "px-3 py-1.5 rounded-lg border text-right",
              pnlPos
                ? "bg-accent-green/10 border-accent-green/20"
                : "bg-accent-red/10 border-accent-red/20",
            )}>
              <div className={cn("font-mono text-sm font-semibold", pnlPos ? "text-accent-green" : "text-accent-red")}>
                {pnlPos ? "+" : ""}${pnl.toFixed(2)}
              </div>
              <div className={cn("font-mono text-[10px]", pnlPos ? "text-accent-green/70" : "text-accent-red/70")}>
                {pnlPos ? "+" : ""}{pnlPct!.toFixed(2)}%
              </div>
            </div>
          )}
        </div>

        {/* Price grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-bg-tertiary rounded-lg p-2.5">
            <div className="text-text-muted text-[9px] uppercase tracking-widest mb-1 font-mono">Entry</div>
            <div className="font-mono text-xs text-text-primary">${entry.toFixed(2)}</div>
          </div>
          <div className="bg-bg-tertiary rounded-lg p-2.5">
            <div className="text-text-muted text-[9px] uppercase tracking-widest mb-1 font-mono">Current</div>
            <div className={cn(
              "font-mono text-xs",
              currentPrice !== null
                ? currentPrice >= entry ? "text-accent-green" : "text-accent-red"
                : "text-text-tertiary",
            )}>
              {currentPrice !== null ? `$${currentPrice.toFixed(2)}` : "—"}
            </div>
          </div>
          <div className="bg-bg-tertiary rounded-lg p-2.5">
            <div className="text-text-muted text-[9px] uppercase tracking-widest mb-1 font-mono">Cost</div>
            <div className="font-mono text-xs text-text-secondary">
              ${(entry * position.quantity).toFixed(0)}
            </div>
          </div>
        </div>

        {/* Stop / Target */}
        <div className="flex gap-4 mb-4 text-[11px]">
          {stopLoss && (
            <span className={cn("font-mono", stopHit || nearStop ? "text-accent-red" : "text-text-tertiary")}>
              Stop: <span className={stopHit || nearStop ? "font-semibold" : ""}>${stopLoss.toFixed(2)}</span>
            </span>
          )}
          {targetPrice && (
            <span className={cn("font-mono", targetHit ? "text-accent-green" : "text-text-tertiary")}>
              Target: <span className={targetHit ? "font-semibold" : ""}>${targetPrice.toFixed(2)}</span>
            </span>
          )}
        </div>

        {/* Data quality warning */}
        {liveQuote?.data_warning && (
          <div
            className="mb-3 px-3 py-2 rounded-lg border text-[11px] leading-relaxed bg-accent-amber/10 border-accent-amber/25 text-accent-amber"
            title={(liveQuote.data_warning as string[]).join("\n")}
          >
            <span className="font-semibold">⚠ Data quality issue</span> — {(liveQuote.data_warning as string[])[0]}
          </div>
        )}

        {/* Alert messages */}
        {(stopHit || nearStop || targetHit) && (
          <div className={cn(
            "mb-3 px-3 py-2 rounded-lg border text-[11px]",
            stopHit   ? "bg-accent-red/10 border-accent-red/25 text-accent-red" :
            nearStop  ? "bg-orange-500/10 border-orange-500/25 text-orange-400" :
                        "bg-accent-green/10 border-accent-green/25 text-accent-green",
          )}>
            {stopHit   ? "Stop loss hit — consider exiting position" :
             nearStop  ? `Price approaching stop loss (${(((currentPrice! - stopLoss!) / stopLoss!) * 100).toFixed(1)}% away)` :
                         "Target price reached — consider taking profits"}
          </div>
        )}

        {/* Close form */}
        {showClose && (
          <div className="mb-3 flex gap-2">
            <input
              type="number"
              step="0.01"
              placeholder="Exit price"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              className="flex-1 bg-bg-tertiary text-text-primary font-mono text-sm px-3 py-2 rounded-lg border border-[rgba(255,255,255,0.08)] focus:outline-none focus:border-accent-blue/40 placeholder:text-text-tertiary"
            />
            <button
              disabled={!exitPrice || closePosition.isPending}
              onClick={() =>
                closePosition.mutate(
                  { id: position.id, exit_price: parseFloat(exitPrice) },
                  { onSuccess: () => setShowClose(false) },
                )
              }
              className="px-3 py-2 bg-accent-red/20 text-accent-red border border-accent-red/30 rounded-lg text-xs hover:bg-accent-red/30 transition-colors disabled:opacity-50"
            >
              {closePosition.isPending ? "…" : "Confirm"}
            </button>
          </div>
        )}

        {/* Actions */}
        <button
          onClick={() => setShowClose(!showClose)}
          className="w-full text-xs px-3 py-2 rounded-lg bg-bg-tertiary text-text-secondary border border-[rgba(255,255,255,0.07)] hover:bg-accent-red/10 hover:text-accent-red hover:border-accent-red/20 transition-colors"
        >
          {showClose ? "Cancel" : "Close Position"}
        </button>
      </div>
    </div>
  );
}
