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
import { ConfidenceMeter } from "./ConfidenceMeter";
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

const BG     = "#FFFFFF";
const TEXT   = "#64748B";
const GRID   = "rgba(0,0,0,0.05)";
const BORDER = "rgba(0,0,0,0.10)";

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
          <div style="color:var(--text-disabled);font-size:10px;margin-top:1px">${subLabel}</div>
        </div>
        <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:3px 14px;font-size:11px;font-family:'Roboto Mono',monospace">
          <div><span style="color:var(--text-disabled)">O</span>&nbsp;<span style="color:#1A1A2E">${fmt(candle.open)}</span></div>
          <div><span style="color:var(--text-disabled)">H</span>&nbsp;<span style="color:#22c55e">${fmt(candle.high)}</span></div>
          <div><span style="color:var(--text-disabled)">C</span>&nbsp;<span style="color:${clr}">${fmt(candle.close)}</span></div>
          <div><span style="color:var(--text-disabled)">L</span>&nbsp;<span style="color:#ef4444">${fmt(candle.low)}</span></div>
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
    d === "UP" ? "text-accent-green" : d === "DOWN" ? "text-accent-red" : "text-text-tertiary";
  const dirArrow = (d: string | null) =>
    d === "UP" ? "↑" : d === "DOWN" ? "↓" : "→";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-primary">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.10] bg-bg-secondary shrink-0">

        {/* Left: close + ticker + price + signal badge */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-xs" onClick={handleClose} className="text-text-tertiary hover:text-text-primary text-lg leading-none">
            ✕
          </Button>
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xl font-semibold text-text-primary">{ticker}</span>
            {currentPrice != null && (
              <span className="font-mono text-base text-text-secondary">${currentPrice.toFixed(2)}</span>
            )}
            {changePct != null && (
              <span className={`font-mono text-xs ${changePct >= 0 ? "text-accent-green" : "text-accent-red"}`}>
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
          className="bg-bg-tertiary rounded-lg p-1"
        >
          {(["D", "W", "M"] as Timeframe[]).map(tf => (
            <ToggleGroupItem
              key={tf}
              value={tf}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                timeframe === tf ? "bg-accent-blue text-white shadow" : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {tf}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {/* Right: SMA legend */}
        <div className="hidden lg:flex items-center gap-4 text-xs text-text-tertiary">
          {smaLabels.map((label, i) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-0.5 rounded" style={{ backgroundColor: SMA_COLORS[i] }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Data quality warning */}
      {(signal?.raw_indicators?.data_warning || liveQuote?.data_warning) && (
        <Alert className="mx-5 mt-3 rounded-lg bg-accent-amber/10 border-accent-amber/25 text-accent-amber">
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
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-primary/60 backdrop-blur-[2px]">
              <div className="flex items-center gap-2.5 bg-bg-secondary border border-black/[0.10] rounded-xl px-4 py-2.5 shadow-xl">
                <div className="w-4 h-4 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
                <span className="text-text-secondary text-xs">{TF_CONFIG[timeframe].label} data…</span>
              </div>
            </div>
          )}

          {!data?.candles?.length && !isFetching ? (
            <div className="flex-1 flex items-center justify-center text-text-tertiary">
              <div className="w-8 h-8 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
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
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    backdropFilter: "blur(8px)",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
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
        <div className="w-80 border-l border-black/[0.10] bg-bg-secondary flex flex-col overflow-y-auto shrink-0">
          {signalLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
              <div className="w-6 h-6 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
              <span className="text-text-secondary text-xs">Updating signal…</span>
            </div>
          ) : signal ? (
            <div className="p-5 space-y-5">

              {/* Stale / validation-fail banner */}
              {!signalRefreshed && signalWarnings && (
                <Alert className="px-3 py-3 rounded-lg border-2 border-accent-red/40 bg-accent-red/10">
                  <AlertDescription>
                    <div className="text-accent-red text-xs font-bold uppercase tracking-wider mb-1">Could not refresh</div>
                    <p className="text-accent-red/80 text-xs leading-relaxed">{signalWarnings.join(" · ")}</p>
                    {signal.generated_at && (
                      <p className="text-text-tertiary text-[10px] mt-1.5">
                        Showing last known signal from {new Date(signal.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Fresh indicator */}
              {signalRefreshed && (
                <div className="text-center text-[10px] text-accent-green/70 uppercase tracking-wider">Updated just now</div>
              )}

              {/* Confidence */}
              <div className="flex flex-col items-center gap-1 pt-2">
                <ConfidenceMeter confidence={confidence} size={100} />
                <span className="text-text-tertiary text-xs uppercase tracking-wider mt-1">Confidence</span>
              </div>

              {/* Price levels */}
              <div className="grid grid-cols-1 gap-2">
                {[
                  {
                    label: "Entry Zone",
                    value: signal.entry_zone_low && signal.entry_zone_high
                      ? `$${parseFloat(signal.entry_zone_low).toFixed(2)} – $${parseFloat(signal.entry_zone_high).toFixed(2)}`
                      : "—",
                    color: "text-accent-amber",
                  },
                  { label: "Target",    value: signal.target_price ? `$${parseFloat(signal.target_price).toFixed(2)}` : "—", color: "text-accent-green" },
                  { label: "Stop Loss", value: signal.stop_loss    ? `$${parseFloat(signal.stop_loss).toFixed(2)}`    : "—", color: "text-accent-red"   },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-bg-tertiary rounded-lg px-3 py-2.5 flex justify-between items-center">
                    <span className="text-text-tertiary text-xs uppercase tracking-wider">{label}</span>
                    <span className={`font-mono text-sm font-semibold ${color}`}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Price direction */}
              <div>
                <div className="text-text-tertiary text-xs uppercase tracking-wider mb-2">Price Direction</div>
                <div className="flex gap-2">
                  {[
                    { label: "3D",  dir: signal.price_direction_3d  },
                    { label: "7D",  dir: signal.price_direction_7d  },
                    { label: "14D", dir: signal.price_direction_14d },
                  ].map(({ label, dir }) => (
                    <div key={label} className="flex-1 bg-bg-tertiary rounded-lg py-2 flex flex-col items-center gap-0.5">
                      <span className={`font-mono text-sm font-bold ${dirColor(dir)}`}>{dirArrow(dir)}</span>
                      <span className="text-text-tertiary text-[10px]">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key reason */}
              {signal.key_reason && (
                <div>
                  <div className="text-text-tertiary text-xs uppercase tracking-wider mb-2">Key Signal</div>
                  <p className="text-text-secondary text-xs leading-relaxed bg-bg-tertiary rounded-lg p-3">{signal.key_reason}</p>
                </div>
              )}

              {/* RSI value */}
              {signal.raw_indicators?.rsi_14 != null && (
                <div className="bg-bg-tertiary rounded-lg px-3 py-2.5 flex justify-between items-center">
                  <span className="text-text-tertiary text-xs uppercase tracking-wider">RSI (14)</span>
                  <span className={`font-mono text-sm font-semibold ${
                    (signal.raw_indicators.rsi_14 as number) < 30 ? "text-accent-green" :
                    (signal.raw_indicators.rsi_14 as number) > 70 ? "text-accent-red" : "text-text-primary"
                  }`}>
                    {(signal.raw_indicators.rsi_14 as number).toFixed(1)}
                    <span className="text-text-tertiary text-[10px] ml-1">
                      {(signal.raw_indicators.rsi_14 as number) < 30 ? "OVERSOLD" :
                       (signal.raw_indicators.rsi_14 as number) > 70 ? "OVERBOUGHT" : "NEUTRAL"}
                    </span>
                  </span>
                </div>
              )}

              {/* AI Summary */}
              {signal.summary && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-accent-blue text-xs">◈</span>
                    <span className="text-text-tertiary text-xs uppercase tracking-wider">Setup Analysis</span>
                  </div>
                  <p className="text-text-secondary text-xs leading-relaxed">{signal.summary}</p>
                </div>
              )}

              {/* Claude context read */}
              <div>
                {contextState === "idle" && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      setContextState("loading");
                      try {
                        const res = await api.post(`/api/stocks/${ticker}/context`);
                        setContextText(res.data.context ?? null);
                      } catch {
                        setContextText(null);
                      }
                      setContextState("done");
                    }}
                    className="w-full border-accent-purple/30 bg-accent-purple/10 text-accent-purple hover:bg-accent-purple/20 text-xs font-semibold"
                  >
                    ✦ Get context read
                  </Button>
                )}
                {contextState === "loading" && (
                  <div className="flex items-center justify-center gap-2.5 px-3 py-3 rounded-lg border border-accent-purple/20 bg-accent-purple/5">
                    <div className="w-3.5 h-3.5 border-2 border-accent-purple/30 border-t-accent-purple rounded-full animate-spin" />
                    <span className="text-accent-purple/70 text-xs">Analyzing… this takes a few seconds</span>
                  </div>
                )}
                {contextState === "done" && (
                  <div className="rounded-lg border border-accent-purple/20 bg-accent-purple/5 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-accent-purple text-xs">✦</span>
                      <span className="text-accent-purple/70 text-xs uppercase tracking-wider font-semibold">AI Context</span>
                    </div>
                    <p className="text-text-secondary text-xs leading-relaxed">
                      {contextText ?? "Context unavailable right now"}
                    </p>
                  </div>
                )}
              </div>

              {/* Claude chart analysis */}
              <div>
                {chartAnalysisState === "idle" && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      setChartAnalysisState("loading");
                      try {
                        const res = await api.post(`/api/stocks/${ticker}/chart-analysis`);
                        setChartAnalysisText(res.data.analysis ?? null);
                      } catch {
                        setChartAnalysisText(null);
                      }
                      setChartAnalysisState("done");
                    }}
                    className="w-full border-accent-purple/30 bg-accent-purple/10 text-accent-purple hover:bg-accent-purple/20 text-xs font-semibold"
                  >
                    ✦ Analyze the charts
                  </Button>
                )}
                {chartAnalysisState === "loading" && (
                  <div className="flex items-center justify-center gap-2.5 px-3 py-3 rounded-lg border border-accent-purple/20 bg-accent-purple/5">
                    <div className="w-3.5 h-3.5 border-2 border-accent-purple/30 border-t-accent-purple rounded-full animate-spin" />
                    <span className="text-accent-purple/70 text-xs">Analyzing charts… this takes a few seconds</span>
                  </div>
                )}
                {chartAnalysisState === "done" && (
                  <>
                    <div className="rounded-lg border border-accent-purple/20 bg-accent-purple/5 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-accent-purple text-xs">✦</span>
                        <span className="text-accent-purple/70 text-xs uppercase tracking-wider font-semibold">Chart Analysis</span>
                      </div>
                      <p className="text-text-secondary text-xs leading-relaxed">
                        {chartAnalysisText ?? "Chart analysis unavailable right now"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => { setChartAnalysisState("idle"); setChartAnalysisText(null); }}
                      className="w-full mt-1.5 text-[10px] text-text-tertiary hover:text-accent-purple"
                    >
                      Re-run analysis
                    </Button>
                  </>
                )}
              </div>

              {/* Claude setup review */}
              <div>
                {setupReviewState === "idle" && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      setSetupReviewState("loading");
                      try {
                        const res = await api.post(`/api/stocks/${ticker}/setup-review`);
                        setSetupReviewText(res.data.review ?? null);
                      } catch {
                        setSetupReviewText(null);
                      }
                      setSetupReviewState("done");
                    }}
                    className="w-full border-accent-purple/30 bg-accent-purple/10 text-accent-purple hover:bg-accent-purple/20 text-xs font-semibold"
                  >
                    ✦ Get setup review
                  </Button>
                )}
                {setupReviewState === "loading" && (
                  <div className="flex items-center justify-center gap-2.5 px-3 py-3 rounded-lg border border-accent-purple/20 bg-accent-purple/5">
                    <div className="w-3.5 h-3.5 border-2 border-accent-purple/30 border-t-accent-purple rounded-full animate-spin" />
                    <span className="text-accent-purple/70 text-xs">Reviewing setup… this takes a few seconds</span>
                  </div>
                )}
                {setupReviewState === "done" && (
                  <>
                    <div className="rounded-lg border border-accent-purple/20 bg-accent-purple/5 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-accent-purple text-xs">✦</span>
                        <span className="text-accent-purple/70 text-xs uppercase tracking-wider font-semibold">AI Setup Review</span>
                      </div>
                      <p className="text-text-secondary text-xs leading-relaxed">
                        {setupReviewText ?? "Setup review unavailable right now"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => { setSetupReviewState("idle"); setSetupReviewText(null); }}
                      className="w-full mt-1.5 text-[10px] text-text-tertiary hover:text-accent-purple"
                    >
                      Re-run review
                    </Button>
                  </>
                )}
              </div>

              {/* Risk factors */}
              {signal.risk_factors && signal.risk_factors.length > 0 && (
                <div>
                  <div className="text-text-tertiary text-xs uppercase tracking-wider mb-2">Risk Factors</div>
                  <div className="space-y-1.5">
                    {signal.risk_factors.map((r, i) => (
                      <Alert key={i} className="bg-accent-amber/5 border-accent-amber/15 px-2.5 py-2">
                        <AlertDescription className="flex gap-2 text-xs text-accent-amber/80">
                          <span className="shrink-0">⚠</span>
                          <span className="leading-relaxed">{r}</span>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-text-tertiary">
              <div>
                <div className="text-3xl mb-3">◎</div>
                <p className="text-sm">No signal available for {ticker}.</p>
                {signalWarnings && (
                  <p className="text-accent-red/80 text-xs mt-2">{signalWarnings.join(" · ")}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
