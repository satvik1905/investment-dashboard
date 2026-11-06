import { useState, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "../api/client";
import { describeError } from "./ErrorState";
import { isStale, signalAge } from "@/lib/freshness";
import { CandleSwatch, type CandleColor } from "./CandleSwatch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
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
  | "state"
  | "price"
  | "change"
  | "confidence"
  | "age";

type SortDir = "asc" | "desc";
type ConfidenceVariant = "number" | "bar";

interface Props {
  signals: Signal[];
  quotes: Record<string, LiveQuote>;
  onRowClick: (signal: Signal) => void;
  onRemove: (ticker: string) => void;
}

// ── Candle state ─────────────────────────────────────────────────────────────

// A flip within this many candles (the flip candle and the one after) counts as new
const RECENT_FLIP_CANDLES = 2;

const STATE_LABEL: Record<CandleColor, string> = {
  RED: "Bullish flip",
  YELLOW: "Bearish flip",
  BLUE: "Uptrend",
  CYAN: "Downtrend",
};

// Fresh flips first, then trends; within a trend, the most recent flip first
const STATE_ORDER: Record<CandleColor, number> = { RED: 0, YELLOW: 1, BLUE: 2, CYAN: 3 };

interface CandleState {
  color: CandleColor | null;
  label: string;
  detail: string;
  sinceFlip: number | null;
}

function candleState(signal: Signal): CandleState {
  const ri = signal.raw_indicators ?? {};
  // Older rows may lack Danny Cheng fields; fall back to the signal itself
  const color =
    (ri.danny_current_color as CandleColor | undefined) ??
    (signal.signal.endsWith("BUY") ? "RED" : signal.signal.endsWith("SELL") ? "YELLOW" : null);
  const sinceFlip = (ri.danny_candles_since_signal as number | undefined) ?? null;
  const lastFlip = (ri.danny_last_signal_color as string | null | undefined) ?? null;

  if (!color) return { color: null, label: "Hold", detail: "Trend data unavailable", sinceFlip };

  let detail: string;
  if (color === "RED" || color === "YELLOW") {
    detail = `${color === "RED" ? "Red" : "Yellow"} candle on the latest close`;
  } else if (lastFlip && sinceFlip != null) {
    detail = `${sinceFlip} candle${sinceFlip === 1 ? "" : "s"} since ${lastFlip.toLowerCase()} flip`;
  } else {
    detail = "No flip in the last 6 months";
  }
  return { color, label: STATE_LABEL[color], detail, sinceFlip };
}

function needsAttention(signal: Signal): boolean {
  const { sinceFlip } = candleState(signal);
  return (sinceFlip != null && sinceFlip < RECENT_FLIP_CANDLES) || isStale(signal.generated_at);
}

function defaultOrder(a: Signal, b: Signal): number {
  const sa = candleState(a);
  const sb = candleState(b);
  const byState = (sa.color ? STATE_ORDER[sa.color] : 9) - (sb.color ? STATE_ORDER[sb.color] : 9);
  if (byState !== 0) return byState;
  return (sa.sinceFlip ?? 999) - (sb.sinceFlip ?? 999);
}

function StateCell({ signal }: { signal: Signal }) {
  const state = candleState(signal);
  return (
    <div className="flex items-center gap-2.5" title={signal.key_reason ?? undefined}>
      {state.color ? <CandleSwatch color={state.color} className="h-4" /> : <span className="w-1.5 shrink-0" />}
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground leading-snug">{state.label}</div>
        <div className="text-xs text-muted-foreground leading-snug truncate">{state.detail}</div>
      </div>
    </div>
  );
}

// ── Sort arrow ───────────────────────────────────────────────────────────────

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden className="shrink-0">
      <path d="M2.5 4L5 1.5 7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
        className={active && dir === "asc" ? "text-foreground" : active ? "opacity-0" : "opacity-40"} />
      <path d="M2.5 6L5 8.5 7.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
        className={active && dir === "desc" ? "text-foreground" : active ? "opacity-0" : "opacity-40"} />
    </svg>
  );
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

// ── Row actions (shared by table rows and phone cards) ───────────────────────

function useRowActions(signal: Signal, onRemove: (ticker: string) => void) {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await api.post(`/api/signals/generate?ticker=${signal.ticker}`);
      qc.invalidateQueries({ queryKey: ["signals"] });
    } catch (err) {
      toast.error(`Couldn't refresh ${signal.ticker}`, { description: describeError(err) });
    } finally {
      setRefreshing(false);
    }
  };

  const removeDialog = (
    <Dialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
      <DialogContent className="w-80" showCloseButton={false} onClick={(e) => e.stopPropagation()}>
        <DialogHeader className="items-center">
          <div className="flex items-center justify-center w-11 h-11 rounded-full bg-destructive/10 border border-destructive/20 mb-2">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M8 5V3.5h4V5M4 5l1 12h10l1-12" stroke="var(--destructive)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
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
          <Button variant="outline" className="flex-1" onClick={() => setConfirmingRemove(false)}>
            Cancel
          </Button>
          <Button variant="destructive" className="flex-1" onClick={() => { onRemove(signal.ticker); setConfirmingRemove(false); }}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { refreshing, refresh, askRemove: () => setConfirmingRemove(true), removeDialog };
}

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 4.3 2.1M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M3 4h10M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ── Signal age — stale once a newer daily close exists ───────────────────────

function AgeLabel({ signal }: { signal: Signal }) {
  if (isStale(signal.generated_at)) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border border-status-after/40 bg-status-after/10 px-1.5 py-px text-[11px] font-medium text-amber-800 whitespace-nowrap"
        title={signal.generated_at ? `Calculated ${new Date(signal.generated_at).toLocaleString()} — before the last market close` : "Never calculated"}
      >
        <span className="font-mono tabular-nums">{signalAge(signal.generated_at)}</span> old
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap" title={signal.generated_at ? new Date(signal.generated_at).toLocaleString() : undefined}>
      {signalAge(signal.generated_at)}
    </span>
  );
}

function rowPrices(signal: Signal, quote?: LiveQuote) {
  const livePrice = quote?.current_price ?? null;
  const price = livePrice ?? (signal.raw_indicators?.current_price as number | undefined) ?? null;
  const changePct = quote?.change_pct ?? null;
  return {
    livePrice,
    price: price !== null ? `$${price.toFixed(2)}` : "—",
    change: changePct !== null ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "—",
  };
}

// ── Desktop table row ────────────────────────────────────────────────────────

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
  const actions = useRowActions(signal, onRemove);
  const { livePrice, price, change } = rowPrices(signal, quote);
  const pulsing = usePricePulse(livePrice);

  return (
    <>
      <TableRow
        onClick={() => onRowClick(signal)}
        className="cursor-pointer hover:bg-accent"
      >
        {/* Ticker — the keyboard and screen-reader way into the row */}
        <TableCell className="py-2.5 px-3 pl-4 whitespace-nowrap">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRowClick(signal); }}
            aria-label={`Open ${signal.ticker} chart and signal`}
            className="font-mono text-sm font-semibold text-foreground hover:text-primary hover:underline underline-offset-4 rounded-sm"
          >
            {signal.ticker}
          </button>
        </TableCell>

        {/* Candle state */}
        <TableCell className="py-2.5 px-3 max-w-[260px]">
          <StateCell signal={signal} />
        </TableCell>

        {/* Price */}
        <TableCell className={cn(
          "py-2.5 px-3 font-mono text-xs tabular-nums text-right whitespace-nowrap transition-colors duration-300",
          pulsing ? "text-primary" : "text-foreground",
        )}>
          {price}
        </TableCell>

        {/* Change % — neutral */}
        <TableCell className="py-2.5 px-3 font-mono text-xs tabular-nums text-right whitespace-nowrap text-foreground">
          {change}
        </TableCell>

        {/* Confidence */}
        <TableCell className="py-2.5 px-3">
          <ConfidenceCell value={signal.confidence} variant={confVariant} />
        </TableCell>

        {/* Signal age */}
        <TableCell className="py-2.5 px-3 text-right">
          <AgeLabel signal={signal} />
        </TableCell>

        {/* Actions */}
        <TableCell className="py-2.5 px-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => { e.stopPropagation(); actions.refresh(); }}
              disabled={actions.refreshing}
              title="Refresh signal"
              aria-label={`Refresh ${signal.ticker} signal`}
              className="text-muted-foreground hover:text-foreground hover:bg-accent h-7 w-7"
            >
              {actions.refreshing ? (
                <span className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin block" />
              ) : (
                <RefreshIcon />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => { e.stopPropagation(); actions.askRemove(); }}
              title="Remove from watchlist"
              aria-label={`Remove ${signal.ticker} from watchlist`}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-7 w-7"
            >
              <TrashIcon />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {actions.removeDialog}
    </>
  );
}

// ── Phone card ───────────────────────────────────────────────────────────────

function SignalCard({
  signal,
  quote,
  onRowClick,
  onRemove,
}: {
  signal: Signal;
  quote?: LiveQuote;
  onRowClick: (s: Signal) => void;
  onRemove: (ticker: string) => void;
}) {
  const actions = useRowActions(signal, onRemove);
  const [menuOpen, setMenuOpen] = useState(false);
  const { livePrice, price, change } = rowPrices(signal, quote);
  const pulsing = usePricePulse(livePrice);

  return (
    <li className="flex items-stretch border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => onRowClick(signal)}
        className="flex-1 min-w-0 text-left pl-4 pr-1 py-3 active:bg-accent cursor-pointer"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[15px] font-semibold text-foreground">{signal.ticker}</span>
          <span className="font-mono text-sm tabular-nums whitespace-nowrap">
            <span className={cn("transition-colors duration-300", pulsing ? "text-primary" : "text-foreground")}>{price}</span>
            <span className="text-muted-foreground text-xs ml-2">{change}</span>
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <StateCell signal={signal} />
          <AgeLabel signal={signal} />
        </div>
      </button>

      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${signal.ticker}`}
            className="w-11 shrink-0 flex items-center justify-center text-muted-foreground active:bg-accent cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" />
            </svg>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-1">
          <button
            type="button"
            disabled={actions.refreshing}
            onClick={() => { actions.refresh(); setMenuOpen(false); }}
            className="w-full flex items-center gap-2.5 rounded-md px-3 h-11 text-sm text-foreground hover:bg-accent disabled:opacity-50 cursor-pointer"
          >
            <RefreshIcon /> {actions.refreshing ? "Refreshing…" : "Refresh signal"}
          </button>
          <button
            type="button"
            onClick={() => { setMenuOpen(false); actions.askRemove(); }}
            className="w-full flex items-center gap-2.5 rounded-md px-3 h-11 text-sm text-destructive hover:bg-destructive/10 cursor-pointer"
          >
            <TrashIcon /> Remove from watchlist
          </button>
        </PopoverContent>
      </Popover>
      {actions.removeDialog}
    </li>
  );
}

// ── Group header row ─────────────────────────────────────────────────────────

function GroupHeader({ title, count, note }: { title: string; count: number; note: string }) {
  return (
    <TableRow className="hover:bg-transparent border-b border-border">
      <TableCell colSpan={COL_COUNT} className="pt-5 pb-2 px-4 bg-card">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>
          <span className="text-xs text-muted-foreground">· {note}</span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function MobileGroupHeader({ title, count, note }: { title: string; count: number; note: string }) {
  return (
    <div className="px-4 pt-5 pb-2 border-b border-border">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{note}</p>
    </div>
  );
}

// Ticker, State, Price, Change, Confidence, Updated, actions
const COL_COUNT = 7;

const STATE_FILTERS: { value: string; label: string; color?: CandleColor }[] = [
  { value: "all", label: "All states" },
  { value: "RED", label: "Bullish flips", color: "RED" },
  { value: "YELLOW", label: "Bearish flips", color: "YELLOW" },
  { value: "BLUE", label: "Uptrend", color: "BLUE" },
  { value: "CYAN", label: "Downtrend", color: "CYAN" },
];

// ── Main table component ─────────────────────────────────────────────────────

export function SignalsTable({ signals, quotes, onRowClick, onRemove }: Props) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [confVariant, setConfVariant] = useState<ConfidenceVariant>("bar");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" || key === "state" ? "asc" : "desc");
    }
  };

  const { attention, holding } = useMemo(() => {
    let list = [...signals];

    if (search) {
      const q = search.toUpperCase();
      list = list.filter((s) => s.ticker.includes(q));
    }
    if (stateFilter !== "all") {
      list = list.filter((s) => candleState(s).color === stateFilter);
    }

    const compare = (a: Signal, b: Signal): number => {
      if (!sortKey) return defaultOrder(a, b);
      let cmp = 0;
      const qA = quotes[a.ticker];
      const qB = quotes[b.ticker];
      switch (sortKey) {
        case "ticker":    cmp = a.ticker.localeCompare(b.ticker); break;
        case "state":     cmp = defaultOrder(a, b); break;
        case "price":     cmp = (qA?.current_price ?? 0) - (qB?.current_price ?? 0); break;
        case "change":    cmp = (qA?.change_pct ?? 0) - (qB?.change_pct ?? 0); break;
        case "confidence":cmp = (a.confidence ?? 0) - (b.confidence ?? 0); break;
        case "age":       cmp = new Date(b.generated_at ?? 0).getTime() - new Date(a.generated_at ?? 0).getTime(); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    };

    // Sorting applies within each group; the groups themselves stay in place
    return {
      attention: list.filter(needsAttention).sort(compare),
      holding: list.filter((s) => !needsAttention(s)).sort(compare),
    };
  }, [signals, quotes, search, stateFilter, sortKey, sortDir]);

  const filtering = !!search || stateFilter !== "all";
  const total = attention.length + holding.length;

  const COLS: { key: SortKey; label: string; align?: string }[] = [
    { key: "ticker",     label: "Ticker" },
    { key: "state",      label: "State" },
    { key: "price",      label: "Price",      align: "text-right" },
    { key: "change",     label: "Change",     align: "text-right" },
    { key: "confidence", label: "Confidence" },
    { key: "age",        label: "Updated",    align: "text-right" },
  ];

  const emptyMessage = filtering ? (
    <>
      No signals match your filter.{" "}
      <button
        type="button"
        onClick={() => { setSearch(""); setStateFilter("all"); }}
        className="text-foreground font-medium underline underline-offset-4 hover:text-primary cursor-pointer"
      >
        Clear filters
      </button>
    </>
  ) : (
    "No signals yet."
  );
  const quietMessage = filtering
    ? "Nothing here matches your filter."
    : `Nothing new — no flips in the last ${RECENT_FLIP_CANDLES} candles, and every signal is current.`;
  const attentionNote = `flipped in the last ${RECENT_FLIP_CANDLES} candles, or out of date`;
  const holdingNote = `no flip in the last ${RECENT_FLIP_CANDLES} candles`;

  const renderCards = (rows: Signal[]) => (
    <ul>
      {rows.map((signal) => (
        <SignalCard
          key={signal.id}
          signal={signal}
          quote={quotes[signal.ticker]}
          onRowClick={onRowClick}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );

  const renderRows = (rows: Signal[]) =>
    rows.map((signal) => (
      <SignalRow
        key={signal.id}
        signal={signal}
        quote={quotes[signal.ticker]}
        confVariant={confVariant}
        onRowClick={onRowClick}
        onRemove={onRemove}
      />
    ));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <div className="relative flex-1 min-w-0 lg:flex-none lg:w-52">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickers"
            aria-label="Search tickers"
            className="w-full pl-9 pr-3 py-2 bg-card text-foreground text-sm placeholder:text-muted-foreground"
          />
        </div>

        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-[150px] h-9 bg-card text-foreground text-sm" aria-label="Filter by candle state">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATE_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value} className="text-sm">
                {f.color && <CandleSwatch color={f.color} className="h-3" />}
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => setConfVariant((v) => (v === "number" ? "bar" : "number"))}
          title={`Confidence: ${confVariant === "number" ? "number only" : "number + bar"}`}
          aria-label={`Show confidence as ${confVariant === "number" ? "number and bar" : "number only"}`}
          className="hidden lg:inline-flex text-[10px] font-mono"
        >
          {confVariant === "number" ? "#" : "▬"}
        </Button>
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border hover:bg-transparent">
            {COLS.map((col) => (
              <TableHead
                key={col.key}
                aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                className={cn(
                  "h-9 px-3 first:pl-4 whitespace-nowrap sticky top-0 bg-card z-10",
                  col.align,
                )}
              >
                <button
                  type="button"
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-sm text-[11px] font-medium uppercase tracking-wide transition-colors hover:text-foreground",
                    sortKey === col.key ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {col.label}
                  <SortArrow active={sortKey === col.key} dir={sortDir} />
                </button>
              </TableHead>
            ))}
            <TableHead className="h-9 px-3 w-16 sticky top-0 bg-card z-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {total === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={COL_COUNT} className="py-10 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            <>
              <GroupHeader
                title="Needs attention"
                count={attention.length}
                note={attentionNote}
              />
              {attention.length > 0 ? (
                renderRows(attention)
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COL_COUNT} className="px-4 py-4 text-sm text-muted-foreground">
                    {quietMessage}
                  </TableCell>
                </TableRow>
              )}
              {holding.length > 0 && (
                <>
                  <GroupHeader
                    title="Holding trend"
                    count={holding.length}
                    note={holdingNote}
                  />
                  {renderRows(holding)}
                </>
              )}
            </>
          )}
        </TableBody>
      </Table>
      </div>

      {/* Phones and tablets: stacked cards */}
      <div className="lg:hidden">
        {total === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <>
            <MobileGroupHeader title="Needs attention" count={attention.length} note={attentionNote} />
            {attention.length > 0 ? (
              renderCards(attention)
            ) : (
              <p className="px-4 py-4 text-sm text-muted-foreground border-b border-border">{quietMessage}</p>
            )}
            {holding.length > 0 && (
              <>
                <MobileGroupHeader title="Holding trend" count={holding.length} note={holdingNote} />
                {renderCards(holding)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
