import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
} from "lightweight-charts";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import api from "../api/client";
import type { Signal } from "../hooks/useSignals";
import { useLiveQuotes } from "../hooks/useLivePrice";
import { ConfidenceMeter } from "./ConfidenceMeter";

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
  signal: Signal | null;
  onClose: () => void;
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

const BG     = "#0a0e1a";
const TEXT   = "#94a3b8";
const GRID   = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.08)";

const SIGNAL_CFG = {
  STRONG_BUY:  { label: "STRONG BUY",  cls: "bg-accent-green/20 text-accent-green border-accent-green/40" },
  BUY:         { label: "BUY",         cls: "bg-accent-green/10 text-accent-green border-accent-green/30" },
  HOLD:        { label: "HOLD",        cls: "bg-accent-amber/10 text-accent-amber border-accent-amber/30" },
  SELL:        { label: "SELL",        cls: "bg-accent-red/10 text-accent-red border-accent-red/30" },
  STRONG_SELL: { label: "STRONG SELL", cls: "bg-accent-red/20 text-accent-red border-accent-red/40" },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitialTimeframe(): Timeframe {
  return new URLSearchParams(window.location.search).get("tf") === "W" ? "W" : "D";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StockDetailModal({ ticker, signal, onClose }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>(getInitialTimeframe);

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
    // Build date→color lookup; fall back to BLUE if no Danny data yet
    const colorByTime = new Map<string, DannyColor>();
    for (const { time, color } of (data.danny_colors ?? [])) colorByTime.set(time, color);

    const groups: Record<DannyColor, Candle[]> = { BLUE: [], CYAN: [], RED: [], YELLOW: [] };
    for (const c of data.candles) {
      groups[colorByTime.get(c.time) ?? "BLUE"].push(c);
    }

    // First non-empty series hosts the price lines
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
          <div style="color:#f1f5f9;font-size:12px;font-weight:600">${timeframe === "D" ? `${weekday}, ` : ""}${dateLabel}</div>
          <div style="color:var(--text-disabled);font-size:10px;margin-top:1px">${subLabel}</div>
        </div>
        <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:3px 14px;font-size:11px;font-family:'DM Mono',monospace">
          <div><span style="color:var(--text-disabled)">O</span>&nbsp;<span style="color:#f1f5f9">${fmt(candle.open)}</span></div>
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
  const cfg          = signal ? (SIGNAL_CFG[signal.signal] ?? SIGNAL_CFG.HOLD) : null;
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
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] bg-bg-secondary shrink-0">

        {/* Left: close + ticker + price + signal badge */}
        <div className="flex items-center gap-4">
          <button onClick={handleClose} className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none">✕</button>
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
          {cfg && (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}>{cfg.label}</span>
          )}
        </div>

        {/* Center: D / W / M toggle */}
        <div className="flex items-center gap-1 bg-bg-tertiary rounded-lg p-1">
          {(["D", "W", "M"] as Timeframe[]).map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                timeframe === tf ? "bg-accent-blue text-white shadow" : "text-text-tertiary hover:text-text-secondary"
              }`}
            >{tf}</button>
          ))}
        </div>

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
        <div className="mx-5 mt-3 px-4 py-2.5 rounded-lg border text-xs leading-relaxed bg-accent-amber/10 border-accent-amber/25 text-accent-amber">
          <span className="font-semibold">⚠ This ticker's data may be stale or incorrect:</span>{" "}
          {((liveQuote?.data_warning ?? signal?.raw_indicators?.data_warning) as string[]).join(" · ")}
        </div>
      )}

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Charts column */}
        <div ref={chartsRef} className="flex-1 flex flex-col min-w-0 relative">

          {/* Loading overlay */}
          {isFetching && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-primary/60 backdrop-blur-[2px]">
              <div className="flex items-center gap-2.5 bg-bg-secondary border border-white/[0.08] rounded-xl px-4 py-2.5 shadow-xl">
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
                    background: "rgba(10,14,26,0.93)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    backdropFilter: "blur(8px)",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
                    zIndex: 20,
                    minWidth: "155px",
                  }}
                />
              </div>
              <div className="h-px bg-white/[0.06] shrink-0" />
              <div ref={volRef}  className="flex-[3]" />
              <div className="h-px bg-white/[0.06] shrink-0" />
              <div ref={rsiRef}  className="flex-[4]" />
            </>
          )}
        </div>

        {/* ── Signal panel ─────────────────────────────────────────────────── */}
        <div className="w-80 border-l border-white/[0.08] bg-bg-secondary flex flex-col overflow-y-auto shrink-0">
          {signal ? (
            <div className="p-5 space-y-5">

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

              {/* Risk factors */}
              {signal.risk_factors && signal.risk_factors.length > 0 && (
                <div>
                  <div className="text-text-tertiary text-xs uppercase tracking-wider mb-2">Risk Factors</div>
                  <div className="space-y-1.5">
                    {signal.risk_factors.map((r, i) => (
                      <div key={i} className="flex gap-2 text-xs text-accent-amber/80 bg-accent-amber/5 border border-accent-amber/15 rounded-lg px-2.5 py-2">
                        <span className="shrink-0">⚠</span>
                        <span className="leading-relaxed">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-text-tertiary">
              <div>
                <div className="text-3xl mb-3">◎</div>
                <p className="text-sm">No signal generated for {ticker} yet.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
