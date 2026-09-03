import React, { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import type { Signal } from "../hooks/useSignals";
import type { LiveQuote } from "../hooks/useLivePrice";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props {
  signal:    Signal;
  liveQuote?: LiveQuote;
  style?:    React.CSSProperties;
  onRemove?: (ticker: string) => void;
}

// ── Signal config ─────────────────────────────────────────────────────────────

const SIGNAL_CFG = {
  STRONG_BUY:  { label: "STRONG BUY",  color: "green" },
  BUY:         { label: "BUY",         color: "green" },
  HOLD:        { label: "HOLD",        color: "amber" },
  SELL:        { label: "SELL",        color: "red"   },
  STRONG_SELL: { label: "STRONG SELL", color: "red"   },
} as const;

type SignalColor = "green" | "amber" | "red";

const COLOR_CLASSES: Record<SignalColor, { badge: "buy" | "strongBuy" | "sell" | "strongSell" | "hold"; ring: string }> = {
  green: {
    badge: "buy",
    ring:  "border-primary/20",
  },
  amber: {
    badge: "hold",
    ring:  "border-status-after/20",
  },
  red: {
    badge: "sell",
    ring:  "border-destructive/20",
  },
};

const SIGNAL_BADGE_VARIANT: Record<string, "buy" | "strongBuy" | "sell" | "strongSell" | "hold"> = {
  STRONG_BUY: "strongBuy",
  BUY: "buy",
  HOLD: "hold",
  SELL: "sell",
  STRONG_SELL: "strongSell",
};

// ── Alert detection ───────────────────────────────────────────────────────────

type AlertLevel = "stop_hit" | "target_hit" | "near_stop" | "below_entry" | null;

function alertForConditions(
  price: number | null,
  entryLow: number | null,
  stopLoss: number | null,
  targetPrice: number | null,
  isBuy: boolean,
): AlertLevel {
  if (price === null) return null;
  if (stopLoss    !== null && price <= stopLoss)                                           return "stop_hit";
  if (targetPrice !== null && price >= targetPrice)                                        return "target_hit";
  if (stopLoss    !== null && price > stopLoss && (price - stopLoss) / stopLoss <= 0.02)  return "near_stop";
  if (isBuy && entryLow !== null && price < entryLow)                                     return "below_entry";
  return null;
}

function AlertStrip({ level, price, stopLoss, targetPrice, entryLow, entryHigh }: {
  level: AlertLevel; price: number | null; stopLoss: number | null;
  targetPrice: number | null; entryLow: number | null; entryHigh: number | null;
}) {
  if (!level || price === null) return null;
  const configs: Record<NonNullable<AlertLevel>, { cls: string; text: React.ReactNode }> = {
    stop_hit: {
      cls: "bg-destructive/10 border-destructive/25 text-destructive",
      text: <><span className="font-semibold">STOP HIT</span> — Exit now. Invalidated at ${stopLoss?.toFixed(2)}.</>,
    },
    target_hit: {
      cls: "bg-primary/10 border-primary/25 text-primary",
      text: <><span className="font-semibold">TARGET ${targetPrice?.toFixed(2)}</span> — Take profits now.</>,
    },
    near_stop: {
      cls: "bg-orange-500/10 border-orange-500/25 text-orange-400",
      text: <>Price <span className="font-mono">${price.toFixed(2)}</span> approaching stop <span className="font-mono">${stopLoss?.toFixed(2)}</span></>,
    },
    below_entry: {
      cls: "bg-status-after/10 border-status-after/25 text-status-after",
      text: <>Below entry zone <span className="font-mono">{entryLow && entryHigh ? `$${entryLow.toFixed(2)}–$${entryHigh.toFixed(2)}` : "—"}</span> — wait.</>,
    },
  };
  const { cls, text } = configs[level];
  return (
    <Alert className={cn("mb-3 px-3 py-2 rounded-lg text-[11px] leading-relaxed", cls)}>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

// ── Direction indicator ───────────────────────────────────────────────────────

function Dir({ dir }: { dir: string | null }) {
  if (!dir) return null;
  return (
    <span className={cn(
      "font-mono text-[10px]",
      dir === "UP" ? "text-primary" : dir === "DOWN" ? "text-destructive" : "text-muted-foreground"
    )}>
      {dir === "UP" ? "↑" : dir === "DOWN" ? "↓" : "—"}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SignalCard({ signal, liveQuote, style, onRemove }: Props) {
  const qc = useQueryClient();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pulsing, setPulsing]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const prevPriceRef = useRef<number | null>(null);

  const livePrice = liveQuote?.current_price ?? null;

  useEffect(() => {
    if (livePrice !== null && livePrice !== prevPriceRef.current) {
      if (prevPriceRef.current !== null) {
        setPulsing(true);
        const t = setTimeout(() => setPulsing(false), 600);
        return () => clearTimeout(t);
      }
      prevPriceRef.current = livePrice;
    }
  }, [livePrice]);

  // ── Derived values ────────────────────────────────────────────────────────
  const displayPrice   = livePrice ?? (signal.raw_indicators?.current_price as number | undefined) ?? null;
  const changePct      = liveQuote?.change_pct ?? null;
  const changePositive = changePct !== null && changePct >= 0;

  const entryLow    = signal.entry_zone_low   ? parseFloat(String(signal.entry_zone_low))   : null;
  const entryHigh   = signal.entry_zone_high  ? parseFloat(String(signal.entry_zone_high))  : null;
  const stopLoss    = signal.stop_loss        ? parseFloat(String(signal.stop_loss))        : null;
  const targetPrice = signal.target_price     ? parseFloat(String(signal.target_price))     : null;
  const isBuy       = signal.signal === "STRONG_BUY" || signal.signal === "BUY";

  const alertLevel = alertForConditions(livePrice, entryLow, stopLoss, targetPrice, isBuy);
  const stopHit    = alertLevel === "stop_hit";
  const targetHit  = alertLevel === "target_hit";

  const baseCfg = SIGNAL_CFG[signal.signal] ?? SIGNAL_CFG.HOLD;
  const sigColor: SignalColor = stopHit ? "red" : targetHit ? "green" : baseCfg.color as SignalColor;
  const sigLabel = stopHit ? "STOP HIT" : targetHit ? "TARGET HIT" : baseCfg.label;
  const colorCls = COLOR_CLASSES[sigColor];

  // Badge variant
  const badgeVariant = stopHit ? "sell" as const : targetHit ? "strongBuy" as const : SIGNAL_BADGE_VARIANT[signal.signal] ?? "hold" as const;

  // Danny Cheng candle label
  const dannyColor: string | undefined = signal.raw_indicators?.danny_current_color as string | undefined;
  const dannyLabel =
    dannyColor === "RED"    ? "Red candle · Reversal BUY setup" :
    dannyColor === "YELLOW" ? "Yellow candle · Reversal SELL setup" :
    dannyColor === "BLUE"   ? "Blue candle · In uptrend" :
    dannyColor === "CYAN"   ? "Cyan candle · In downtrend" :
    null;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (refreshing) return;
    setRefreshing(true);
    try {
      await api.post(`/api/signals/generate?ticker=${signal.ticker}`);
      qc.invalidateQueries({ queryKey: ["signals"] });
    } catch { /* silent */ }
    finally { setRefreshing(false); }
  };

  return (
    <Card
      className={cn(
        "relative bg-card rounded-card border",
        "transition-colors duration-200 p-0",
        stopHit           ? "border-destructive/30" :
        targetHit         ? "border-primary/30" :
        alertLevel === "near_stop" ? "border-orange-500/20" :
        "border-border hover:border-input",
      )}
      style={style}
    >
      {/* Top accent bar based on signal */}
      <div className={cn(
        "h-[2px] w-full rounded-t-card",
        sigColor === "green" ? "bg-gradient-to-r from-primary/60 to-transparent" :
        sigColor === "red"   ? "bg-gradient-to-r from-destructive/60 to-transparent" :
                               "bg-gradient-to-r from-status-after/60 to-transparent",
      )} />

      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="font-mono text-[22px] font-semibold text-foreground cursor-default leading-none">
                {signal.ticker}
              </span>
              {displayPrice !== null && (
                <span className={cn(
                  "font-mono text-sm transition-colors duration-300 leading-none",
                  pulsing ? "text-blue-400" : "text-muted-foreground",
                )}>
                  ${displayPrice.toFixed(2)}
                </span>
              )}
              {changePct !== null && (
                <span className={cn(
                  "font-mono text-xs leading-none",
                  changePositive ? "text-primary" : "text-destructive",
                )}>
                  {changePositive ? "+" : ""}{changePct.toFixed(2)}%
                </span>
              )}
            </div>

            {/* Momentum directions */}
            <div className="flex items-center gap-1.5 mt-2">
              <Dir dir={signal.price_direction_3d} />
              <span className="text-muted-foreground text-[9px] font-mono">3d</span>
              <Dir dir={signal.price_direction_7d} />
              <span className="text-muted-foreground text-[9px] font-mono">7d</span>
              <Dir dir={signal.price_direction_14d} />
              <span className="text-muted-foreground text-[9px] font-mono">14d</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {/* Signal badge */}
            <Badge variant={badgeVariant} className="text-[10px] font-bold tracking-wide">
              {sigLabel}
            </Badge>

            {/* Refresh */}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh signal"
              className="text-muted-foreground hover:text-ring hover:bg-ring/10"
            >
              {refreshing ? (
                <span className="w-3 h-3 border-[1.5px] border-ring/30 border-t-ring rounded-full animate-spin block" />
              ) : (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M10 6A4 4 0 1 1 6 2a4 4 0 0 1 3.12 1.5M10 2v2.5H7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </Button>

            {/* Delete */}
            {onRemove && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => { e.stopPropagation(); setShowDeleteModal(true); }}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="Remove from watchlist"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 3h8M5 3V2h2v1M3 3l.5 7h5l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Button>
            )}
          </div>
        </div>

        {/* Data quality warning */}
        {signal.raw_indicators?.data_warning && (
          <Alert
            className="mb-3 px-3 py-2 rounded-lg text-[11px] leading-relaxed bg-status-after/10 border-status-after/25 text-status-after"
            title={(signal.raw_indicators.data_warning as string[]).join("\n")}
          >
            <AlertDescription>
              <span className="font-semibold">⚠ Data quality issue</span> — {(signal.raw_indicators.data_warning as string[])[0]}
            </AlertDescription>
          </Alert>
        )}

        {/* Alert strip */}
        <AlertStrip
          level={alertLevel} price={livePrice}
          stopLoss={stopLoss} targetPrice={targetPrice}
          entryLow={entryLow} entryHigh={entryHigh}
        />

        {/* Price levels */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            {
              label: "Entry",
              value: entryLow && entryHigh ? `$${entryLow.toFixed(2)}–${entryHigh.toFixed(2)}` : entryLow ? `$${entryLow.toFixed(2)}` : "—",
              highlight: alertLevel === "below_entry",
              highlightCls: "bg-status-after/8 border border-status-after/15",
              valueCls: alertLevel === "below_entry" ? "text-status-after" : "text-foreground",
            },
            {
              label: "Target",
              value: targetPrice ? `$${targetPrice.toFixed(2)}` : "—",
              highlight: targetHit,
              highlightCls: "bg-primary/8 border border-primary/15",
              valueCls: "text-primary",
            },
            {
              label: "Stop",
              value: stopLoss ? `$${stopLoss.toFixed(2)}` : "—",
              highlight: stopHit || alertLevel === "near_stop",
              highlightCls: "bg-destructive/8 border border-destructive/15",
              valueCls: stopHit || alertLevel === "near_stop" ? "text-destructive font-semibold" : "text-destructive",
            },
          ].map((lvl) => (
            <div
              key={lvl.label}
              className={cn(
                "rounded-lg p-2.5",
                lvl.highlight ? lvl.highlightCls : "bg-muted",
              )}
            >
              <div className="text-muted-foreground text-[9px] uppercase tracking-widest mb-1 font-mono">
                {lvl.label}
              </div>
              <div className={cn("font-mono text-xs leading-tight", lvl.valueCls)}>
                {lvl.value}
              </div>
            </div>
          ))}
        </div>

        {/* Danny Cheng state */}
        {dannyLabel && (
          <div className="text-muted-foreground text-[10px] font-mono mt-1">{dannyLabel}</div>
        )}
      </CardContent>

      {/* Delete modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="w-80" showCloseButton={false} onClick={(e) => e.stopPropagation()}>
          <DialogHeader className="items-center">
            <div className="flex items-center justify-center w-11 h-11 rounded-full bg-destructive/10 border border-destructive/20 mb-2">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 5h14M8 5V3.5h4V5M4 5l1 12h10l1-12" stroke="hsl(var(--destructive))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <DialogTitle className="text-foreground text-center text-sm">
              Remove {signal.ticker}?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs text-center leading-relaxed">
              This will remove <span className="font-mono text-foreground">{signal.ticker}</span> from your watchlist.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => { onRemove!(signal.ticker); setShowDeleteModal(false); }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
