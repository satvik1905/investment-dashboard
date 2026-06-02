import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { useAppStore } from "../store/appStore";
import { StockDetailModal } from "../components/StockDetailModal";

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
    <div className="bg-bg-secondary rounded-xl border border-white/[0.08] p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
        <span className="text-text-primary font-mono text-sm font-medium">Scanning market...</span>
        <span className="ml-auto text-text-secondary font-mono text-sm">
          {progress.tickers_scanned.toLocaleString()} / {progress.total_tickers.toLocaleString()} stocks
        </span>
      </div>
      <div className="w-full h-2 bg-bg-tertiary rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-accent-blue rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-text-tertiary text-xs font-mono">{progress.message}</span>
        <span className="text-text-secondary text-xs font-mono font-bold">{pct}%</span>
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
      {n > 12 && <span className="text-text-tertiary text-xs font-mono">+{n - 12}</span>}
      <span className="text-text-secondary text-xs font-mono ml-1">{n}{unit}</span>
    </div>
  );
}

function RsiBadge({ rsi, candle_type }: { rsi: number | null; candle_type: "RED" | "YELLOW" }) {
  if (rsi == null) return <span className="text-text-tertiary font-mono text-sm">—</span>;

  const isOversold = candle_type === "RED" && rsi < 35;
  const isOverbought = candle_type === "YELLOW" && rsi > 65;

  if (isOversold) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent-green/15 border border-accent-green/30 text-accent-green text-xs font-mono font-semibold">
        {fmt(rsi, 0)} <span className="text-[10px]">Oversold</span>
      </span>
    );
  }
  if (isOverbought) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent-red/15 border border-accent-red/30 text-accent-red text-xs font-mono font-semibold">
        {fmt(rsi, 0)} <span className="text-[10px]">Overbought</span>
      </span>
    );
  }
  return <span className="text-text-secondary font-mono text-sm">{fmt(rsi, 0)}</span>;
}


function MonthlyTooltip() {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="text-text-tertiary text-[10px] cursor-help">ⓘ</span>
      {show && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 z-50 bg-bg-primary border border-white/[0.12] rounded-lg p-3 shadow-xl text-[11px] leading-relaxed text-text-secondary font-sans pointer-events-none">
          <span className="text-accent-green font-semibold block mb-1">Monthly Red Candles are rare</span>
          Monthly red candles signal a major trend reversal on the monthly timeframe that could last{" "}
          <span className="text-text-primary">weeks to months</span>. Far more significant than weekly signals.
        </div>
      )}
    </span>
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
    <tr
      className={`border-b border-white/[0.04] transition-colors hover:bg-bg-tertiary/40 ${
        isMultiTimeframe ? "bg-yellow-500/[0.03]" : isSpike ? "bg-accent-blue/[0.03]" : ""
      }`}
    >
      {/* Ticker */}
      <td className="py-3 pl-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            onClick={() => onTickerClick(row.ticker)}
            className={`text-sm font-mono font-bold tracking-wide ${
              isRed ? "text-accent-green" : row.candle_type === "YELLOW" ? "text-accent-amber" : "text-text-primary"
            } ticker-glow cursor-pointer`}
          >
            {row.ticker}
          </span>
          {isMultiTimeframe && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 font-mono font-semibold tracking-wide whitespace-nowrap">
              ⭐ Multi-TF
            </span>
          )}
          {isSpike && !isMultiTimeframe && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-accent-blue/20 border border-accent-blue/30 text-accent-blue font-mono uppercase tracking-wider">
              Vol↑
            </span>
          )}
        </div>
        {row.company_name && (
          <div className="text-text-tertiary text-xs truncate max-w-[120px]">{row.company_name}</div>
        )}
        {row.monthly_candle_color && (
          <div className="text-[10px] font-mono text-text-tertiary mt-0.5">
            monthly:{" "}
            <span className={row.monthly_candle_color === "RED" ? "text-accent-green" : "text-accent-amber"}>
              {row.monthly_candle_color}
            </span>
            {row.monthly_months_since_flip != null && (
              <span className="text-text-tertiary"> · {row.monthly_months_since_flip === 0 ? "this month" : row.monthly_months_since_flip + "mo ago"}</span>
            )}
          </div>
        )}
      </td>

      {/* Price */}
      <td className="py-3 text-right pr-4">
        <span className="font-mono text-sm text-text-primary">{fmtPrice(row.current_price)}</span>
      </td>

      {/* Week % */}
      <td className="py-3 text-right pr-4">
        <span
          className={`font-mono text-sm font-medium ${
            changePositive ? "text-accent-green" : "text-accent-red"
          }`}
        >
          {changePositive ? "+" : ""}
          {fmt(row.weekly_change_pct)}%
        </span>
      </td>

      {/* Prior trend / Recency */}
      <td className="py-3 pr-4">
        {isMonthlyView ? (
          <span className="font-mono text-sm text-text-secondary">
            {row.monthly_months_since_flip === 0
              ? "this month"
              : row.monthly_months_since_flip != null
                ? row.monthly_months_since_flip + "mo ago"
                : "—"}
          </span>
        ) : (
          <PriorTrendBar count={row.prior_candle_count} candle_type={row.candle_type} />
        )}
      </td>

      {/* Volume ratio */}
      <td className="py-3 text-right pr-4">
        <span
          className={`font-mono text-sm ${
            isSpike ? "text-accent-blue font-semibold" : "text-text-secondary"
          }`}
        >
          {fmt(row.volume_ratio)}x
        </span>
      </td>

      {/* RSI */}
      <td className="py-3 pr-4">
        <RsiBadge rsi={row.rsi} candle_type={row.candle_type} />
      </td>

      {/* Actions */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAddToWatchlist(row.ticker)}
            className="px-2.5 py-1 rounded-md bg-accent-blue/15 border border-accent-blue/30 text-accent-blue text-xs font-mono font-medium hover:bg-accent-blue/25 transition-colors"
          >
            + Add
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main Scanner Page ──────────────────────────────────────────────────────

export function Scanner() {
  const queryClient = useQueryClient();
  const { setActiveTab, setSelectedTicker } = useAppStore();

  const [detailTicker, setDetailTicker] = useState<string | null>(null);
  const [activeCandle, setActiveCandle] = useState<"RED" | "YELLOW" | "MONTHLY_RED" | "MONTHLY_YELLOW">("RED");
  const [filterMode, setFilterMode] = useState<"all" | "volume_spike" | "strong_reversal">("all");
  const [sortMode, setSortMode] = useState<"prior_candles" | "volume" | "change">("prior_candles");
  const [scanDateOverride, setScanDateOverride] = useState<string>("");
  const [jobId, setJobId] = useState<string | null>(null);

  // Whether the weekly candle is fully closed — used only for the info badge, not to block runs.
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

  // Progress polling — only when a job is active
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

  // Generate signal mutation (triggered when user clicks "+ Add")
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

  // True if a scan has ever been completed (latestDate exists) or just finished with 0 results
  const scanWasRun = !!latestDate || progress?.status === "complete";

  return (
    <>
    {detailTicker && (
      <StockDetailModal
        ticker={detailTicker}
        signal={null}
        onClose={() => setDetailTicker(null)}
      />
    )}
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight mb-1">
            Candle Scanner
          </h1>
          <p className="text-text-secondary text-sm">
            Finds stocks where the weekly trend just reversed — Danny Cheng EMA crossover system
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs font-mono text-text-tertiary">
            {latestDate && (
              <span>
                Last scan: <span className="text-text-secondary">{formatDateTime(latestDate)}</span>
              </span>
            )}
            {!isWeeklyCandleClosed && (
              <span className="text-accent-amber">
                ⚠ Weekly candle still forming — results may be preliminary
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleRunScanner}
          disabled={isScanning}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-green/10 border border-accent-green/25 text-accent-green text-sm font-mono font-medium hover:bg-accent-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <span className={isScanning ? "animate-spin" : ""}>◎</span>
          {isScanning ? "Scanning..." : "Run Scanner Now"}
        </button>
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
          <div className="w-16 h-16 rounded-full bg-bg-secondary border border-white/[0.08] flex items-center justify-center text-3xl mb-4">
            {scanWasRun ? "◉" : "◎"}
          </div>
          {scanWasRun ? (
            <>
              <h2 className="text-text-primary font-semibold text-lg mb-2">No EMA crossovers this week</h2>
              <p className="text-text-secondary text-sm max-w-sm leading-relaxed mb-2">
                All 511 stocks were scanned — none had a weekly EMA 13/34 crossover on the most recent candle.
              </p>
              <p className="text-text-tertiary text-xs max-w-xs leading-relaxed mb-6">
                This is common during sustained market trends. Most stocks are currently in a downtrend with no reversals yet. Check back after Friday's close.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-text-primary font-semibold text-lg mb-2">No scan available yet</h2>
              <p className="text-text-secondary text-sm max-w-xs leading-relaxed mb-6">
                The scanner runs automatically every Friday at 4:15 PM EST after the weekly candle closes.
              </p>
            </>
          )}
          <button
            onClick={handleRunScanner}
            className="px-6 py-3 rounded-xl bg-accent-green/10 border border-accent-green/25 text-accent-green text-sm font-mono font-medium hover:bg-accent-green/20 transition-colors"
          >
            Run Scanner Now
          </button>
        </div>
      )}

      {/* Results */}
      {(hasResults || isLoading) && !isScanning && (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-1 mb-4 flex-wrap">
            {/* Weekly Red */}
            <button
              onClick={() => setActiveCandle("RED")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono font-medium transition-all ${
                activeCandle === "RED"
                  ? "bg-accent-green/15 border border-accent-green/30 text-accent-green"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-accent-green inline-block" />
              Weekly Red
              <span
                className={`text-xs px-1.5 py-0.5 rounded-md ${
                  activeCandle === "RED"
                    ? "bg-accent-green/20 text-accent-green"
                    : "bg-bg-tertiary text-text-tertiary"
                }`}
              >
                {redResults.length}
              </span>
            </button>

            {/* Weekly Yellow */}
            <button
              onClick={() => setActiveCandle("YELLOW")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono font-medium transition-all ${
                activeCandle === "YELLOW"
                  ? "bg-accent-amber/15 border border-accent-amber/30 text-accent-amber"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-accent-amber inline-block" />
              Weekly Yellow
              <span
                className={`text-xs px-1.5 py-0.5 rounded-md ${
                  activeCandle === "YELLOW"
                    ? "bg-accent-amber/20 text-accent-amber"
                    : "bg-bg-tertiary text-text-tertiary"
                }`}
              >
                {yellowResults.length}
              </span>
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-white/[0.08] mx-1" />

            {/* Monthly Red */}
            <button
              onClick={() => setActiveCandle("MONTHLY_RED")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono font-medium transition-all ${
                activeCandle === "MONTHLY_RED"
                  ? "bg-accent-green/15 border border-accent-green/30 text-accent-green"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              }`}
            >
              <span className="text-[11px]">📅</span>
              Monthly Red
              <span
                className={`text-xs px-1.5 py-0.5 rounded-md ${
                  activeCandle === "MONTHLY_RED"
                    ? "bg-accent-green/20 text-accent-green"
                    : "bg-bg-tertiary text-text-tertiary"
                }`}
              >
                {monthlyRedResults.length}
              </span>
              <MonthlyTooltip />
            </button>

            {/* Monthly Yellow */}
            <button
              onClick={() => setActiveCandle("MONTHLY_YELLOW")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono font-medium transition-all ${
                activeCandle === "MONTHLY_YELLOW"
                  ? "bg-accent-amber/15 border border-accent-amber/30 text-accent-amber"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
              }`}
            >
              <span className="text-[11px]">📅</span>
              Monthly Yellow
              <span
                className={`text-xs px-1.5 py-0.5 rounded-md ${
                  activeCandle === "MONTHLY_YELLOW"
                    ? "bg-accent-amber/20 text-accent-amber"
                    : "bg-bg-tertiary text-text-tertiary"
                }`}
              >
                {monthlyYellowResults.length}
              </span>
            </button>
          </div>

          {/* Legend */}
          <div className="mb-4 p-3 rounded-lg bg-bg-secondary border border-white/[0.06] text-xs text-text-tertiary font-mono leading-relaxed">
            {activeCandle === "RED" && (
              <>
                <span className="text-accent-green font-semibold">● Weekly Red</span> — EMA 13 just crossed{" "}
                <strong className="text-text-secondary">above</strong> EMA 34 on the weekly chart. Prior downtrend ending. Potential BUY setup.
                Prior trend bar shows <span className="text-[#00FFFF]">cyan weeks</span> in downtrend before the cross.
              </>
            )}
            {activeCandle === "YELLOW" && (
              <>
                <span className="text-accent-amber font-semibold">● Weekly Yellow</span> — EMA 13 just crossed{" "}
                <strong className="text-text-secondary">below</strong> EMA 34 on the weekly chart. Prior uptrend ending. Potential SELL/avoid setup.
                Prior trend bar shows <span className="text-accent-blue">blue weeks</span> in uptrend before the cross.
              </>
            )}
            {activeCandle === "MONTHLY_RED" && (
              <>
                <span className="text-accent-green font-semibold">📅 Monthly Red</span> — EMA 13 just crossed{" "}
                <strong className="text-text-secondary">above</strong> EMA 34 on the <strong className="text-text-secondary">monthly</strong> chart.
                These are rare and extremely significant — a major trend reversal that could last weeks to months.
                {" "}<span className="text-accent-purple font-semibold">⭐ gold badge</span> = also has a weekly crossover (highest conviction).
              </>
            )}
            {activeCandle === "MONTHLY_YELLOW" && (
              <>
                <span className="text-accent-amber font-semibold">📅 Monthly Yellow</span> — EMA 13 just crossed{" "}
                <strong className="text-text-secondary">below</strong> EMA 34 on the <strong className="text-text-secondary">monthly</strong> chart.
                A major trend reversal to the downside. Avoid or consider shorting.
                {" "}<span className="text-accent-purple font-semibold">⭐ gold badge</span> = also has a weekly crossover (highest conviction).
              </>
            )}
          </div>

          {/* Filter bar — weekly tabs only */}
          <div className={`flex items-center gap-2 mb-4 flex-wrap ${isMonthlyTab ? "opacity-40 pointer-events-none" : ""}`}>
            <div className="flex items-center gap-1 bg-bg-secondary border border-white/[0.06] rounded-lg p-1">
              {(["all", "volume_spike", "strong_reversal"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterMode(f)}
                  className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                    filterMode === f
                      ? "bg-bg-tertiary text-text-primary border border-accent-blue/30"
                      : "text-text-tertiary hover:text-text-secondary border border-transparent"
                  }`}
                >
                  {f === "all" ? "All" : f === "volume_spike" ? "Volume Spike" : "Strong (5w+)"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-bg-secondary border border-white/[0.06] rounded-lg p-1">
              <span className="text-text-tertiary text-xs font-mono px-2">Sort:</span>
              {(["prior_candles", "volume", "change"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortMode(s)}
                  className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                    sortMode === s
                      ? "bg-bg-tertiary text-text-primary border border-accent-blue/30"
                      : "text-text-tertiary hover:text-text-secondary border border-transparent"
                  }`}
                >
                  {s === "prior_candles" ? "Prior Trend" : s === "volume" ? "Volume" : "% Change"}
                </button>
              ))}
            </div>

            {/* Date picker */}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-text-tertiary text-xs font-mono">View scan from:</span>
              <input
                type="date"
                value={scanDateOverride}
                onChange={(e) => setScanDateOverride(e.target.value)}
                className="bg-bg-secondary border border-white/[0.08] rounded-lg px-3 py-1 text-text-secondary text-xs font-mono focus:outline-none focus:border-accent-blue/40"
              />
              {scanDateOverride && (
                <button
                  onClick={() => setScanDateOverride("")}
                  className="text-text-tertiary hover:text-text-secondary text-xs font-mono"
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 rounded-lg bg-bg-secondary border border-white/[0.04] animate-pulse"
                />
              ))}
            </div>
          ) : activeResults.length === 0 ? (
            <div className="text-center py-12 text-text-tertiary font-mono text-sm">
              No {activeCandle.toLowerCase()} candle stocks match the current filter.
            </div>
          ) : (
            <div className="bg-bg-secondary rounded-xl border border-white/[0.08] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left py-3 pl-4 text-text-tertiary text-xs font-mono font-medium uppercase tracking-wider">
                      Ticker
                    </th>
                    <th className="text-right py-3 pr-4 text-text-tertiary text-xs font-mono font-medium uppercase tracking-wider">
                      Price
                    </th>
                    <th className="text-right py-3 pr-4 text-text-tertiary text-xs font-mono font-medium uppercase tracking-wider">
                      Week %
                    </th>
                    <th className="text-left py-3 pr-4 text-text-tertiary text-xs font-mono font-medium uppercase tracking-wider">
                      Prior Trend
                    </th>
                    <th className="text-right py-3 pr-4 text-text-tertiary text-xs font-mono font-medium uppercase tracking-wider">
                      Volume
                    </th>
                    <th className="text-left py-3 pr-4 text-text-tertiary text-xs font-mono font-medium uppercase tracking-wider">
                      RSI
                    </th>
                    <th className="py-3 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {activeResults.map((row) => (
                    <ResultRow
                      key={row.id}
                      row={row}
                      onAddToWatchlist={handleAddToWatchlist}
                      onTickerClick={setDetailTicker}
                      isMonthlyView={isMonthlyTab}
                    />
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-white/[0.04] text-text-tertiary text-xs font-mono">
                {activeResults.length} stocks · scan date: {resolvedDate ?? latestDate ?? "—"}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add to watchlist feedback */}
      {generateSignalMutation.isPending && (
        <div className="fixed bottom-6 right-6 bg-bg-secondary border border-accent-blue/30 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 z-40">
          <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
          <span className="text-text-primary text-sm font-mono">
            Adding to watchlist &amp; generating signal...
          </span>
        </div>
      )}
      {addError && (
        <div className="fixed bottom-6 right-6 bg-bg-secondary border border-accent-amber/30 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 z-40">
          <span className="text-accent-amber text-sm font-mono">⚠ {addError}</span>
          <button onClick={() => setAddError(null)} className="text-text-tertiary hover:text-text-secondary text-xs ml-2">✕</button>
        </div>
      )}
    </div>
    </>
  );
}
