import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import type { Signal } from "../hooks/useSignals";
import type { LiveQuote } from "../hooks/useLivePrice";
import { TickerAutocomplete } from "./TickerAutocomplete";
import { cn } from "../lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type SortKey =
  | "ticker"
  | "signal"
  | "price"
  | "change"
  | "confidence"
  | "entry"
  | "target"
  | "stop"
  | "rr"
  | "reason";

type SortDir = "asc" | "desc";
type SignalFilter = "BUY" | "SELL" | "HOLD";
type ConfidenceVariant = "number" | "bar";

interface Props {
  signals: Signal[];
  quotes: Record<string, LiveQuote>;
  onRowClick: (signal: Signal) => void;
  onRemove: (ticker: string) => void;
  tickerInput: string;
  onTickerInputChange: (v: string) => void;
  onTickerSelect: (symbol: string) => void;
  onAddSubmit: () => void;
  addPending: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SIGNAL_ORDER: Record<string, number> = {
  STRONG_BUY: 0,
  BUY: 1,
  SELL: 2,
  STRONG_SELL: 3,
  HOLD: 4,
};

const SIGNAL_CHIP: Record<string, { label: string; cls: string }> = {
  STRONG_BUY: { label: "STRONG BUY", cls: "bg-accent-green/15 text-accent-green border-accent-green/25" },
  BUY:        { label: "BUY",        cls: "bg-accent-green/15 text-accent-green border-accent-green/25" },
  SELL:       { label: "SELL",       cls: "bg-accent-red/15 text-accent-red border-accent-red/25" },
  STRONG_SELL:{ label: "STRONG SELL",cls: "bg-accent-red/15 text-accent-red border-accent-red/25" },
  HOLD:       { label: "HOLD",      cls: "bg-[rgba(255,255,255,0.06)] text-text-tertiary border-[rgba(255,255,255,0.08)]" },
};

function isActionable(sig: string): boolean {
  return sig !== "HOLD";
}

function parseNum(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function computeRR(signal: Signal): number | null {
  const entryLow = parseNum(signal.entry_zone_low);
  const entryHigh = parseNum(signal.entry_zone_high);
  const target = parseNum(signal.target_price);
  const stop = parseNum(signal.stop_loss);
  if (entryLow == null || entryHigh == null || target == null || stop == null) return null;
  const mid = (entryLow + entryHigh) / 2;
  const risk = mid - stop;
  if (risk <= 0) return null;
  return (target - mid) / risk;
}

function confidenceColor(c: number | null): string {
  if (c == null) return "text-text-tertiary";
  if (c >= 70) return "text-accent-green";
  if (c >= 40) return "text-accent-amber";
  return "text-accent-red";
}

function confidenceBarColor(c: number | null): string {
  if (c == null) return "bg-text-tertiary";
  if (c >= 70) return "bg-accent-green";
  if (c >= 40) return "bg-accent-amber";
  return "bg-accent-red";
}

// ── Sort arrow ───────────────────────────────────────────────────────────────

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-text-tertiary/40 ml-1 text-[9px]">⇅</span>;
  return <span className="text-accent-blue ml-1 text-[9px]">{dir === "asc" ? "↑" : "↓"}</span>;
}

// ── Confidence cell ──────────────────────────────────────────────────────────

function ConfidenceCell({ value, variant }: { value: number | null; variant: ConfidenceVariant }) {
  if (value == null) return <span className="text-text-tertiary font-mono text-xs">—</span>;

  if (variant === "number") {
    return <span className={cn("font-mono text-xs tabular-nums font-semibold", confidenceColor(value))}>{value}</span>;
  }

  // bar variant
  return (
    <div className="flex items-center gap-2">
      <span className={cn("font-mono text-xs tabular-nums font-semibold w-6 text-right", confidenceColor(value))}>
        {value}
      </span>
      <div className="flex-1 h-1 rounded-full bg-[rgba(255,255,255,0.06)] min-w-[40px] max-w-[60px]">
        <div
          className={cn("h-full rounded-full transition-all", confidenceBarColor(value))}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── Price pulse hook ─────────────────────────────────────────────────────────

function usePricePulse(price: number | null): boolean {
  const [pulsing, setPulsing] = useState(false);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    if (price !== null && price !== prevRef.current) {
      if (prevRef.current !== null) {
        setPulsing(true);
        const t = setTimeout(() => setPulsing(false), 600);
        return () => clearTimeout(t);
      }
      prevRef.current = price;
    }
  }, [price]);

  return pulsing;
}

// ── Single row ───────────────────────────────────────────────────────────────

function SignalRow({
  signal,
  quote,
  confVariant,
  onRowClick,
  onRemove,
}: {
  signal: Signal;
  quote?: LiveQuote;
  confVariant: ConfidenceVariant;
  onRowClick: (s: Signal) => void;
  onRemove: (ticker: string) => void;
}) {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const livePrice = quote?.current_price ?? null;
  const displayPrice = livePrice ?? (signal.raw_indicators?.current_price as number | undefined) ?? null;
  const changePct = quote?.change_pct ?? null;
  const pulsing = usePricePulse(livePrice);

  const entryLow = parseNum(signal.entry_zone_low);
  const entryHigh = parseNum(signal.entry_zone_high);
  const target = parseNum(signal.target_price);
  const stop = parseNum(signal.stop_loss);
  const rr = computeRR(signal);

  const hold = !isActionable(signal.signal);
  const chip = SIGNAL_CHIP[signal.signal] ?? SIGNAL_CHIP.HOLD;

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

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteModal(true);
  };

  return (
    <>
      <tr
        onClick={() => onRowClick(signal)}
        className={cn(
          "cursor-pointer border-b border-[rgba(255,255,255,0.05)] transition-colors hover:bg-[rgba(255,255,255,0.03)]",
          hold && "opacity-[0.55]",
        )}
      >
        {/* Ticker */}
        <td className="py-2.5 px-3 font-mono text-sm font-semibold text-text-primary ticker-glow whitespace-nowrap">
          {signal.ticker}
        </td>

        {/* Signal chip */}
        <td className="py-2.5 px-3">
          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border tracking-wide whitespace-nowrap", chip.cls)}>
            {chip.label}
          </span>
        </td>

        {/* Price */}
        <td className={cn(
          "py-2.5 px-3 font-mono text-xs tabular-nums text-right whitespace-nowrap transition-colors duration-300",
          pulsing ? "text-accent-blue" : "text-text-primary",
        )}>
          {displayPrice !== null ? `$${displayPrice.toFixed(2)}` : "—"}
        </td>

        {/* Change % */}
        <td className={cn(
          "py-2.5 px-3 font-mono text-xs tabular-nums text-right whitespace-nowrap",
          changePct !== null && changePct >= 0 ? "text-accent-green" : "text-accent-red",
        )}>
          {changePct !== null ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
        </td>

        {/* Confidence */}
        <td className="py-2.5 px-3">
          <ConfidenceCell value={signal.confidence} variant={confVariant} />
        </td>

        {/* Entry */}
        <td className="py-2.5 px-3 font-mono text-xs tabular-nums text-right text-text-secondary whitespace-nowrap">
          {entryLow !== null && entryHigh !== null
            ? `$${entryLow.toFixed(2)}–${entryHigh.toFixed(2)}`
            : entryLow !== null
              ? `$${entryLow.toFixed(2)}`
              : "—"}
        </td>

        {/* Target */}
        <td className="py-2.5 px-3 font-mono text-xs tabular-nums text-right text-accent-green whitespace-nowrap">
          {target !== null ? `$${target.toFixed(2)}` : "—"}
        </td>

        {/* Stop */}
        <td className="py-2.5 px-3 font-mono text-xs tabular-nums text-right text-accent-red whitespace-nowrap">
          {stop !== null ? `$${stop.toFixed(2)}` : "—"}
        </td>

        {/* R:R */}
        <td className="py-2.5 px-3 font-mono text-xs tabular-nums text-right text-text-secondary whitespace-nowrap">
          {rr !== null ? `${rr.toFixed(1)}:1` : "—"}
        </td>

        {/* Key reason */}
        <td className="py-2.5 px-3 text-xs text-text-secondary max-w-[180px] truncate" title={signal.key_reason ?? ""}>
          {signal.key_reason ?? "—"}
        </td>

        {/* Actions */}
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh signal"
              className="w-6 h-6 flex items-center justify-center rounded-md text-text-muted hover:text-accent-blue hover:bg-accent-blue/10 transition-all disabled:opacity-40"
            >
              {refreshing ? (
                <span className="w-3 h-3 border-[1.5px] border-accent-blue/30 border-t-accent-blue rounded-full animate-spin block" />
              ) : (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M10 6A4 4 0 1 1 6 2a4 4 0 0 1 3.12 1.5M10 2v2.5H7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            <button
              onClick={handleDeleteClick}
              title="Remove from watchlist"
              className="w-6 h-6 flex items-center justify-center rounded-md text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-all"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M2 3h8M5 3V2h2v1M3 3l.5 7h5l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <tr>
          <td colSpan={11} className="p-0">
            <div
              className="fixed inset-0 z-50 flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)} />
              <div className="relative z-10 w-80 bg-bg-secondary border border-[rgba(255,255,255,0.1)] rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-center w-11 h-11 rounded-full bg-accent-red/10 border border-accent-red/20 mx-auto mb-4">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M3 5h14M8 5V3.5h4V5M4 5l1 12h10l1-12" stroke="#F43F5E" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="text-text-primary font-semibold text-center text-sm mb-1">
                  Remove {signal.ticker}?
                </h3>
                <p className="text-text-tertiary text-xs text-center leading-relaxed mb-5">
                  This will remove <span className="font-mono text-text-secondary">{signal.ticker}</span> from your watchlist.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] text-text-secondary text-sm hover:bg-bg-tertiary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { onRemove(signal.ticker); setShowDeleteModal(false); }}
                    className="flex-1 py-2.5 rounded-xl bg-accent-red/15 border border-accent-red/30 text-accent-red text-sm hover:bg-accent-red/25 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main table component ─────────────────────────────────────────────────────

export function SignalsTable({ signals, quotes, onRowClick, onRemove, tickerInput, onTickerInputChange, onTickerSelect, onAddSubmit, addPending }: Props) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Set<SignalFilter>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [confVariant, setConfVariant] = useState<ConfidenceVariant>("bar");

  const toggleFilter = (f: SignalFilter) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" || key === "reason" ? "asc" : "desc");
    }
  };

  const processed = useMemo(() => {
    let list = [...signals];

    // Search filter
    if (search) {
      const q = search.toUpperCase();
      list = list.filter((s) => s.ticker.includes(q));
    }

    // Signal type filter
    if (filters.size > 0) {
      list = list.filter((s) => {
        if (filters.has("BUY") && (s.signal === "BUY" || s.signal === "STRONG_BUY")) return true;
        if (filters.has("SELL") && (s.signal === "SELL" || s.signal === "STRONG_SELL")) return true;
        if (filters.has("HOLD") && s.signal === "HOLD") return true;
        return false;
      });
    }

    // Sort
    if (sortKey) {
      list.sort((a, b) => {
        let cmp = 0;
        const qA = quotes[a.ticker];
        const qB = quotes[b.ticker];

        switch (sortKey) {
          case "ticker":
            cmp = a.ticker.localeCompare(b.ticker);
            break;
          case "signal":
            cmp = (SIGNAL_ORDER[a.signal] ?? 4) - (SIGNAL_ORDER[b.signal] ?? 4);
            break;
          case "price":
            cmp = (qA?.current_price ?? 0) - (qB?.current_price ?? 0);
            break;
          case "change":
            cmp = (qA?.change_pct ?? 0) - (qB?.change_pct ?? 0);
            break;
          case "confidence":
            cmp = (a.confidence ?? 0) - (b.confidence ?? 0);
            break;
          case "entry": {
            const eA = parseNum(a.entry_zone_low) ?? 0;
            const eB = parseNum(b.entry_zone_low) ?? 0;
            cmp = eA - eB;
            break;
          }
          case "target":
            cmp = (parseNum(a.target_price) ?? 0) - (parseNum(b.target_price) ?? 0);
            break;
          case "stop":
            cmp = (parseNum(a.stop_loss) ?? 0) - (parseNum(b.stop_loss) ?? 0);
            break;
          case "rr":
            cmp = (computeRR(a) ?? 0) - (computeRR(b) ?? 0);
            break;
          case "reason":
            cmp = (a.key_reason ?? "").localeCompare(b.key_reason ?? "");
            break;
        }

        return sortDir === "asc" ? cmp : -cmp;
      });
    } else {
      // Default sort: actionable first (BUY/SELL), then HOLD. Within each group, confidence desc.
      list.sort((a, b) => {
        const aAct = isActionable(a.signal);
        const bAct = isActionable(b.signal);
        if (aAct !== bAct) return aAct ? -1 : 1;
        return (b.confidence ?? 0) - (a.confidence ?? 0);
      });
    }

    return list;
  }, [signals, quotes, search, filters, sortKey, sortDir]);

  const COLS: { key: SortKey; label: string; align?: string }[] = [
    { key: "ticker",     label: "Ticker" },
    { key: "signal",     label: "Signal" },
    { key: "price",      label: "Price",     align: "text-right" },
    { key: "change",     label: "Change %",  align: "text-right" },
    { key: "confidence", label: "Conf" },
    { key: "entry",      label: "Entry",     align: "text-right" },
    { key: "target",     label: "Target",    align: "text-right" },
    { key: "stop",       label: "Stop",      align: "text-right" },
    { key: "rr",         label: "R:R",       align: "text-right" },
    { key: "reason",     label: "Key Signal" },
  ];

  const filterActive = (f: SignalFilter) => filters.size === 0 || filters.has(f);

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            width="13" height="13" viewBox="0 0 14 14" fill="none"
          >
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter tickers..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-secondary border border-[rgba(255,255,255,0.07)] text-text-primary text-xs font-mono placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue/40 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Confidence variant toggle */}
          <button
            onClick={() => setConfVariant((v) => (v === "number" ? "bar" : "number"))}
            title={`Confidence: ${confVariant === "number" ? "number only" : "number + bar"}`}
            className="w-7 h-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-secondary hover:bg-[rgba(255,255,255,0.05)] transition-all text-[10px] font-mono border border-[rgba(255,255,255,0.06)]"
          >
            {confVariant === "number" ? "#" : "▬"}
          </button>

          {/* Filter chips */}
          {(["BUY", "SELL", "HOLD"] as SignalFilter[]).map((f) => {
            const active = filterActive(f);
            const colors: Record<SignalFilter, { on: string; off: string }> = {
              BUY:  { on: "bg-accent-green/15 text-accent-green border-accent-green/25", off: "text-text-tertiary border-[rgba(255,255,255,0.06)]" },
              SELL: { on: "bg-accent-red/15 text-accent-red border-accent-red/25",       off: "text-text-tertiary border-[rgba(255,255,255,0.06)]" },
              HOLD: { on: "bg-[rgba(255,255,255,0.08)] text-text-secondary border-[rgba(255,255,255,0.1)]", off: "text-text-tertiary border-[rgba(255,255,255,0.06)]" },
            };
            const cls = filters.size === 0
              ? colors[f].on  // All active when none selected
              : active ? colors[f].on : colors[f].off;
            return (
              <button
                key={f}
                onClick={() => toggleFilter(f)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[10px] font-bold border tracking-wide transition-all",
                  cls,
                )}
              >
                {f}
              </button>
            );
          })}

          {/* Add ticker */}
          <div className="flex items-center gap-2">
            <TickerAutocomplete
              value={tickerInput}
              onChange={onTickerInputChange}
              onSelect={onTickerSelect}
              onSubmit={onAddSubmit}
              disabled={addPending}
              placeholder="Add ticker..."
            />
            <button
              onClick={onAddSubmit}
              disabled={!tickerInput.trim() || addPending}
              className={cn(
                "px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-all",
                "bg-accent-green/10 hover:bg-accent-green/20 border-accent-green/30 text-accent-green",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {addPending ? (
                <span className="w-3 h-3 border-[1.5px] border-accent-green/30 border-t-accent-green rounded-full animate-spin block" />
              ) : (
                <span className="text-sm leading-none font-light">+</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[rgba(255,255,255,0.07)] bg-bg-secondary overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.1)]">
                {COLS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={cn(
                      "py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest font-mono text-text-tertiary cursor-pointer select-none hover:text-text-secondary transition-colors whitespace-nowrap sticky top-0 bg-bg-secondary z-10",
                      col.align,
                    )}
                  >
                    {col.label}
                    <SortArrow active={sortKey === col.key} dir={sortDir} />
                  </th>
                ))}
                {/* Actions header */}
                <th className="py-2.5 px-3 w-16 sticky top-0 bg-bg-secondary z-10" />
              </tr>
            </thead>
            <tbody>
              {processed.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-text-tertiary text-sm">
                    {search || filters.size > 0 ? "No signals match your filter." : "No signals yet."}
                  </td>
                </tr>
              ) : (
                processed.map((signal) => (
                  <SignalRow
                    key={signal.id}
                    signal={signal}
                    quote={quotes[signal.ticker]}
                    confVariant={confVariant}
                    onRowClick={onRowClick}
                    onRemove={onRemove}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
