import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { useAppStore } from "../store/appStore";
import { StockDetailModal } from "../components/StockDetailModal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Progress } from "@/components/ui/progress";
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
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

// ── Types ──────────────────────────────────────────────────────────────────

interface ScannerResult {
  id: number;
  scan_date: string;
  ticker: string;
  company_name: string | null;
  candle_type: "RED" | "YELLOW" | "NONE";
  prior_candle_count: number | null;
  current_price: number | null;
  weekly_change_pct: number | null;
  volume_ratio: number | null;
  ema13: number | null;
  ema34: number | null;
  rsi: number | null;
  macd_hist: number | null;
  is_volume_spike: boolean | null;
  monthly_candle_color: "RED" | "YELLOW" | null;
  monthly_prior_candle_count: number | null;
  monthly_months_since_flip: number | null;
}

interface ScanProgress {
  job_id: string;
  status: "running" | "complete" | "failed";
  progress: number;
  tickers_scanned: number;
  total_tickers: number;
  message: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function formatDateTime(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }) + ", 4:15 PM EST";
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: ScanProgress }) {
  const pct = Math.min(100, Math.max(0, progress.progress));
  return (
    <div className="bg-card rounded-xl border border-black/[0.10] p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-2 h-2 rounded-full bg-ring animate-pulse" />
        <span className="text-foreground font-mono text-sm font-medium">Scanning market...</span>
        <span className="ml-auto text-muted-foreground font-mono text-sm">
          {progress.tickers_scanned.toLocaleString()} / {progress.total_tickers.toLocaleString()} stocks
        </span>
      </div>
      <Progress value={pct} className="h-2 mb-3" />
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-mono">{progress.message}</span>
        <span className="text-muted-foreground text-xs font-mono font-bold">{pct}%</span>
      </div>
    </div>
  );
}

function PriorTrendBar({
  count,
  candle_type,
  unit = "w",
}: {
  count: number | null;
  candle_type: "RED" | "YELLOW" | "NONE" | string;
  unit?: string;
}) {
  const n = count ?? 0;
  const filled = Math.min(n, 12);
  const color = candle_type === "RED" ? "bg-[#00FFFF]" : "bg-[#1565C0]";
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: filled }).map((_, i) => (
        <div key={i} className={`w-2 h-3 rounded-sm ${color}`} />
      ))}
      {n > 12 && <span className="text-muted-foreground text-xs font-mono">+{n - 12}</span>}
      <span className="text-muted-foreground text-xs font-mono ml-1">{n}{unit}</span>
    </div>
  );
}

function RsiBadge({ rsi, candle_type }: { rsi: number | null; candle_type: "RED" | "YELLOW" }) {
  if (rsi == null) return <span className="text-muted-foreground font-mono text-sm">—</span>;

  const isOversold = candle_type === "RED" && rsi < 35;
  const isOverbought = candle_type === "YELLOW" && rsi > 65;

  if (isOversold) {
    return (
      <Badge variant="buy" className="text-xs font-mono font-semibold">
        {fmt(rsi, 0)} <span className="text-[10px]">Oversold</span>
      </Badge>
    );
  }
  if (isOverbought) {
    return (
      <Badge variant="sell" className="text-xs font-mono font-semibold">
        {fmt(rsi, 0)} <span className="text-[10px]">Overbought</span>
      </Badge>
    );
  }
  return <span className="text-muted-foreground font-mono text-sm">{fmt(rsi, 0)}</span>;
}


function MonthlyTooltipInfo() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-muted-foreground text-[10px] cursor-help">ⓘ</span>
      </TooltipTrigger>
      <TooltipContent className="w-56 text-[11px] leading-relaxed">
        <span className="text-primary font-semibold block mb-1">Monthly Red Candles are rare</span>
        Monthly red candles signal a major trend reversal on the monthly timeframe that could last{" "}
        <span className="font-semibold">weeks to months</span>. Far more significant than weekly signals.
      </TooltipContent>
    </Tooltip>
  );
}

function ResultRow({
  row,
  onAddToWatchlist,
  onTickerClick,
  isMonthlyView = false,
}: {
  row: ScannerResult;
  onAddToWatchlist: (ticker: string) => void;
  onTickerClick: (ticker: string) => void;
  isMonthlyView?: boolean;
}) {
  const isRed = row.candle_type === "RED";
  const changePositive = (row.weekly_change_pct ?? 0) >= 0;
  const isSpike = row.is_volume_spike;
  const isMultiTimeframe = row.candle_type !== "NONE" && row.monthly_candle_color != null;

  return (
    <TableRow
      className={
        isMultiTimeframe ? "bg-yellow-500/[0.03]" : isSpike ? "bg-ring/[0.03]" : ""
      }
    >
      {/* Ticker */}
      <TableCell className="py-3 pl-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            onClick={() => onTickerClick(row.ticker)}
            className={`text-sm font-mono font-bold tracking-wide ${
              isRed ? "text-primary" : row.candle_type === "YELLOW" ? "text-status-after" : "text-foreground"
            } cursor-pointer`}
          >
            {row.ticker}
          </span>
          {isMultiTimeframe && (
            <Badge variant="warning" className="text-[9px] font-mono font-semibold tracking-wide bg-yellow-500/20 border-yellow-500/40 text-yellow-400">
              ⭐ Multi-TF
            </Badge>
          )}
          {isSpike && !isMultiTimeframe && (
            <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-wider bg-ring/20 border-ring/30 text-ring">
              Vol↑
            </Badge>
          )}
        </div>
        {row.company_name && (
          <div className="text-muted-foreground text-xs truncate max-w-[120px]">{row.company_name}</div>
        )}
        {row.monthly_candle_color && (
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
            monthly:{" "}
            <span className={row.monthly_candle_color === "RED" ? "text-primary" : "text-status-after"}>
              {row.monthly_candle_color}
            </span>
            {row.monthly_months_since_flip != null && (
              <span className="text-muted-foreground"> · {row.monthly_months_since_flip === 0 ? "this month" : row.monthly_months_since_flip + "mo ago"}</span>
            )}
          </div>
        )}
      </TableCell>

      {/* Price */}
      <TableCell className="py-3 text-right pr-4">
        <span className="font-mono text-sm text-foreground">{fmtPrice(row.current_price)}</span>
      </TableCell>

      {/* Week % */}
      <TableCell className="py-3 text-right pr-4">
        <span
          className={`font-mono text-sm font-medium ${
            changePositive ? "text-primary" : "text-destructive"
          }`}
        >
          {changePositive ? "+" : ""}
          {fmt(row.weekly_change_pct)}%
        </span>
      </TableCell>

      {/* Prior trend / Recency */}
      <TableCell className="py-3 pr-4">
        {isMonthlyView ? (
          <span className="font-mono text-sm text-muted-foreground">
            {row.monthly_months_since_flip === 0
              ? "this month"
              : row.monthly_months_since_flip != null
                ? row.monthly_months_since_flip + "mo ago"
                : "—"}
          </span>
        ) : (
          <PriorTrendBar count={row.prior_candle_count} candle_type={row.candle_type} />
        )}
      </TableCell>

      {/* Volume ratio */}
      <TableCell className="py-3 text-right pr-4">
        <span
          className={`font-mono text-sm ${
            isSpike ? "text-ring font-semibold" : "text-muted-foreground"
          }`}
        >
          {fmt(row.volume_ratio)}x
        </span>
      </TableCell>

      {/* RSI */}
      <TableCell className="py-3 pr-4">
        <RsiBadge rsi={row.rsi} candle_type={row.candle_type} />
      </TableCell>

      {/* Actions */}
      <TableCell className="py-3 pr-4">
        <Button
          variant="outline"
          size="xs"
          onClick={() => onAddToWatchlist(row.ticker)}
          className="bg-ring/15 border-ring/30 text-ring hover:bg-ring/25 font-mono"
        >
          + Add
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ── Main Scanner Page ──────────────────────────────────────────────────────

export function Scanner() {
  const queryClient = useQueryClient();
  const { setActiveTab, setSelectedTicker } = useAppStore();

  const [detailTicker, setDetailTicker] = useState<string | null>(null);
  const [activeCandle, setActiveCandle] = useState<string>("RED");
  const [filterMode, setFilterMode] = useState<string>("all");
  const [sortMode, setSortMode] = useState<string>("prior_candles");
  const [scanDateOverride, setScanDateOverride] = useState<string>("");
  const [jobId, setJobId] = useState<string | null>(null);

  // Whether the weekly candle is fully closed
  const isWeeklyCandleClosed = (() => {
    const now = new Date();
    const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = etNow.getDay();
    const h = etNow.getHours();
    const m = etNow.getMinutes();
    if (day === 0 || day === 6) return true;
    if (day === 5 && (h > 16 || (h === 16 && m >= 15))) return true;
    return false;
  })();

  // Latest scan date
  const { data: latestDateData } = useQuery({
    queryKey: ["scanner-latest-date"],
    queryFn: () => api.get("/api/scanner/latest-date").then((r) => r.data),
    staleTime: 60_000,
  });
  const latestDate: string | null = latestDateData?.latest_date ?? null;

  // Scan results
  const resolvedDate = scanDateOverride || latestDate || undefined;
  const { data: redResults = [], isLoading: redLoading } = useQuery<ScannerResult[]>({
    queryKey: ["scanner-results", "RED", resolvedDate, filterMode, sortMode],
    queryFn: () =>
      api
        .get("/api/scanner/results", {
          params: {
            candle_type: "RED",
            ...(resolvedDate ? { scan_date: resolvedDate } : {}),
            filter: filterMode,
            sort: sortMode,
          },
        })
        .then((r) => r.data),
    enabled: true,
    staleTime: 300_000,
  });

  const { data: yellowResults = [], isLoading: yellowLoading } = useQuery<ScannerResult[]>({
    queryKey: ["scanner-results", "YELLOW", resolvedDate, filterMode, sortMode],
    queryFn: () =>
      api
        .get("/api/scanner/results", {
          params: {
            candle_type: "YELLOW",
            ...(resolvedDate ? { scan_date: resolvedDate } : {}),
            filter: filterMode,
            sort: sortMode,
          },
        })
        .then((r) => r.data),
    enabled: true,
    staleTime: 300_000,
  });

  const { data: monthlyRedResults = [], isLoading: monthlyRedLoading } = useQuery<ScannerResult[]>({
    queryKey: ["scanner-results", "MONTHLY_RED", resolvedDate],
    queryFn: () =>
      api
        .get("/api/scanner/results", {
          params: {
            candle_type: "MONTHLY_RED",
            ...(resolvedDate ? { scan_date: resolvedDate } : {}),
          },
        })
        .then((r) => r.data),
    enabled: true,
    staleTime: 300_000,
  });

  const { data: monthlyYellowResults = [], isLoading: monthlyYellowLoading } = useQuery<ScannerResult[]>({
    queryKey: ["scanner-results", "MONTHLY_YELLOW", resolvedDate],
    queryFn: () =>
      api
        .get("/api/scanner/results", {
          params: {
            candle_type: "MONTHLY_YELLOW",
            ...(resolvedDate ? { scan_date: resolvedDate } : {}),
          },
        })
        .then((r) => r.data),
    enabled: true,
    staleTime: 300_000,
  });

  // Progress polling
  const { data: progress } = useQuery<ScanProgress | null>({
    queryKey: ["scanner-progress", jobId],
    queryFn: () =>
      jobId
        ? api.get(`/api/scanner/progress/${jobId}`).then((r) => r.data)
        : api.get("/api/scanner/progress").then((r) => r.data),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "running") return 2000;
      return false;
    },
    staleTime: 0,
  });

  // When scan completes, refetch results
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    if (prevStatus.current === "running" && progress?.status === "complete") {
      queryClient.invalidateQueries({ queryKey: ["scanner-results"] });
      queryClient.invalidateQueries({ queryKey: ["scanner-latest-date"] });
    }
    prevStatus.current = progress?.status ?? null;
  }, [progress?.status, queryClient]);

  // Trigger scan mutation
  const triggerMutation = useMutation({
    mutationFn: () => api.post("/api/scanner/run").then((r) => r.data),
    onSuccess: (data) => {
      setJobId(data.job_id);
      queryClient.invalidateQueries({ queryKey: ["scanner-progress"] });
    },
  });

  // Generate signal mutation
  const [addError, setAddError] = useState<string | null>(null);
  const generateSignalMutation = useMutation({
    mutationFn: (ticker: string) =>
      api.post(`/api/signals/generate?ticker=${encodeURIComponent(ticker)}`).then((r) => r.data),
    onSuccess: (_data, ticker) => {
      setAddError(null);
      setSelectedTicker(ticker);
      setActiveTab("dashboard");
      queryClient.invalidateQueries({ queryKey: ["signals"] });
    },
    onError: (err: unknown, ticker) => {
      const detail = (err as { response?: { data?: { detail?: { message?: string; warnings?: string[] } | string } } })?.response?.data?.detail;
      let msg: string;
      if (detail && typeof detail === "object") {
        msg = detail.warnings?.[0] ?? detail.message ?? `Could not add ${ticker}`;
      } else {
        msg = typeof detail === "string" ? detail : `Could not add ${ticker}`;
      }
      setAddError(msg);
    },
  });

  function handleRunScanner() {
    triggerMutation.mutate();
  }

  function handleAddToWatchlist(ticker: string) {
    generateSignalMutation.mutate(ticker);
  }

  const isScanning = progress?.status === "running" || triggerMutation.isPending;

  const activeResults =
    activeCandle === "RED" ? redResults :
    activeCandle === "YELLOW" ? yellowResults :
    activeCandle === "MONTHLY_RED" ? monthlyRedResults :
    monthlyYellowResults;

  const isLoading =
    activeCandle === "RED" ? redLoading :
    activeCandle === "YELLOW" ? yellowLoading :
    activeCandle === "MONTHLY_RED" ? monthlyRedLoading :
    monthlyYellowLoading;

  const hasResults =
    redResults.length > 0 || yellowResults.length > 0 ||
    monthlyRedResults.length > 0 || monthlyYellowResults.length > 0;

  const isMonthlyTab = activeCandle === "MONTHLY_RED" || activeCandle === "MONTHLY_YELLOW";

  const scanWasRun = !!latestDate || progress?.status === "complete";

  return (
    <>
    {detailTicker && (
      <StockDetailModal
        ticker={detailTicker}
        onClose={() => setDetailTicker(null)}
      />
    )}
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="font-sans text-2xl font-bold text-foreground tracking-tight mb-1">
            Candle Scanner
          </h1>
          <p className="text-muted-foreground text-sm">
            Finds stocks where the weekly trend just reversed — Danny Cheng EMA crossover system
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs font-mono text-muted-foreground">
            {latestDate && (
              <span>
                Last scan: <span className="text-muted-foreground">{formatDateTime(latestDate)}</span>
              </span>
            )}
            {!isWeeklyCandleClosed && (
              <Badge variant="warning" className="text-xs">
                ⚠ Weekly candle still forming — results may be preliminary
              </Badge>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleRunScanner}
          disabled={isScanning}
          className="bg-primary/10 border-primary/25 text-primary hover:bg-primary/20 font-mono shrink-0"
        >
          <span className={isScanning ? "animate-spin" : ""}>◎</span>
          {isScanning ? "Scanning..." : "Run Scanner Now"}
        </Button>
      </div>

      {/* Progress bar */}
      {isScanning && progress && (
        <div className="mb-6">
          <ProgressBar progress={progress} />
        </div>
      )}

      {/* No results yet — empty state */}
      {!isScanning && !hasResults && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-card border border-black/[0.10] flex items-center justify-center text-3xl mb-4">
            {scanWasRun ? "◉" : "◎"}
          </div>
          {scanWasRun ? (
            <>
              <h2 className="text-foreground font-semibold text-lg mb-2">No EMA crossovers this week</h2>
              <p className="text-muted-foreground text-sm max-w-sm leading-relaxed mb-2">
                All 511 stocks were scanned — none had a weekly EMA 13/34 crossover on the most recent candle.
              </p>
              <p className="text-muted-foreground text-xs max-w-xs leading-relaxed mb-6">
                This is common during sustained market trends. Most stocks are currently in a downtrend with no reversals yet. Check back after Friday's close.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-foreground font-semibold text-lg mb-2">No scan available yet</h2>
              <p className="text-muted-foreground text-sm max-w-xs leading-relaxed mb-6">
                The scanner runs automatically every Friday at 4:15 PM EST after the weekly candle closes.
              </p>
            </>
          )}
          <Button
            variant="outline"
            onClick={handleRunScanner}
            className="bg-primary/10 border-primary/25 text-primary hover:bg-primary/20 font-mono"
          >
            Run Scanner Now
          </Button>
        </div>
      )}

      {/* Results */}
      {(hasResults || isLoading) && !isScanning && (
        <>
          {/* Tabs */}
          <Tabs value={activeCandle} onValueChange={setActiveCandle} className="mb-4">
            <div className="flex items-center gap-1 flex-wrap">
              <TabsList variant="line" className="h-auto flex-wrap">
                <TabsTrigger value="RED" className="flex items-center gap-2 px-4 py-2 text-sm font-mono font-medium">
                  <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                  Weekly Red
                  <Badge variant="outline" className="text-xs">{redResults.length}</Badge>
                </TabsTrigger>

                <TabsTrigger value="YELLOW" className="flex items-center gap-2 px-4 py-2 text-sm font-mono font-medium">
                  <span className="w-2 h-2 rounded-full bg-status-after inline-block" />
                  Weekly Yellow
                  <Badge variant="outline" className="text-xs">{yellowResults.length}</Badge>
                </TabsTrigger>

                <Separator orientation="vertical" className="h-5 mx-1" />

                <TabsTrigger value="MONTHLY_RED" className="flex items-center gap-2 px-4 py-2 text-sm font-mono font-medium">
                  <span className="text-[11px]">📅</span>
                  Monthly Red
                  <Badge variant="outline" className="text-xs">{monthlyRedResults.length}</Badge>
                  <MonthlyTooltipInfo />
                </TabsTrigger>

                <TabsTrigger value="MONTHLY_YELLOW" className="flex items-center gap-2 px-4 py-2 text-sm font-mono font-medium">
                  <span className="text-[11px]">📅</span>
                  Monthly Yellow
                  <Badge variant="outline" className="text-xs">{monthlyYellowResults.length}</Badge>
                </TabsTrigger>
              </TabsList>
            </div>
          </Tabs>

          {/* Legend */}
          <div className="mb-4 p-3 rounded-lg bg-card border border-black/[0.08] text-xs text-muted-foreground font-mono leading-relaxed">
            {activeCandle === "RED" && (
              <>
                <span className="text-primary font-semibold">● Weekly Red</span> — EMA 13 just crossed{" "}
                <strong className="text-muted-foreground">above</strong> EMA 34 on the weekly chart. Prior downtrend ending. Potential BUY setup.
                Prior trend bar shows <span className="text-[#00FFFF]">cyan weeks</span> in downtrend before the cross.
              </>
            )}
            {activeCandle === "YELLOW" && (
              <>
                <span className="text-status-after font-semibold">● Weekly Yellow</span> — EMA 13 just crossed{" "}
                <strong className="text-muted-foreground">below</strong> EMA 34 on the weekly chart. Prior uptrend ending. Potential SELL/avoid setup.
                Prior trend bar shows <span className="text-ring">blue weeks</span> in uptrend before the cross.
              </>
            )}
            {activeCandle === "MONTHLY_RED" && (
              <>
                <span className="text-primary font-semibold">📅 Monthly Red</span> — EMA 13 just crossed{" "}
                <strong className="text-muted-foreground">above</strong> EMA 34 on the <strong className="text-muted-foreground">monthly</strong> chart.
                These are rare and extremely significant — a major trend reversal that could last weeks to months.
                {" "}<span className="text-violet-600 font-semibold">⭐ gold badge</span> = also has a weekly crossover (highest conviction).
              </>
            )}
            {activeCandle === "MONTHLY_YELLOW" && (
              <>
                <span className="text-status-after font-semibold">📅 Monthly Yellow</span> — EMA 13 just crossed{" "}
                <strong className="text-muted-foreground">below</strong> EMA 34 on the <strong className="text-muted-foreground">monthly</strong> chart.
                A major trend reversal to the downside. Avoid or consider shorting.
                {" "}<span className="text-violet-600 font-semibold">⭐ gold badge</span> = also has a weekly crossover (highest conviction).
              </>
            )}
          </div>

          {/* Filter bar — weekly tabs only */}
          <div className={`flex items-center gap-2 mb-4 flex-wrap ${isMonthlyTab ? "opacity-40 pointer-events-none" : ""}`}>
            <ToggleGroup
              type="single"
              value={filterMode}
              onValueChange={(v) => v && setFilterMode(v)}
              className="bg-card border border-black/[0.08] rounded-lg p-1"
            >
              <ToggleGroupItem value="all" className="px-3 py-1 text-xs font-mono">All</ToggleGroupItem>
              <ToggleGroupItem value="volume_spike" className="px-3 py-1 text-xs font-mono">Volume Spike</ToggleGroupItem>
              <ToggleGroupItem value="strong_reversal" className="px-3 py-1 text-xs font-mono">Strong (5w+)</ToggleGroupItem>
            </ToggleGroup>

            <ToggleGroup
              type="single"
              value={sortMode}
              onValueChange={(v) => v && setSortMode(v)}
              className="bg-card border border-black/[0.08] rounded-lg p-1"
            >
              <span className="text-muted-foreground text-xs font-mono px-2">Sort:</span>
              <ToggleGroupItem value="prior_candles" className="px-3 py-1 text-xs font-mono">Prior Trend</ToggleGroupItem>
              <ToggleGroupItem value="volume" className="px-3 py-1 text-xs font-mono">Volume</ToggleGroupItem>
              <ToggleGroupItem value="change" className="px-3 py-1 text-xs font-mono">% Change</ToggleGroupItem>
            </ToggleGroup>

            {/* Date picker */}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-muted-foreground text-xs font-mono">View scan from:</span>
              <Input
                type="date"
                value={scanDateOverride}
                onChange={(e) => setScanDateOverride(e.target.value)}
                className="bg-card text-muted-foreground text-xs font-mono w-auto"
              />
              {scanDateOverride && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setScanDateOverride("")}
                  className="text-muted-foreground hover:text-muted-foreground text-xs font-mono"
                >
                  ✕ Clear
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : activeResults.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground font-mono text-sm">
              No {activeCandle.toLowerCase()} candle stocks match the current filter.
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-black/[0.10] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left pl-4 text-muted-foreground text-xs font-mono font-medium uppercase tracking-wider">Ticker</TableHead>
                    <TableHead className="text-right pr-4 text-muted-foreground text-xs font-mono font-medium uppercase tracking-wider">Price</TableHead>
                    <TableHead className="text-right pr-4 text-muted-foreground text-xs font-mono font-medium uppercase tracking-wider">Week %</TableHead>
                    <TableHead className="text-left pr-4 text-muted-foreground text-xs font-mono font-medium uppercase tracking-wider">Prior Trend</TableHead>
                    <TableHead className="text-right pr-4 text-muted-foreground text-xs font-mono font-medium uppercase tracking-wider">Volume</TableHead>
                    <TableHead className="text-left pr-4 text-muted-foreground text-xs font-mono font-medium uppercase tracking-wider">RSI</TableHead>
                    <TableHead className="pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeResults.map((row) => (
                    <ResultRow
                      key={row.id}
                      row={row}
                      onAddToWatchlist={handleAddToWatchlist}
                      onTickerClick={setDetailTicker}
                      isMonthlyView={isMonthlyTab}
                    />
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 py-3 border-t border-black/[0.06] text-muted-foreground text-xs font-mono">
                {activeResults.length} stocks · scan date: {resolvedDate ?? latestDate ?? "—"}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add to watchlist feedback */}
      {generateSignalMutation.isPending && (
        <div className="fixed bottom-6 right-6 bg-card border border-ring/30 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 z-40">
          <div className="w-2 h-2 rounded-full bg-ring animate-pulse" />
          <span className="text-foreground text-sm font-mono">
            Adding to watchlist &amp; generating signal...
          </span>
        </div>
      )}
      {addError && (
        <div className="fixed bottom-6 right-6 bg-card border border-status-after/30 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 z-40">
          <span className="text-status-after text-sm font-mono">⚠ {addError}</span>
          <Button variant="ghost" size="icon-xs" onClick={() => setAddError(null)} className="text-muted-foreground hover:text-muted-foreground">✕</Button>
        </div>
      )}
    </div>
    </>
  );
}
