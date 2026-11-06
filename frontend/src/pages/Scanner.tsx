import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "../api/client";
import { useAppStore } from "../store/appStore";
import { useSignals } from "../hooks/useSignals";
import { StockDetailModal } from "../components/StockDetailModal";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "../components/ErrorState";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

type CandleColor = "RED" | "YELLOW";

interface ScannerResult {
  id: number;
  scan_date: string;
  ticker: string;
  company_name: string | null;
  candle_type: CandleColor | "NONE";
  prior_candle_count: number | null;
  current_price: number | null;
  weekly_change_pct: number | null;
  volume_ratio: number | null;
  ema13: number | null;
  ema34: number | null;
  rsi: number | null;
  macd_hist: number | null;
  is_volume_spike: boolean | null;
  monthly_candle_color: CandleColor | null;
  monthly_prior_candle_count: number | null;
  monthly_months_since_flip: number | null;
  created_at: string | null;
}

interface ScanProgress {
  job_id: string;
  status: "running" | "complete" | "failed";
  progress: number;
  tickers_scanned: number;
  total_tickers: number;
  message: string;
}

type TabKey = "RED" | "YELLOW" | "MONTHLY_RED" | "MONTHLY_YELLOW";

// Same candle colors as the chart (StockDetailModal DC_FILL) so the scanner and chart read alike
const CANDLE_FILL: Record<CandleColor, string> = { RED: "#FF4444", YELLOW: "#FFD700" };
// Prior-trend weeks: cyan (downtrend) precede a red flip, blue (uptrend) precede a yellow flip
const TREND_SEGMENT: Record<CandleColor, string> = { RED: "bg-cyan-500", YELLOW: "bg-[#1565C0]" };

const TABS: { key: TabKey; label: string; color: CandleColor; description: string }[] = [
  {
    key: "RED",
    label: "Weekly red",
    color: "RED",
    description:
      "The latest weekly candle flipped red after a run of cyan downtrend weeks — the weekly trend just turned up. Potential buy setup.",
  },
  {
    key: "YELLOW",
    label: "Weekly yellow",
    color: "YELLOW",
    description:
      "The latest weekly candle flipped yellow after a run of blue uptrend weeks — the weekly trend just turned down. Consider trimming or avoiding.",
  },
  {
    key: "MONTHLY_RED",
    label: "Monthly red",
    color: "RED",
    description:
      "The monthly candle flipped red within the last 3 months — a larger, slower reversal up. Rarer and more significant than weekly flips.",
  },
  {
    key: "MONTHLY_YELLOW",
    label: "Monthly yellow",
    color: "YELLOW",
    description:
      "The monthly candle flipped yellow within the last 3 months — a larger, slower reversal down.",
  },
];

const STALE_AFTER_DAYS = 7;

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

/** scan_date is a plain date — parse as local so it doesn't shift a day back */
function parseScanDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatScanDate(isoDate: string, weekday = true): string {
  return parseScanDate(isoDate).toLocaleDateString("en-US", {
    ...(weekday ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
  });
}

function daysSince(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - parseScanDate(isoDate).getTime()) / 86_400_000);
}

function relativeDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return `${Math.round(days / 7)} weeks ago`;
}

/** True if the scan ran before that week's Friday close (4 PM ET) — its weekly candle wasn't final. */
function ranBeforeWeeklyClose(createdAt: string): boolean {
  const et = new Date(new Date(createdAt).toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  return !(day === 5 && et.getHours() >= 16);
}

function monthsAgo(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "This month";
  return n === 1 ? "1 month ago" : `${n} months ago`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CandleSwatch({ color, className }: { color: CandleColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block w-1.5 h-3.5 rounded-[2px] ring-1 ring-black/15 shrink-0", className)}
      style={{ backgroundColor: CANDLE_FILL[color] }}
    />
  );
}

function ProgressBar({ progress }: { progress: ScanProgress }) {
  const pct = Math.min(100, Math.max(0, progress.progress));
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <span className="text-foreground text-sm font-medium">Scanning the market…</span>
        <span className="ml-auto text-muted-foreground text-sm">
          <span className="font-mono tabular-nums">
            {progress.tickers_scanned.toLocaleString()} / {progress.total_tickers.toLocaleString()}
          </span>{" "}
          stocks
        </span>
      </div>
      <Progress value={pct} className="h-1.5 mb-2" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{progress.message}</span>
        <span className="font-mono tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

const TREND_SEGMENTS = 12;

function PriorTrendMeter({ count, color }: { count: number | null; color: CandleColor }) {
  const n = count ?? 0;
  const label = color === "RED" ? "downtrend" : "uptrend";
  return (
    <div className="flex items-center gap-2" title={`${n} ${label} weeks before the flip`}>
      <div className="flex gap-[2px]">
        {Array.from({ length: TREND_SEGMENTS }).map((_, i) => (
          <span
            key={i}
            className={cn("w-1.5 h-3 rounded-[1px]", i < n ? TREND_SEGMENT[color] : "bg-black/[0.07]")}
          />
        ))}
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{n}w</span>
    </div>
  );
}

function RsiCell({ rsi, candle_type }: { rsi: number | null; candle_type: ScannerResult["candle_type"] }) {
  if (rsi == null) return <span className="font-mono text-sm text-muted-foreground">—</span>;

  const isOversold = candle_type === "RED" && rsi < 35;
  const isOverbought = candle_type === "YELLOW" && rsi > 65;

  if (isOversold || isOverbought) {
    return (
      <Badge variant={isOversold ? "buy" : "sell"} className="gap-1 text-[11px] font-medium">
        <span className="font-mono tabular-nums">{fmt(rsi, 0)}</span>
        {isOversold ? "Oversold" : "Overbought"}
      </Badge>
    );
  }
  return <span className="font-mono text-sm tabular-nums text-foreground">{fmt(rsi, 0)}</span>;
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; title?: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => v && onChange(v)}
        className="bg-black/[0.05] rounded-lg p-0.5 gap-0.5"
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            title={o.title}
            size="sm"
            className="px-2.5 text-xs font-medium text-muted-foreground rounded-md hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function ResultRow({
  row,
  isMonthlyView,
  watching,
  adding,
  onAdd,
  onTickerClick,
}: {
  row: ScannerResult;
  isMonthlyView: boolean;
  watching: boolean;
  adding: boolean;
  onAdd: (ticker: string) => void;
  onTickerClick: (ticker: string) => void;
}) {
  const changePositive = (row.weekly_change_pct ?? 0) >= 0;
  const weeklyColor = row.candle_type === "NONE" ? null : row.candle_type;
  // On a weekly tab, note a monthly flip too (and vice versa)
  const otherTimeframe: { color: CandleColor; text: string } | null = isMonthlyView
    ? weeklyColor && { color: weeklyColor, text: `Weekly ${weeklyColor.toLowerCase()} too` }
    : row.monthly_candle_color && weeklyColor
      ? {
          color: row.monthly_candle_color,
          text: `Monthly ${row.monthly_candle_color.toLowerCase()} · ${monthsAgo(row.monthly_months_since_flip).toLowerCase()}`,
        }
      : null;

  return (
    <TableRow className="hover:bg-black/[0.015]">
      <TableCell className="py-2 pl-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onTickerClick(row.ticker)}
            className="font-mono text-sm font-semibold text-foreground hover:text-primary hover:underline underline-offset-4 cursor-pointer"
          >
            {row.ticker}
          </button>
          {otherTimeframe && (
            <Badge
              variant="outline"
              className="gap-1.5 text-[11px] font-medium text-foreground/80 border-border"
              title="Flipped on both timeframes — higher conviction"
            >
              <CandleSwatch color={otherTimeframe.color} className="h-2.5" />
              {otherTimeframe.text}
            </Badge>
          )}
        </div>
        {row.company_name && (
          <div className="text-xs text-muted-foreground truncate max-w-[220px]">{row.company_name}</div>
        )}
      </TableCell>

      <TableCell className="py-2">
        {isMonthlyView ? (
          <span className="text-sm text-muted-foreground">{monthsAgo(row.monthly_months_since_flip)}</span>
        ) : weeklyColor ? (
          <PriorTrendMeter count={row.prior_candle_count} color={weeklyColor} />
        ) : null}
      </TableCell>

      <TableCell className="py-2 text-right">
        <span className="font-mono text-sm tabular-nums text-foreground">{fmtPrice(row.current_price)}</span>
      </TableCell>

      <TableCell className="py-2 text-right">
        <span className={cn("font-mono text-sm tabular-nums", changePositive ? "text-primary" : "text-destructive")}>
          {changePositive ? "+" : ""}
          {fmt(row.weekly_change_pct)}%
        </span>
      </TableCell>

      <TableCell className="py-2 text-right">
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            row.is_volume_spike ? "text-foreground font-semibold" : "text-muted-foreground",
          )}
          title={row.is_volume_spike ? "Volume spike — over 1.5× the 20-week average" : undefined}
        >
          {row.is_volume_spike && <span className="text-primary mr-0.5">↑</span>}
          {fmt(row.volume_ratio)}×
        </span>
      </TableCell>

      <TableCell className="py-2 text-right">
        <RsiCell rsi={row.rsi} candle_type={row.candle_type} />
      </TableCell>

      <TableCell className="py-2 pr-4 text-right">
        {watching ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <span className="text-primary">✓</span> Watching
          </span>
        ) : (
          <Button
            variant="outline"
            size="xs"
            disabled={adding}
            onClick={() => onAdd(row.ticker)}
            className="rounded-full px-2.5 text-xs"
          >
            {adding ? "Adding…" : "+ Watch"}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

// ── Main Scanner Page ──────────────────────────────────────────────────────

export function Scanner() {
  const queryClient = useQueryClient();
  const { setActiveTab, setSelectedTicker } = useAppStore();
  const { data: signals } = useSignals();
  const watchlist = useMemo(() => new Set(signals?.map((s) => s.ticker) ?? []), [signals]);

  const [detailTicker, setDetailTicker] = useState<string | null>(null);
  const [activeCandle, setActiveCandle] = useState<TabKey>("RED");
  const [filterMode, setFilterMode] = useState<string>("all");
  const [sortMode, setSortMode] = useState<string>("prior_candles");
  const [scanDateOverride, setScanDateOverride] = useState<string>("");
  const [jobId, setJobId] = useState<string | null>(null);

  // Latest scan date
  const latestDateQuery = useQuery({
    queryKey: ["scanner-latest-date"],
    queryFn: () => api.get("/api/scanner/latest-date").then((r) => r.data),
    staleTime: 60_000,
  });
  const latestDate: string | null = latestDateQuery.data?.latest_date ?? null;

  // Past scans for the date picker
  const { data: scanDates = [] } = useQuery<{ scan_date: string; count: number }[]>({
    queryKey: ["scanner-dates"],
    queryFn: () => api.get("/api/scanner/dates").then((r) => r.data),
    staleTime: 60_000,
  });

  // Scan results
  const resolvedDate = scanDateOverride || latestDate || undefined;
  const { data: redResults = [], isLoading: redLoading, isError: redError, error: redErrorDetail } = useQuery<ScannerResult[]>({
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

  const { data: yellowResults = [], isLoading: yellowLoading, isError: yellowError, error: yellowErrorDetail } = useQuery<ScannerResult[]>({
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

  const { data: monthlyRedResults = [], isLoading: monthlyRedLoading, isError: monthlyRedError, error: monthlyRedErrorDetail } = useQuery<ScannerResult[]>({
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

  const { data: monthlyYellowResults = [], isLoading: monthlyYellowLoading, isError: monthlyYellowError, error: monthlyYellowErrorDetail } = useQuery<ScannerResult[]>({
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
  const { data: progress, isError: progressError } = useQuery<ScanProgress | null>({
    queryKey: ["scanner-progress", jobId],
    queryFn: () =>
      jobId
        ? api.get(`/api/scanner/progress/${jobId}`).then((r) => r.data)
        : api.get("/api/scanner/progress").then((r) => r.data),
    refetchInterval: (query) => {
      // On error React Query keeps the last data, which may still say "running"
      if (query.state.status === "error") return false;
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
      queryClient.invalidateQueries({ queryKey: ["scanner-dates"] });
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
  const generateSignalMutation = useMutation({
    mutationFn: (ticker: string) =>
      api.post(`/api/signals/generate?ticker=${encodeURIComponent(ticker)}`).then((r) => r.data),
    onSuccess: (_data, ticker) => {
      toast.success(`${ticker} added to your watchlist`);
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
      toast.error(msg);
    },
  });

  function handleRunScanner() {
    triggerMutation.mutate();
  }

  const isScanning =
    (!progressError && progress?.status === "running") || triggerMutation.isPending;

  const resultsByTab: Record<TabKey, ScannerResult[]> = {
    RED: redResults,
    YELLOW: yellowResults,
    MONTHLY_RED: monthlyRedResults,
    MONTHLY_YELLOW: monthlyYellowResults,
  };
  const loadingByTab: Record<TabKey, boolean> = {
    RED: redLoading,
    YELLOW: yellowLoading,
    MONTHLY_RED: monthlyRedLoading,
    MONTHLY_YELLOW: monthlyYellowLoading,
  };
  const activeResults = resultsByTab[activeCandle];
  const isLoading = loadingByTab[activeCandle];
  const activeTab = TABS.find((t) => t.key === activeCandle)!;

  const hasResults =
    redResults.length > 0 || yellowResults.length > 0 ||
    monthlyRedResults.length > 0 || monthlyYellowResults.length > 0;

  const isMonthlyTab = activeCandle === "MONTHLY_RED" || activeCandle === "MONTHLY_YELLOW";

  const resultsError =
    latestDateQuery.error ?? redErrorDetail ?? yellowErrorDetail ??
    monthlyRedErrorDetail ?? monthlyYellowErrorDetail ?? null;
  const resultsFailed =
    latestDateQuery.isError || redError || yellowError || monthlyRedError || monthlyYellowError;
  const [retryingResults, setRetryingResults] = useState(false);
  const retryResults = async () => {
    setRetryingResults(true);
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["scanner-latest-date"] }),
      queryClient.refetchQueries({ queryKey: ["scanner-results"] }),
    ]);
    setRetryingResults(false);
  };

  const scanWasRun = !!latestDate || progress?.status === "complete";

  // Scan freshness — judged from the scan itself, not today's clock
  const viewingLatest = !scanDateOverride;
  const scanAgeDays = resolvedDate ? daysSince(resolvedDate) : null;
  const isStale = viewingLatest && scanAgeDays != null && scanAgeDays > STALE_AFTER_DAYS;
  const scanCreatedAt = (redResults[0] ?? yellowResults[0] ?? monthlyRedResults[0] ?? monthlyYellowResults[0])?.created_at;
  const isPreliminary = !!scanCreatedAt && ranBeforeWeeklyClose(scanCreatedAt);

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
        <div className="min-w-0">
          <h1 className="font-sans text-2xl font-bold text-foreground tracking-tight">
            Candle Scanner
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Stocks whose weekly or monthly Danny Cheng candle just flipped — red marks a bullish
            reversal, yellow a bearish one.
          </p>
          {resolvedDate && (
            <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-muted-foreground">
              <span>
                {viewingLatest ? "Latest scan" : "Viewing scan"}:{" "}
                <span className="text-foreground font-medium">{formatScanDate(resolvedDate)}</span>
                {scanAgeDays != null && <> · {relativeDays(scanAgeDays)}</>}
              </span>
              {isStale && (
                <Badge variant="outline" className="text-[11px] font-medium border-status-after/40 bg-status-after/10 text-amber-700">
                  Out of date — run a new scan for current setups
                </Badge>
              )}
              {isPreliminary && (
                <Badge variant="outline" className="text-[11px] font-medium border-status-after/40 bg-status-after/10 text-amber-700">
                  Ran before the weekly close — preliminary
                </Badge>
              )}
            </div>
          )}
        </div>
        <Button onClick={handleRunScanner} disabled={isScanning} className="rounded-full shrink-0">
          {isScanning ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Scanning…
            </>
          ) : (
            "Run scan"
          )}
        </Button>
      </div>

      {/* Progress bar */}
      {isScanning && progress && (
        <div className="mb-6">
          <ProgressBar progress={progress} />
        </div>
      )}

      {/* Last scan failed */}
      {!isScanning && progress?.status === "failed" && (
        <ErrorState
          compact
          className="mb-6"
          title={`Last scan failed — ${progress.message}`}
          onRetry={handleRunScanner}
        />
      )}

      {/* Results failed to load — don't pretend there are none */}
      {!isScanning && resultsFailed && !hasResults && !isLoading && (
        <ErrorState
          className="mb-6"
          title="Couldn't load scanner results"
          error={resultsError}
          onRetry={retryResults}
          retrying={retryingResults}
        />
      )}
      {!isScanning && resultsFailed && hasResults && (
        <ErrorState
          compact
          className="mb-4"
          title="Some scanner results didn't load — tab counts may be incomplete"
          error={resultsError}
          onRetry={retryResults}
          retrying={retryingResults}
        />
      )}

      {/* No results yet — empty state */}
      {!isScanning && !resultsFailed && !hasResults && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-card border border-border flex items-center justify-center gap-1 mb-4">
            <CandleSwatch color="RED" />
            <CandleSwatch color="YELLOW" />
          </div>
          {scanWasRun ? (
            <>
              <h2 className="text-foreground font-semibold text-lg mb-2">No reversals in the latest scan</h2>
              <p className="text-muted-foreground text-sm max-w-sm leading-relaxed mb-6">
                No stock flipped to a red or yellow candle on the weekly or monthly chart.
                Quiet weeks happen when most stocks are holding their existing trend.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-foreground font-semibold text-lg mb-2">No scan available yet</h2>
              <p className="text-muted-foreground text-sm max-w-xs leading-relaxed mb-6">
                Run a scan to find stocks whose weekly or monthly trend just reversed.
                Results are most reliable after Friday's close, once the weekly candle is final.
              </p>
            </>
          )}
          <Button onClick={handleRunScanner} className="rounded-full">
            Run scan
          </Button>
        </div>
      )}

      {/* Results */}
      {(hasResults || isLoading) && !isScanning && (
        <>
          {/* Tabs */}
          <div role="tablist" className="flex items-end gap-6 border-b border-border overflow-x-auto">
            {TABS.map((tab) => {
              const isActive = activeCandle === tab.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveCandle(tab.key)}
                  className={cn(
                    "relative flex items-center gap-2 pb-2.5 pt-1 text-sm whitespace-nowrap transition-colors cursor-pointer",
                    isActive ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <CandleSwatch color={tab.color} />
                  {tab.label}
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular-nums rounded-md px-1.5 py-px",
                      isActive ? "bg-foreground text-background" : "bg-black/[0.05] text-muted-foreground",
                    )}
                  >
                    {resultsByTab[tab.key].length}
                  </span>
                  {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />}
                </button>
              );
            })}
          </div>

          {/* What this tab means */}
          <p className="text-sm text-muted-foreground mt-3 mb-4 max-w-3xl leading-relaxed">
            {activeTab.description}
          </p>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
            {isMonthlyTab ? (
              <span className="text-xs text-muted-foreground">Sorted by most recent flip</span>
            ) : (
              <>
                <Segmented
                  label="Show"
                  value={filterMode}
                  onChange={setFilterMode}
                  options={[
                    { value: "all", label: "All" },
                    { value: "volume_spike", label: "Volume spike", title: "Volume over 1.5× the 20-week average" },
                    { value: "strong_reversal", label: "Long prior trend", title: "5+ weeks of prior trend before the flip" },
                  ]}
                />
                <Segmented
                  label="Sort"
                  value={sortMode}
                  onChange={setSortMode}
                  options={[
                    { value: "prior_candles", label: "Prior trend" },
                    { value: "volume", label: "Volume" },
                    { value: "change", label: "Week %" },
                  ]}
                />
              </>
            )}

            {scanDates.length > 1 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Scan</span>
                <Select
                  value={resolvedDate ?? ""}
                  onValueChange={(v) => setScanDateOverride(v === latestDate ? "" : v)}
                >
                  <SelectTrigger size="sm" className="text-xs w-auto min-w-[150px] bg-card">
                    <SelectValue placeholder="Latest" />
                  </SelectTrigger>
                  <SelectContent>
                    {scanDates.map((d) => (
                      <SelectItem key={d.scan_date} value={d.scan_date} className="text-xs">
                        {formatScanDate(d.scan_date)}
                        {d.scan_date === latestDate ? " · latest" : ""}
                        <span className="text-muted-foreground font-mono tabular-nums ml-2">{d.count}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="bg-card rounded-xl border border-border p-3 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-md" />
              ))}
            </div>
          ) : activeResults.length === 0 ? (
            <div className="bg-card rounded-xl border border-border text-center py-12 text-muted-foreground text-sm">
              No {activeTab.label.toLowerCase()} flips match the current filter.
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {[
                      { label: "Ticker", className: "pl-4" },
                      { label: isMonthlyTab ? "Flipped" : "Prior trend", className: "w-[170px]" },
                      { label: "Price", className: "w-[110px] text-right" },
                      { label: "Week", className: "w-[90px] text-right" },
                      { label: "Volume", className: "w-[90px] text-right" },
                      { label: "RSI", className: "w-[105px] text-right" },
                      { label: "", className: "w-[120px] pr-4" },
                    ].map((h) => (
                      <TableHead
                        key={h.label || "actions"}
                        className={cn("h-9 text-[11px] font-medium uppercase tracking-wide text-muted-foreground", h.className)}
                      >
                        {h.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeResults.map((row) => (
                    <ResultRow
                      key={row.id}
                      row={row}
                      isMonthlyView={isMonthlyTab}
                      watching={watchlist.has(row.ticker)}
                      adding={generateSignalMutation.isPending && generateSignalMutation.variables === row.ticker}
                      onAdd={(t) => generateSignalMutation.mutate(t)}
                      onTickerClick={setDetailTicker}
                    />
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 py-2.5 border-t border-border text-muted-foreground text-xs">
                <span className="font-mono tabular-nums">{activeResults.length}</span> stocks
                {resolvedDate && <> · scan from {formatScanDate(resolvedDate, false)}</>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </>
  );
}
