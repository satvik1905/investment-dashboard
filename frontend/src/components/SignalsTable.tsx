import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import type { Signal } from "../hooks/useSignals";
import type { LiveQuote } from "../hooks/useLivePrice";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
type ConfidenceVariant = "number" | "bar";

interface Props {
  signals: Signal[];
  quotes: Record<string, LiveQuote>;
  onRowClick: (signal: Signal) => void;
  onRemove: (ticker: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SIGNAL_ORDER: Record<string, number> = {
  STRONG_BUY: 0,
  BUY: 1,
  SELL: 2,
  STRONG_SELL: 3,
  HOLD: 4,
};

const SIGNAL_BADGE_VARIANT: Record<string, "buy" | "strongBuy" | "sell" | "strongSell" | "hold"> = {
  STRONG_BUY: "strongBuy",
  BUY: "buy",
  SELL: "sell",
  STRONG_SELL: "strongSell",
  HOLD: "hold",
};

const SIGNAL_LABEL: Record<string, string> = {
  STRONG_BUY: "STRONG BUY",
  BUY: "BUY",
  SELL: "SELL",
  STRONG_SELL: "STRONG SELL",
  HOLD: "HOLD",
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

// ── Sort arrow ───────────────────────────────────────────────────────────────

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-muted-foreground/50 ml-1 text-[11px]">⇅</span>;
  return <span className="text-foreground ml-1 text-[11px]">{dir === "asc" ? "↑" : "↓"}</span>;
}

// ── Confidence cell — single colour, no threshold ───────────────────────────

function ConfidenceCell({ value, variant }: { value: number | null; variant: ConfidenceVariant }) {
  if (value == null) return <span className="text-muted-foreground font-mono text-xs">—</span>;

  if (variant === "number") {
    return <span className="font-mono text-xs tabular-nums font-semibold text-muted-foreground">{value}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs tabular-nums font-semibold w-6 text-right text-muted-foreground">
        {value}
      </span>
      <div className="flex-1 h-1 rounded-full bg-conf-track min-w-[40px] max-w-[60px]">
        <div
          className="h-full rounded-full bg-conf-fill transition-all"
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

  const badgeVariant = SIGNAL_BADGE_VARIANT[signal.signal] ?? "hold";
  const badgeLabel = SIGNAL_LABEL[signal.signal] ?? "HOLD";

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
      <TableRow
        onClick={() => onRowClick(signal)}
        className="cursor-pointer hover:bg-accent"
      >
        {/* Ticker */}
        <TableCell className="py-2.5 px-3 font-mono text-sm font-semibold text-foreground whitespace-nowrap">
          {signal.ticker}
        </TableCell>

        {/* Signal badge */}
        <TableCell className="py-2.5 px-3">
          <Badge variant={badgeVariant} className="text-[10px] font-bold tracking-wide">
            {badgeLabel}
          </Badge>
        </TableCell>

        {/* Price */}
        <TableCell className={cn(
          "py-2.5 px-3 font-mono text-xs tabular-nums text-right whitespace-nowrap transition-colors duration-300",
          pulsing ? "text-primary" : "text-foreground",
        )}>
          {displayPrice !== null ? `$${displayPrice.toFixed(2)}` : "—"}
        </TableCell>

        {/* Change % — neutral */}
        <TableCell className="py-2.5 px-3 font-mono text-xs tabular-nums text-right whitespace-nowrap text-foreground">
          {changePct !== null ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
        </TableCell>

        {/* Confidence */}
        <TableCell className="py-2.5 px-3">
          <ConfidenceCell value={signal.confidence} variant={confVariant} />
        </TableCell>

        {/* Entry */}
        <TableCell className="py-2.5 px-3 font-mono text-xs tabular-nums text-right text-foreground whitespace-nowrap">
          {entryLow !== null && entryHigh !== null
            ? `$${entryLow.toFixed(2)}–${entryHigh.toFixed(2)}`
            : entryLow !== null
              ? `$${entryLow.toFixed(2)}`
              : "—"}
        </TableCell>

        {/* Target */}
        <TableCell className="py-2.5 px-3 font-mono text-xs tabular-nums text-right text-price-target whitespace-nowrap">
          {target !== null ? `$${target.toFixed(2)}` : "—"}
        </TableCell>

        {/* Stop */}
        <TableCell className="py-2.5 px-3 font-mono text-xs tabular-nums text-right text-price-stop whitespace-nowrap">
          {stop !== null ? `$${stop.toFixed(2)}` : "—"}
        </TableCell>

        {/* Key reason */}
        <TableCell className="py-2.5 px-3 text-xs text-muted-foreground max-w-[180px] truncate" title={signal.key_reason ?? ""}>
          {signal.key_reason ?? "—"}
        </TableCell>

        {/* Actions */}
        <TableCell className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh signal"
              className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 h-7 w-7"
            >
              {refreshing ? (
                <span className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin block" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 4.3 2.1M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleDeleteClick}
              title="Remove from watchlist"
              className="text-red-400 hover:text-destructive hover:bg-red-50 h-7 w-7"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Delete confirmation modal */}
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
            <Button variant="outline" className="flex-1" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="flex-1" onClick={() => { onRemove(signal.ticker); setShowDeleteModal(false); }}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main table component ─────────────────────────────────────────────────────

export function SignalsTable({ signals, quotes, onRowClick, onRemove }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [confVariant, setConfVariant] = useState<ConfidenceVariant>("bar");

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

    if (search) {
      const q = search.toUpperCase();
      list = list.filter((s) => s.ticker.includes(q));
    }

    if (statusFilter !== "all") {
      list = list.filter((s) => {
        if (statusFilter === "BUY") return s.signal === "BUY" || s.signal === "STRONG_BUY";
        if (statusFilter === "SELL") return s.signal === "SELL" || s.signal === "STRONG_SELL";
        if (statusFilter === "HOLD") return s.signal === "HOLD";
        return true;
      });
    }

    if (sortKey) {
      list.sort((a, b) => {
        let cmp = 0;
        const qA = quotes[a.ticker];
        const qB = quotes[b.ticker];
        switch (sortKey) {
          case "ticker":    cmp = a.ticker.localeCompare(b.ticker); break;
          case "signal":    cmp = (SIGNAL_ORDER[a.signal] ?? 4) - (SIGNAL_ORDER[b.signal] ?? 4); break;
          case "price":     cmp = (qA?.current_price ?? 0) - (qB?.current_price ?? 0); break;
          case "change":    cmp = (qA?.change_pct ?? 0) - (qB?.change_pct ?? 0); break;
          case "confidence":cmp = (a.confidence ?? 0) - (b.confidence ?? 0); break;
          case "entry":     cmp = (parseNum(a.entry_zone_low) ?? 0) - (parseNum(b.entry_zone_low) ?? 0); break;
          case "target":    cmp = (parseNum(a.target_price) ?? 0) - (parseNum(b.target_price) ?? 0); break;
          case "stop":      cmp = (parseNum(a.stop_loss) ?? 0) - (parseNum(b.stop_loss) ?? 0); break;
          case "rr":        cmp = (computeRR(a) ?? 0) - (computeRR(b) ?? 0); break;
          case "reason":    cmp = (a.key_reason ?? "").localeCompare(b.key_reason ?? ""); break;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    } else {
      list.sort((a, b) => {
        const aAct = isActionable(a.signal);
        const bAct = isActionable(b.signal);
        if (aAct !== bAct) return aAct ? -1 : 1;
        return (b.confidence ?? 0) - (a.confidence ?? 0);
      });
    }

    return list;
  }, [signals, quotes, search, statusFilter, sortKey, sortDir]);

  const COLS: { key: SortKey; label: string; align?: string }[] = [
    { key: "ticker",     label: "Ticker" },
    { key: "signal",     label: "Signal" },
    { key: "price",      label: "Price",     align: "text-right" },
    { key: "change",     label: "Change %",  align: "text-right" },
    { key: "confidence", label: "Conf" },
    { key: "entry",      label: "Entry",     align: "text-right" },
    { key: "target",     label: "Target",    align: "text-right" },
    { key: "stop",       label: "Stop",      align: "text-right" },
    { key: "reason",     label: "Key Signal" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border bg-muted">
        <div className="relative w-52">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for tickers..."
            className="w-full pl-9 pr-3 py-2 bg-card text-foreground text-xs font-mono placeholder:text-muted-foreground"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-9 bg-card text-foreground text-xs font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs font-mono">All Status</SelectItem>
            <SelectItem value="BUY" className="text-xs font-mono">Buy</SelectItem>
            <SelectItem value="SELL" className="text-xs font-mono">Sell</SelectItem>
            <SelectItem value="HOLD" className="text-xs font-mono">Hold</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => setConfVariant((v) => (v === "number" ? "bar" : "number"))}
          title={`Confidence: ${confVariant === "number" ? "number only" : "number + bar"}`}
          className="text-[10px] font-mono"
        >
          {confVariant === "number" ? "#" : "▬"}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-b border-border">
            {COLS.map((col) => (
              <TableHead
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={cn(
                  "py-2.5 px-3 text-xs font-semibold uppercase tracking-wider font-mono text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap sticky top-0 bg-muted z-10",
                  col.align,
                )}
              >
                {col.label}
                <SortArrow active={sortKey === col.key} dir={sortDir} />
              </TableHead>
            ))}
            <TableHead className="py-2.5 px-3 w-16 sticky top-0 bg-muted z-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {processed.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="py-10 text-center text-muted-foreground text-sm">
                {search || statusFilter !== "all" ? "No signals match your filter." : "No signals yet."}
              </TableCell>
            </TableRow>
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
        </TableBody>
      </Table>
    </div>
  );
}
