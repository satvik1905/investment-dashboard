import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
} from "lightweight-charts";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import api from "../api/client";
import type { Signal } from "../hooks/useSignals";
import { useLiveQuotes } from "../hooks/useLivePrice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// ── Types ─────────────────────────────────────────────────────────────────────

type Timeframe = "D" | "W" | "M";

interface Candle {
  time: string;
  open: number; high: number; low: number; close: number; volume: number;
}

type DannyColor = "BLUE" | "CYAN" | "RED" | "YELLOW";

interface ChartData {
  candles:     Candle[];
  sma_a:       { time: string; value: number }[];
  sma_b:       { time: string; value: number }[];
  sma_c:       { time: string; value: number }[];
  sma_labels:  [string, string, string];
  rsi:         { time: string; value: number }[];
  volume_avg:  number | null;
  support:     number | null;
  resistance:  number | null;
  danny_colors: { time: string; color: DannyColor }[];
}

interface Props {
  ticker: string;
  onClose: () => void;
}

interface RefreshResult {
  refreshed: boolean;
  validation_warnings: string[] | null;
  signal: Signal | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TF_CONFIG: Record<Timeframe, { period: string; interval: string; label: string }> = {
  D: { period: "6mo", interval: "1d",  label: "Daily"   },
  W: { period: "1y",  interval: "1wk", label: "Weekly"  },
  M: { period: "5y",  interval: "1mo", label: "Monthly" },
};

const SMA_COLORS = ["#3b82f6", "#f97316", "#e2e8f0"] as const;

const DC_FILL: Record<DannyColor, string> = {
  BLUE:   "#1565C0",
  CYAN:   "#00FFFF",
  RED:    "#FF4444",
  YELLOW: "#FFD700",
};
const DC_WICK: Record<DannyColor, string> = {
  BLUE:   "#1565C0",
  CYAN:   "#00838F",
  RED:    "#C62828",
  YELLOW: "#F9A825",
};

const BG     = "#ffffff";
const TEXT   = "#64748b";
const GRID   = "#e2e8f0";
const BORDER = "#e2e8f0";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitialTimeframe(): Timeframe {
  return new URLSearchParams(window.location.search).get("tf") === "W" ? "W" : "D";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StockDetailModal({ ticker, onClose }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>(getInitialTimeframe);
  const [contextState, setContextState] = useState<"idle" | "loading" | "done">("idle");
  const [contextText, setContextText] = useState<string | null>(null);
  const [chartAnalysisState, setChartAnalysisState] = useState<"idle" | "loading" | "done">("idle");
  const [chartAnalysisText, setChartAnalysisText] = useState<string | null>(null);
  const [setupReviewState, setSetupReviewState] = useState<"idle" | "loading" | "done">("idle");
  const [setupReviewText, setSetupReviewText] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] = useState(() => localStorage.getItem("chart-onboarding-seen") ? 0 : 1);
  const smaLegendRef = useRef<HTMLDivElement>(null);

  // ── Signal refresh on mount ─────────────────────────────────────────────
  const queryClient = useQueryClient();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [signalLoading, setSignalLoading] = useState(true);
  const [signalRefreshed, setSignalRefreshed] = useState(false);
  const [signalWarnings, setSignalWarnings] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post<RefreshResult>(`/api/signals/refresh?ticker=${ticker}`);
        if (cancelled) return;
        const r = res.data;
        setSignal(r.signal);
        setSignalRefreshed(r.refreshed);
        setSignalWarnings(r.validation_warnings);
        queryClient.invalidateQueries({ queryKey: ["signals"] });
        queryClient.invalidateQueries({ queryKey: ["scanner-results"] });
      } catch {
        if (cancelled) return;
        setSignal(null);
        setSignalRefreshed(false);
        setSignalWarnings(["Could not reach the server"]);
      } finally {
        if (!cancelled) setSignalLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ticker]);

  const mainRef    = useRef<HTMLDivElement>(null);
  const volRef     = useRef<HTMLDivElement>(null);
  const rsiRef     = useRef<HTMLDivElement>(null);
  const chartsRef  = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const { period, interval } = TF_CONFIG[timeframe];

  const { data, isFetching } = useQuery<ChartData>({
    queryKey: ["chart-detail", ticker, timeframe],
    queryFn: async () => {
      const res = await api.get(`/api/stocks/${ticker}/chart?period=${period}&interval=${interval}`);
      return res.data;
    },
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  // URL sync
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set("tf", timeframe);
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [timeframe]);

  const handleClose = () => {
    const p = new URLSearchParams(window.location.search);
    p.delete("tf");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    onClose();
  };

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ── Build charts ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mainRef.current || !volRef.current || !rsiRef.current) return;
    if (!data?.candles?.length) return;

    const makeChart = (el: HTMLDivElement, showTime: boolean) =>
      createChart(el, {
        layout: { background: { type: ColorType.Solid, color: BG }, textColor: TEXT },
        grid:   { vertLines: { color: GRID }, horzLines: { color: GRID } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: BORDER },
        timeScale: { borderColor: BORDER, timeVisible: showTime, secondsVisible: false, visible: showTime },
        width:  el.clientWidth,
        height: el.clientHeight,
      });

    const main = makeChart(mainRef.current, false);
    const vol  = makeChart(volRef.current,  false);
    const rsi  = makeChart(rsiRef.current,  true);

    // ── Danny Cheng candlesticks — one series per color ──────────────────────
    const colorByTime = new Map<string, DannyColor>();
    for (const { time, color } of (data.danny_colors ?? [])) colorByTime.set(time, color);

    const groups: Record<DannyColor, Candle[]> = { BLUE: [], CYAN: [], RED: [], YELLOW: [] };
    for (const c of data.candles) {
      groups[colorByTime.get(c.time) ?? "BLUE"].push(c);
    }

    let priceSeries: ReturnType<typeof main.addCandlestickSeries> | null = null;
    for (const colorName of ["BLUE", "CYAN", "RED", "YELLOW"] as DannyColor[]) {
      if (!groups[colorName].length) continue;
      const fill = DC_FILL[colorName];
      const wick = DC_WICK[colorName];
      const s = main.addCandlestickSeries({
        upColor: fill, downColor: fill,
        borderUpColor: fill, borderDownColor: fill,
        wickUpColor: wick, wickDownColor: wick,
        priceLineVisible: false,
      });
      s.setData(groups[colorName]);
      if (!priceSeries) priceSeries = s;
    }

    // ── SMAs ─────────────────────────────────────────────────────────────────
    const addLine = (d: { time: string; value: number }[], color: string) => {
      if (!d?.length) return;
      main.addLineSeries({
        color, lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      }).setData(d);
    };
    addLine(data.sma_a, SMA_COLORS[0]);
    addLine(data.sma_b, SMA_COLORS[1]);
    addLine(data.sma_c, SMA_COLORS[2]);

    // ── Price lines ───────────────────────────────────────────────────────────
    if (priceSeries) {
      const pl = (price: number, color: string, title: string, style: LineStyle) =>
        priceSeries!.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });

      if (data.support)    pl(data.support,    "#22c55e", "Support",    LineStyle.Dashed);
      if (data.resistance) pl(data.resistance, "#ef4444", "Resistance", LineStyle.Dashed);
      if (signal?.entry_zone_low)  pl(parseFloat(signal.entry_zone_low),  "#f59e0b", "Entry ↓", LineStyle.Dotted);
      if (signal?.entry_zone_high) pl(parseFloat(signal.entry_zone_high), "#f59e0b", "Entry ↑", LineStyle.Dotted);
      if (signal?.target_price)    pl(parseFloat(signal.target_price),    "#22c55e", "Target",  LineStyle.Dotted);
      if (signal?.stop_loss)       pl(parseFloat(signal.stop_loss),       "#ef4444", "Stop",    LineStyle.Dotted);
    }

    // ── Volume ───────────────────────────────────────────────────────────────
    const volSeries = vol.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
    vol.priceScale("vol").applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } });
    volSeries.setData(
      data.candles.map(c => {
        const up   = c.close >= c.open;
        const high = data.volume_avg != null && c.volume > data.volume_avg * 2;
        return {
          time: c.time, value: c.volume,
          color: up
            ? (high ? "#4ade80" : "rgba(34,197,94,0.4)")
            : (high ? "#f87171" : "rgba(239,68,68,0.4)"),
        };
      })
    );

    // ── RSI ──────────────────────────────────────────────────────────────────
    const rsiLine = rsi.addLineSeries({
      color: "#8b5cf6", lineWidth: 2,
      priceLineVisible: false, lastValueVisible: true,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 }, margins: { above: 8, below: 8 } }),
    });
    rsiLine.setData(data.rsi);
    rsiLine.createPriceLine({ price: 70, color: "rgba(239,68,68,0.7)",  lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "OB 70" });
    rsiLine.createPriceLine({ price: 30, color: "rgba(34,197,94,0.7)",  lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "OS 30" });

    main.timeScale().fitContent();

    // ── Sync time scales ─────────────────────────────────────────────────────
    let syncing = false;
    const syncFrom = (src: ReturnType<typeof createChart>, targets: ReturnType<typeof createChart>[]) => {
      src.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (syncing || !range) return;
        syncing = true;
        targets.forEach(t => t.timeScale().setVisibleLogicalRange(range));
        syncing = false;
      });
    };
    syncFrom(main, [vol, rsi]);
    syncFrom(vol,  [main, rsi]);
    syncFrom(rsi,  [main, vol]);

    // ── Crosshair tooltip ────────────────────────────────────────────────────
    const candleByTime = new Map<string, Candle>();
    for (const c of data.candles) candleByTime.set(c.time, c);

    main.subscribeCrosshairMove((param) => {
      const tooltip = tooltipRef.current;
      const container = mainRef.current;
      if (!tooltip || !container) return;

      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        tooltip.style.display = "none";
        return;
      }

      const timeStr = typeof param.time === "string" ? param.time : String(param.time);
      const candle = candleByTime.get(timeStr);
      if (!candle) { tooltip.style.display = "none"; return; }

      const isUp = candle.close >= candle.open;
      const clr = isUp ? "#22c55e" : "#ef4444";
      const fmt = (n: number) => n.toFixed(2);

      const d = new Date(timeStr + "T00:00:00");
      const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
      const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

      let subLabel = "";
      if (timeframe === "D") {
        const tmp = new Date(d.getTime());
        tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
        const w1 = new Date(tmp.getFullYear(), 0, 4);
        const wn = 1 + Math.round(((tmp.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
        subLabel = `W${wn} · ${d.toLocaleDateString("en-US", { month: "long" })}`;
      } else if (timeframe === "W") {
        subLabel = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      } else {
        subLabel = d.toLocaleDateString("en-US", { year: "numeric" });
      }

      tooltip.innerHTML = `
        <div style="border-left:3px solid ${clr};padding-left:8px">
          <div style="color:#1A1A2E;font-size:12px;font-weight:600">${timeframe === "D" ? `${weekday}, ` : ""}${dateLabel}</div>
          <div style="color:#64748b;font-size:10px;margin-top:1px">${subLabel}</div>
        </div>
        <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:3px 14px;font-size:11px;font-family:'Roboto Mono',monospace">
          <div><span style="color:#64748b">O</span>&nbsp;<span style="color:#1A1A2E">${fmt(candle.open)}</span></div>
          <div><span style="color:#64748b">H</span>&nbsp;<span style="color:#22c55e">${fmt(candle.high)}</span></div>
          <div><span style="color:#64748b">C</span>&nbsp;<span style="color:${clr}">${fmt(candle.close)}</span></div>
          <div><span style="color:#64748b">L</span>&nbsp;<span style="color:#ef4444">${fmt(candle.low)}</span></div>
        </div>
      `;

      const TW = 162, TH = 90;
      let left = param.point.x + 14;
      let top  = param.point.y - TH / 2;
      if (left + TW > container.clientWidth)  left = param.point.x - TW - 14;
      if (top < 4) top = 4;
      if (top + TH > container.clientHeight - 4) top = container.clientHeight - TH - 4;

      tooltip.style.left    = `${left}px`;
      tooltip.style.top     = `${top}px`;
      tooltip.style.display = "block";
    });

    // ── Resize ───────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      for (const [ref, chart] of [
        [mainRef, main], [volRef, vol], [rsiRef, rsi],
      ] as [React.RefObject<HTMLDivElement>, ReturnType<typeof createChart>][]) {
        if (ref.current) chart.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight });
      }
    });
    if (chartsRef.current) ro.observe(chartsRef.current);

    return () => { ro.disconnect(); main.remove(); vol.remove(); rsi.remove(); };
  }, [data, signal, timeframe]);

  // ── Live price ──────────────────────────────────────────────────────────────
  const { quotes } = useLiveQuotes([ticker]);
  const liveQuote = quotes[ticker];
  const livePrice = liveQuote?.current_price ?? null;
  const changePct = liveQuote?.change_pct ?? null;

  // ── Derived UI state ──────────────────────────────────────────────────────────
  const badgeVariant = signal ? (SIGNAL_BADGE_VARIANT[signal.signal] ?? "hold") : null;
  const badgeLabel   = signal ? (SIGNAL_LABEL[signal.signal] ?? "HOLD") : null;
  const confidence   = signal?.confidence ?? 0;
  const currentPrice = livePrice ?? (signal?.raw_indicators?.current_price as number | undefined) ?? null;
  const smaLabels    = data?.sma_labels ?? ["SMA 20", "SMA 50", "SMA 200"];

  const dirColor = (d: string | null) =>
    d === "UP" ? "text-primary" : d === "DOWN" ? "text-destructive" : "text-muted-foreground";
  const dirArrow = (d: string | null) =>
    d === "UP" ? "↑" : d === "DOWN" ? "↓" : "→";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.10] bg-card shrink-0">

        {/* Left: close + ticker + price + signal badge */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-xs" onClick={handleClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">
            ✕
          </Button>
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xl font-semibold text-foreground">{ticker}</span>
            {liveQuote?.company_name && (
              <span className="text-sm text-muted-foreground truncate max-w-[200px]">{liveQuote.company_name}</span>
            )}
            {currentPrice != null && (
              <span className="font-mono text-base text-muted-foreground">${currentPrice.toFixed(2)}</span>
            )}
            {changePct != null && (
              <span className={`font-mono text-xs ${changePct >= 0 ? "text-primary" : "text-destructive"}`}>
                {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
              </span>
            )}
          </div>
          {badgeVariant && (
            <Badge variant={badgeVariant} className="text-xs font-semibold">
              {badgeLabel}
            </Badge>
          )}
        </div>

        {/* Center: D / W / M toggle */}
        <ToggleGroup
          type="single"
          value={timeframe}
          onValueChange={(v) => v && setTimeframe(v as Timeframe)}
          className="bg-muted rounded-lg p-1"
        >
          {(["D", "W", "M"] as Timeframe[]).map(tf => (
            <ToggleGroupItem
              key={tf}
              value={tf}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                timeframe === tf ? "bg-card text-foreground shadow font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tf}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {/* Right: SMA legend + chart guide button */}
        <div ref={smaLegendRef} className="hidden lg:flex items-center gap-4 text-xs text-muted-foreground">
          {smaLabels.map((label, i) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: SMA_COLORS[i] }} />
              {label}
            </span>
          ))}
          <button
            onClick={() => setOnboardingStep(1)}
            className="w-5 h-5 rounded-full border border-black/[0.15] text-muted-foreground hover:text-foreground hover:border-black/[0.3] flex items-center justify-center text-[10px] font-semibold transition-colors cursor-pointer"
          >
            ?
          </button>
        </div>
      </div>

      {/* Data quality warning */}
      {(signal?.raw_indicators?.data_warning || liveQuote?.data_warning) && (
        <Alert className="mx-5 mt-3 rounded-lg bg-status-after/10 border-status-after/25 text-status-after">
          <AlertDescription className="text-xs leading-relaxed">
            <span className="font-semibold">⚠ This ticker's data may be stale or incorrect:</span>{" "}
            {((liveQuote?.data_warning ?? signal?.raw_indicators?.data_warning) as string[]).join(" · ")}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Charts column */}
        <div ref={chartsRef} className="flex-1 flex flex-col min-w-0 relative">

          {/* Loading overlay */}
          {isFetching && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
              <div className="flex items-center gap-2.5 bg-card border border-black/[0.10] rounded-xl px-4 py-2.5 shadow-xl">
                <div className="w-4 h-4 border-2 border-ring/30 border-t-ring rounded-full animate-spin" />
                <span className="text-muted-foreground text-xs">{TF_CONFIG[timeframe].label} data…</span>
              </div>
            </div>
          )}

          {/* Step-by-step chart onboarding */}
          {onboardingStep > 0 && (() => {
            const TOTAL_STEPS = 5;
            const dismiss = () => { setOnboardingStep(0); localStorage.setItem("chart-onboarding-seen", "true"); };
            const next = () => onboardingStep < TOTAL_STEPS ? setOnboardingStep(onboardingStep + 1) : dismiss();
            const back = () => onboardingStep > 1 && setOnboardingStep(onboardingStep - 1);

            // Map steps to refs for spotlight
            const spotlightRef =
              onboardingStep <= 2 ? mainRef :
              onboardingStep === 3 ? smaLegendRef :
              onboardingStep === 4 ? volRef : rsiRef;

            const stepContent: Record<number, { title: string; body: React.ReactNode }> = {
              1: {
                title: "Candle Colors",
                body: (
                  <>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {([
                        { color: "#1565C0", label: "Blue", desc: "Uptrend continuation" },
                        { color: "#00FFFF", label: "Cyan", desc: "Downtrend continuation", border: true },
                        { color: "#FF4444", label: "Red", desc: "Bullish reversal — BUY signal" },
                        { color: "#FFD700", label: "Yellow", desc: "Bearish reversal — SELL signal", border: true },
                      ] as const).map((c) => (
                        <div key={c.label} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                          <span className={`w-3 h-3 rounded-sm shrink-0 mt-0.5 ${c.border ? "border border-black/[0.10]" : ""}`} style={{ backgroundColor: c.color }} />
                          <div>
                            <div className="text-xs font-semibold text-foreground">{c.label}</div>
                            <div className="text-[10px] text-muted-foreground leading-snug">{c.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">Red and Yellow candles appear exactly once at trend reversals — they are the trading signals.</p>
                  </>
                ),
              },
              2: {
                title: "Price Levels",
                body: (
                  <div className="space-y-2">
                    {([
                      { color: "#22c55e", style: "dashed", label: "Support / Target", desc: "Price floor & profit-taking level" },
                      { color: "#ef4444", style: "dashed", label: "Resistance / Stop", desc: "Price ceiling & risk limit" },
                      { color: "#f59e0b", style: "dotted", label: "Entry Zone", desc: "Range to enter the trade" },
                    ] as const).map((l) => (
                      <div key={l.label} className="flex items-center gap-2.5">
                        <span className="w-6 shrink-0" style={{ borderBottom: `2px ${l.style} ${l.color}` }} />
                        <span className="text-xs text-foreground font-medium">{l.label}</span>
                        <span className="text-[10px] text-muted-foreground">— {l.desc}</span>
                      </div>
                    ))}
                  </div>
                ),
              },
              3: {
                title: "Moving Averages",
                body: (
                  <div className="space-y-2">
                    {([
                      { color: "#3b82f6", label: "SMA 20", desc: "Short-term trend" },
                      { color: "#f97316", label: "SMA 50", desc: "Medium-term trend" },
                      { color: "#e2e8f0", label: "SMA 200", desc: "Long-term trend", border: true },
                    ] as const).map((s) => (
                      <div key={s.label} className="flex items-center gap-2.5">
                        <span className={`w-6 h-0.5 rounded shrink-0 ${s.border ? "border border-black/[0.06]" : ""}`} style={{ backgroundColor: s.color }} />
                        <span className="text-xs text-foreground font-medium font-mono">{s.label}</span>
                        <span className="text-[10px] text-muted-foreground">— {s.desc}</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground leading-relaxed">Price above all three = strong uptrend.</p>
                  </div>
                ),
              },
              4: {
                title: "Volume",
                body: (
                  <div className="flex items-start gap-2.5">
                    <div className="flex gap-0.5 shrink-0 mt-0.5">
                      <span className="w-2.5 h-4 rounded-sm bg-[#4ade80]" />
                      <span className="w-2.5 h-3 rounded-sm bg-[rgba(34,197,94,0.4)]" />
                      <span className="w-2.5 h-4 rounded-sm bg-[#f87171]" />
                      <span className="w-2.5 h-3 rounded-sm bg-[rgba(239,68,68,0.4)]" />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">Green = up day, Red = down day. Bright bars = unusually high volume (2x+ avg), confirming the move.</p>
                  </div>
                ),
              },
              5: {
                title: "RSI (Relative Strength Index)",
                body: (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-0.5 rounded shrink-0" style={{ backgroundColor: "#8b5cf6" }} />
                      <span className="text-[11px] text-muted-foreground">Purple line oscillating 0–100</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Above <span className="text-destructive font-semibold">70</span> = overbought (may pull back). Below <span className="text-primary font-semibold">30</span> = oversold (may bounce).
                    </p>
                  </div>
                ),
              },
            };

            const { title, body } = stepContent[onboardingStep];

            // Compute spotlight and tooltip positions
            const containerRect = chartsRef.current?.getBoundingClientRect();
            const targetRect = spotlightRef.current?.getBoundingClientRect();
            let spotlightStyle: React.CSSProperties | null = null;
            let tooltipStyle: React.CSSProperties = { top: 24 };

            if (containerRect && targetRect) {
              const top = targetRect.top - containerRect.top;
              const left = targetRect.left - containerRect.left;
              const containerH = containerRect.height;
              const targetMid = top + targetRect.height / 2;
              const isLowerHalf = targetMid > containerH / 2;

              spotlightStyle = {
                top: top - 2,
                left: left - 2,
                width: targetRect.width + 4,
                height: targetRect.height + 4,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
              };
              tooltipStyle = isLowerHalf
                ? { bottom: containerH - top + 12 }
                : { top: top + targetRect.height + 12 };
            }

            return (
              <div className="absolute inset-0 z-30" onClick={dismiss}>
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-black/40 transition-opacity" />

                {/* Spotlight cutout */}
                {spotlightStyle && (
                  <div
                    className="absolute rounded-lg ring-2 ring-primary/50 bg-white/[0.03]"
                    style={spotlightStyle}
                  />
                )}

                {/* Tooltip card — positioned above or below the target */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-[340px] bg-card border border-black/[0.10] rounded-xl shadow-2xl p-4 z-10"
                  style={tooltipStyle}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="bg-primary/10 text-primary text-[10px] font-bold font-mono rounded-full px-2 py-0.5">
                        {onboardingStep}/{TOTAL_STEPS}
                      </span>
                      <h4 className="text-sm font-bold text-foreground">{title}</h4>
                    </div>
                    <button onClick={dismiss} className="text-muted-foreground hover:text-foreground text-xs cursor-pointer">✕</button>
                  </div>

                  {/* Content */}
                  <div className="mb-4">{body}</div>

                  {/* Step dots + controls */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                        <span
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${
                            i + 1 === onboardingStep ? "bg-primary" : i + 1 < onboardingStep ? "bg-primary/40" : "bg-black/[0.12]"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      {onboardingStep > 1 && (
                        <button onClick={back} className="text-muted-foreground hover:text-foreground text-xs font-medium cursor-pointer">
                          Back
                        </button>
                      )}
                      <button onClick={dismiss} className="text-muted-foreground hover:text-foreground text-xs cursor-pointer">
                        Skip
                      </button>
                      <button
                        onClick={next}
                        className="bg-primary/10 text-primary text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-primary/20 transition-colors cursor-pointer"
                      >
                        {onboardingStep === TOTAL_STEPS ? "Done" : "Next"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {!data?.candles?.length && !isFetching ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="w-8 h-8 border-2 border-ring/30 border-t-ring rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="relative flex-[11]">
                <div ref={mainRef} className="w-full h-full" />
                <div
                  ref={tooltipRef}
                  style={{
                    display: "none",
                    position: "absolute",
                    pointerEvents: "none",
                    background: "rgba(255,255,255,0.96)",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    backdropFilter: "blur(8px)",
                    boxShadow: "0 4px 12px rgb(15 23 42 / 0.08)",
                    zIndex: 20,
                    minWidth: "155px",
                  }}
                />
              </div>
              <div className="h-px bg-black/[0.04] shrink-0" />
              <div ref={volRef}  className="flex-[3]" />
              <div className="h-px bg-black/[0.04] shrink-0" />
              <div ref={rsiRef}  className="flex-[4]" />
            </>
          )}
        </div>

        {/* ── Signal panel ─────────────────────────────────────────────────── */}
        <div className="w-80 border-l border-border bg-card flex flex-col overflow-y-auto shrink-0">
          {signalLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
              <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
              <span className="text-muted-foreground text-xs">Updating signal…</span>
            </div>
          ) : signal ? (
            <div className="p-5">

              {/* Stale / validation-fail banner */}
              {!signalRefreshed && signalWarnings && (
                <Alert className="px-3 py-3 rounded-lg border-2 border-destructive/40 bg-destructive/10 mb-5">
                  <AlertDescription>
                    <div className="text-destructive text-xs font-bold mb-1">Could not refresh</div>
                    <p className="text-destructive/80 text-xs leading-relaxed">{signalWarnings.join(" · ")}</p>
                    {signal.generated_at && (
                      <p className="text-muted-foreground text-[10px] mt-1.5">
                        Showing signal from {new Date(signal.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* 1. Verdict row */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {badgeVariant && <Badge variant={badgeVariant} className="text-xs font-semibold">{badgeLabel}</Badge>}
                  <span className="font-mono text-lg font-semibold text-foreground">{ticker}</span>
                </div>
                {currentPrice != null && (
                  <span className="font-mono text-lg tabular-nums text-foreground">${currentPrice.toFixed(2)}</span>
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-muted-foreground truncate mr-2">
                  {liveQuote?.company_name ?? ticker}
                </span>
                {changePct != null && (
                  <span className="text-sm text-muted-foreground font-mono tabular-nums">
                    {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
                  </span>
                )}
              </div>

              {/* 2. Exit levels */}
              <div className="border-t border-border mt-4 pt-4">
                <div className="text-sm text-muted-foreground mb-2">Levels</div>
                {signal.entry_zone_low || signal.target_price || signal.stop_loss ? (
                  <div className="space-y-1.5">
                    {signal.entry_zone_low && signal.entry_zone_high && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Entry</span>
                        <span className="font-mono tabular-nums text-foreground">
                          ${parseFloat(signal.entry_zone_low).toFixed(2)}–${parseFloat(signal.entry_zone_high).toFixed(2)}
                        </span>
                      </div>
                    )}
                    {signal.target_price && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Target</span>
                        <span className="font-mono tabular-nums text-price-target">${parseFloat(signal.target_price).toFixed(2)}</span>
                      </div>
                    )}
                    {signal.stop_loss && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Stop</span>
                        <span className="font-mono tabular-nums text-price-stop">${parseFloat(signal.stop_loss).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-foreground">No entry, target, or stop defined</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Signal is HOLD — no actionable trade setup at this time.
                    </p>
                  </div>
                )}
              </div>

              {/* 3. Confidence */}
              <div className="border-t border-border mt-4 pt-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground shrink-0">Confidence</span>
                  <div className="flex-1 h-1.5 rounded-full bg-conf-track">
                    <div
                      className={`h-full rounded-full transition-all ${
                        confidence <= 25 ? "bg-destructive" : confidence <= 75 ? "bg-status-after" : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(confidence, 100)}%` }}
                    />
                  </div>
                  <span className={`font-mono text-sm tabular-nums font-semibold w-7 text-right ${
                    confidence <= 25 ? "text-destructive" : confidence <= 75 ? "text-status-after" : "text-primary"
                  }`}>{confidence}</span>
                </div>
              </div>

              {/* 4. Why */}
              <div className="border-t border-border mt-4 pt-4">
                <div className="text-sm text-muted-foreground mb-2">Why</div>
                {signal.key_reason && (
                  <p className="text-sm text-foreground leading-relaxed">{signal.key_reason}</p>
                )}
                {signal.raw_indicators?.rsi_14 != null && (
                  <p className="text-sm text-muted-foreground mt-2">
                    RSI (14) <span className="font-mono tabular-nums font-semibold text-foreground ml-1">{(signal.raw_indicators.rsi_14 as number).toFixed(1)}</span>
                    <span className="ml-1">
                      {(signal.raw_indicators.rsi_14 as number) < 30 ? "oversold" :
                       (signal.raw_indicators.rsi_14 as number) > 70 ? "overbought" : "neutral"}
                    </span>
                  </p>
                )}
              </div>

              {/* 5. Direction outlook */}
              <div className="border-t border-border mt-4 pt-4">
                <div className="text-sm text-muted-foreground mb-2">Direction outlook</div>
                <div className="flex items-center gap-4 text-sm">
                  {[
                    { label: "3d",  dir: signal.price_direction_3d  },
                    { label: "7d",  dir: signal.price_direction_7d  },
                    { label: "14d", dir: signal.price_direction_14d },
                  ].map(({ label, dir }) => (
                    <span key={label} className="flex items-center gap-1">
                      <span className={`font-mono ${dirColor(dir)}`}>{dirArrow(dir)}</span>
                      <span className="text-muted-foreground">{label}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* 6. Actions */}
              <div className="border-t border-border mt-4 pt-4 space-y-2">
                {/* Primary action */}
                {contextState === "idle" && (
                  <Button
                    onClick={async () => {
                      setContextState("loading");
                      try {
                        const res = await api.post(`/api/stocks/${ticker}/context`);
                        setContextText(res.data.context ?? null);
                      } catch { setContextText(null); }
                      setContextState("done");
                    }}
                    className="w-full rounded-full"
                  >
                    Get context read
                  </Button>
                )}
                {contextState === "loading" && (
                  <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground text-xs">
                    <div className="w-3.5 h-3.5 border-2 border-border border-t-foreground rounded-full animate-spin" />
                    Analyzing…
                  </div>
                )}
                {contextState === "done" && contextText && (
                  <div className="border border-border rounded-lg p-3 mb-2">
                    <div className="text-sm text-muted-foreground mb-1">Context</div>
                    <p className="text-xs text-foreground leading-relaxed">{contextText}</p>
                  </div>
                )}

                {/* Secondary actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 text-xs"
                    disabled={chartAnalysisState === "loading"}
                    onClick={async () => {
                      setChartAnalysisState("loading");
                      try {
                        const res = await api.post(`/api/stocks/${ticker}/chart-analysis`);
                        setChartAnalysisText(res.data.analysis ?? null);
                      } catch { setChartAnalysisText(null); }
                      setChartAnalysisState("done");
                    }}
                  >
                    {chartAnalysisState === "loading" ? "Analyzing…" : "Analyze charts"}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-xs"
                    disabled={setupReviewState === "loading"}
                    onClick={async () => {
                      setSetupReviewState("loading");
                      try {
                        const res = await api.post(`/api/stocks/${ticker}/setup-review`);
                        setSetupReviewText(res.data.review ?? null);
                      } catch { setSetupReviewText(null); }
                      setSetupReviewState("done");
                    }}
                  >
                    {setupReviewState === "loading" ? "Reviewing…" : "Setup review"}
                  </Button>
                </div>

                {/* Results */}
                {chartAnalysisState === "done" && chartAnalysisText && (
                  <div className="border border-border rounded-lg p-3">
                    <div className="text-sm text-muted-foreground mb-1">Chart analysis</div>
                    <p className="text-xs text-foreground leading-relaxed">{chartAnalysisText}</p>
                  </div>
                )}
                {setupReviewState === "done" && setupReviewText && (
                  <div className="border border-border rounded-lg p-3">
                    <div className="text-sm text-muted-foreground mb-1">Setup review</div>
                    <p className="text-xs text-foreground leading-relaxed">{setupReviewText}</p>
                  </div>
                )}
              </div>

              {/* 7. Updated timestamp */}
              {signalRefreshed && (
                <div className="border-t border-border mt-4 pt-3 text-right">
                  <span className="text-xs text-muted-foreground">Updated just now</span>
                </div>
              )}

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-muted-foreground">
              <div>
                <div className="text-3xl mb-3">◎</div>
                <p className="text-sm">No signal available for {ticker}.</p>
                {signalWarnings && (
                  <p className="text-destructive/80 text-xs mt-2">{signalWarnings.join(" · ")}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
