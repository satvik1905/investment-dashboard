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
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    <div className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] mb-4 text-muted-foreground">
      {children}
    </div>
  );
}

function RefreshButton({ onClick, spinning }: { onClick: () => void; spinning: boolean }) {
  return (
    <Button variant="outline" onClick={onClick}>
      <span className={spinning ? "animate-spin inline-block" : ""}>↻</span>
      Refresh
    </Button>
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
        <CardContent className="flex items-center justify-center h-40 text-sm font-sans text-muted-foreground">
          VIX unavailable
        </CardContent>
      </Card>
    );
  }

  const current = vix.current;
  const change = vix.change ?? 0;
  const changePct = vix.change_pct ?? 0;

  // VIX up = more fear (red), VIX down = calmer (green)
  const vixUp = change > 0;
  const changeColor = vixUp ? "text-destructive" : "text-primary";
  const changeArrow = vixUp ? "↑" : "↓";

  // State pill
  let pillLabel: string;
  let pillVariant: "buy" | "warning" | "sell";
  if (current < 15) {
    pillLabel = "Calm";
    pillVariant = "buy";
  } else if (current < 25) {
    pillLabel = "Elevated";
    pillVariant = "warning";
  } else {
    pillLabel = "Fear";
    pillVariant = "sell";
  }

  // Y-axis
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
    const step = ceil - floor > 40 ? 10 : 5;
    yTicks = [];
    for (let t = floor + step; t <= ceil; t += step) {
      yTicks.push(t);
    }
  }

  return (
    <Card className="p-0">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Volatility · VIX
            </span>
            <Badge variant={pillVariant} className="text-[10px] font-mono font-semibold">
              {pillLabel}
            </Badge>
          </div>

          {/* Range presets */}
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(v) => v && setRange(v as VixRange)}
            className="bg-card border border-black/[0.08] rounded-lg p-0.5"
          >
            {VIX_RANGES.map((r) => (
              <ToggleGroupItem
                key={r.key}
                value={r.key}
                className="px-2.5 py-1 text-[10px] font-mono font-medium"
              >
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Value row */}
        <div className="flex items-baseline gap-3 mb-5">
          <span className="text-3xl font-mono font-bold text-foreground">
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
              <ReferenceArea y1={Math.max(yDomain[0], 10)} y2={15} fill="#16a34a" fillOpacity={0.05} />
              <ReferenceArea y1={15} y2={25} fill="#f59e0b" fillOpacity={0.05} />
              <ReferenceArea y1={25} y2={Math.min(yDomain[1], 45)} fill="#dc2626" fillOpacity={0.05} />

              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 10, fontFamily: "Roboto Mono" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(d: string) => d.slice(5)}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                domain={yDomain}
                tick={{ fill: "#64748b", fontSize: 10, fontFamily: "Roboto Mono" }}
                axisLine={false}
                tickLine={false}
                width={30}
                ticks={yTicks}
              />
              <Tooltip
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: "var(--font-geist-mono, monospace)",
                }}
                labelStyle={{ color: "#64748b" }}
                itemStyle={{ color: "#0f172a" }}
                formatter={(v: number) => [v.toFixed(2), "VIX"]}
                labelFormatter={(d: string) => d}
              />
              <defs>
                <linearGradient id="vixGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="#f59e0b"
                strokeWidth={1.5}
                fill="url(#vixGradient)"
                dot={false}
                activeDot={{ r: 3, fill: "#f59e0b" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
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
      <p className="text-sm font-sans font-medium text-muted-foreground">
        Add stocks to your signals or positions to see news
      </p>
      <Button variant="outline" onClick={() => setActiveTab("dashboard")}>
        Go to Dashboard →
      </Button>
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
        <h1 className="font-sans text-3xl font-bold text-foreground">
          News & Sentiment
        </h1>
        <p className="text-sm font-sans mt-1 text-muted-foreground">
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
          <Select value={filterTicker} onValueChange={setFilterTicker}>
            <SelectTrigger className="text-xs font-sans w-auto">
              <SelectValue placeholder="All Stocks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stocks</SelectItem>
              {tickers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {feedLoading ? (
          <div className="space-y-px">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-none first:rounded-t-[12px] last:rounded-b-[12px]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center h-32 text-sm font-sans text-muted-foreground">
              No recent news found for your stocks.
            </CardContent>
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
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
