import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceArea, Tooltip,
} from "recharts";
import { useSignals } from "../hooks/useSignals";
import { usePositions } from "../hooks/usePositions";
import {
  useVix,
  useNewsFeed,
  useNewsRefresh,
  type VixRange,
} from "../hooks/useNews";
import { NewsArticleRow } from "../components/NewsArticle";
import { useAppStore } from "../store/appStore";

// ── Animation variants ────────────────────────────────────────────────────────

const sectionAnim = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.3, ease: "easeOut" },
  }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] mb-4"
      style={{ color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[12px] overflow-hidden ${className}`}
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
      {children}
    </div>
  );
}

function RefreshButton({ onClick, spinning }: { onClick: () => void; spinning: boolean }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-sans"
      style={{ background: "transparent", border: "1px solid var(--border-strong)", color: "var(--text-secondary)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <span className={spinning ? "animate-spin inline-block" : ""}>↻</span>
      Refresh
    </button>
  );
}

// ── VIX Card ─────────────────────────────────────────────────────────────────

const VIX_RANGES: { key: VixRange; label: string }[] = [
  { key: "30d", label: "30D" },
  { key: "3m",  label: "3M" },
  { key: "6m",  label: "6M" },
  { key: "1y",  label: "1Y" },
];

function VixCard() {
  const [range, setRange] = useState<VixRange>("30d");
  const { data: vix, isLoading } = useVix(range);

  if (isLoading) {
    return <div className="skeleton h-56 rounded-xl" />;
  }

  if (!vix || vix.current == null) {
    return (
      <Card>
        <div className="flex items-center justify-center h-40 text-sm font-sans" style={{ color: "var(--text-muted)" }}>
          VIX unavailable
        </div>
      </Card>
    );
  }

  const current = vix.current;
  const change = vix.change ?? 0;
  const changePct = vix.change_pct ?? 0;

  // VIX up = more fear (red), VIX down = calmer (green) — inverted from stocks
  const vixUp = change > 0;
  const changeColor = vixUp ? "text-accent-red" : "text-accent-green";
  const changeArrow = vixUp ? "↑" : "↓";

  // State pill: derived from live value
  let pillLabel: string;
  let pillColorClass: string;
  if (current < 15) {
    pillLabel = "Calm";
    pillColorClass = "bg-accent-blue/15 text-accent-blue border-accent-blue/30";
  } else if (current < 25) {
    pillLabel = "Elevated";
    pillColorClass = "bg-accent-amber/15 text-accent-amber border-accent-amber/30";
  } else {
    pillLabel = "Fear";
    pillColorClass = "bg-accent-red/15 text-accent-red border-accent-red/30";
  }

  // Y-axis: fixed for 30d/3m, auto-scaled for 6m/1y
  const useFixedAxis = range === "30d" || range === "3m";
  let yDomain: [number, number];
  let yTicks: number[];
  if (useFixedAxis) {
    yDomain = [10, 45];
    yTicks = [15, 25, 35, 45];
  } else {
    const values = vix.closes.map((c) => c.value);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const floor = Math.max(0, Math.floor(dataMin / 5) * 5);
    const ceil = Math.ceil(dataMax * 1.1 / 5) * 5;
    yDomain = [floor, ceil];
    // Generate ticks at multiples of 5 or 10 depending on range
    const step = ceil - floor > 40 ? 10 : 5;
    yTicks = [];
    for (let t = floor + step; t <= ceil; t += step) {
      yTicks.push(t);
    }
  }

  return (
    <Card>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--text-muted)" }}>
              Volatility · VIX
            </span>
            <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${pillColorClass}`}>
              {pillLabel}
            </span>
          </div>

          {/* Range presets */}
          <div className="flex items-center gap-1 bg-bg-secondary border border-white/[0.06] rounded-lg p-0.5">
            {VIX_RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-medium transition-colors ${
                  range === r.key
                    ? "bg-bg-tertiary text-text-primary border border-accent-blue/30"
                    : "text-text-tertiary hover:text-text-secondary border border-transparent"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Value row */}
        <div className="flex items-baseline gap-3 mb-5">
          <span className="text-3xl font-mono font-bold" style={{ color: "var(--text-primary)" }}>
            {current.toFixed(2)}
          </span>
          <span className={`text-sm font-mono font-medium ${changeColor}`}>
            {changeArrow} {Math.abs(change).toFixed(2)} ({Math.abs(changePct).toFixed(1)}%)
          </span>
        </div>

        {/* Chart */}
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={vix.closes} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              {/* Threshold bands: calm 10–15, elevated 15–25, fear 25–45 */}
              <ReferenceArea y1={Math.max(yDomain[0], 10)} y2={15} fill="#3B82F6" fillOpacity={0.05} />
              <ReferenceArea y1={15} y2={25} fill="#F59E0B" fillOpacity={0.05} />
              <ReferenceArea y1={25} y2={Math.min(yDomain[1], 45)} fill="#F43F5E" fillOpacity={0.05} />

              <XAxis
                dataKey="date"
                tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "DM Mono" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(d: string) => d.slice(5)}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                domain={yDomain}
                tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "DM Mono" }}
                axisLine={false}
                tickLine={false}
                width={30}
                ticks={yTicks}
              />
              <Tooltip
                contentStyle={{
                  background: "#111827",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: "DM Mono, monospace",
                }}
                labelStyle={{ color: "#94A3B8" }}
                itemStyle={{ color: "#F8FAFC" }}
                formatter={(v: number) => [v.toFixed(2), "VIX"]}
                labelFormatter={(d: string) => d}
              />
              <defs>
                <linearGradient id="vixGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="#F59E0B"
                strokeWidth={1.5}
                fill="url(#vixGradient)"
                dot={false}
                activeDot={{ r: 3, fill: "#F59E0B" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-32">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" opacity="0.25">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <p className="text-sm font-sans font-medium" style={{ color: "var(--text-secondary)" }}>
        Add stocks to your signals or positions to see news
      </p>
      <button onClick={() => setActiveTab("watchlist")}
        className="px-5 py-2.5 rounded-lg text-sm font-sans font-medium"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-primary)" }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}>
        Go to Watchlist →
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function News() {
  const { data: signals = [] } = useSignals();
  const { data: positions = [] } = usePositions();

  const tickers = useMemo(() => {
    const set = new Set<string>();
    signals.forEach((s) => set.add(s.ticker));
    positions.filter((p) => p.status === "OPEN").forEach((p) => set.add(p.ticker));
    return Array.from(set);
  }, [signals, positions]);

  const { data: feedData, isLoading: feedLoading } = useNewsFeed(tickers);
  const refresh = useNewsRefresh();

  const [filterTicker, setFilterTicker] = useState("all");
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    setSpinning(true);
    refresh();
    setTimeout(() => setSpinning(false), 1000);
  };

  const articles = feedData?.articles ?? [];
  const filtered = filterTicker === "all" ? articles : articles.filter((a) => a.ticker === filterTicker);

  const header = (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="font-display text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
          News & Sentiment
        </h1>
        <p className="text-sm font-sans mt-1" style={{ color: "var(--text-muted)" }}>
          Market volatility and stock news for your positions
        </p>
      </div>
      <RefreshButton onClick={handleRefresh} spinning={spinning} />
    </div>
  );

  if (tickers.length === 0) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-10">
        {header}
        <motion.section custom={0} variants={sectionAnim} initial="hidden" animate="visible">
          <SectionLabel>Market Volatility</SectionLabel>
          <VixCard />
        </motion.section>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-10">
      {header}

      {/* Section 1 — VIX */}
      <motion.section custom={0} variants={sectionAnim} initial="hidden" animate="visible">
        <SectionLabel>Market Volatility</SectionLabel>
        <VixCard />
      </motion.section>

      {/* Section 2 — News Feed */}
      <motion.section custom={1} variants={sectionAnim} initial="hidden" animate="visible">
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Latest News</SectionLabel>
          <select
            value={filterTicker}
            onChange={(e) => setFilterTicker(e.target.value)}
            className="text-xs font-sans px-3 py-1.5 rounded-md outline-none"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
          >
            <option value="all">All Stocks</option>
            {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {feedLoading ? (
          <div className="space-y-px">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-none first:rounded-t-[12px] last:rounded-b-[12px]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <div className="flex items-center justify-center h-32 text-sm font-sans" style={{ color: "var(--text-muted)" }}>
              No recent news found for your stocks.
            </div>
          </Card>
        ) : (
          <Card>
            {filtered.map((article) => (
              <NewsArticleRow
                key={article.link || article.title}
                ticker={article.ticker}
                title={article.title}
                publisher={article.publisher}
                link={article.link}
                timeAgo={timeAgo(article.published_at)}
              />
            ))}
          </Card>
        )}
      </motion.section>
    </div>
  );
}
