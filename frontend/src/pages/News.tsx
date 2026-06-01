import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useSignals } from "../hooks/useSignals";
import { usePositions } from "../hooks/usePositions";
import {
  useFearGreed,
  useNewsFeed,
  useNewsRefresh,
} from "../hooks/useNews";
import { FearGreedGauge, FearGreedSkeleton } from "../components/FearGreedGauge";
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

  const { data: fearGreed, isLoading: fgLoading } = useFearGreed();
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
          Market mood and stock news for your positions
        </p>
      </div>
      <RefreshButton onClick={handleRefresh} spinning={spinning} />
    </div>
  );

  if (tickers.length === 0) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-10">
        {header}
        {/* Still show Fear & Greed even with no stocks */}
        <motion.section custom={0} variants={sectionAnim} initial="hidden" animate="visible">
          <SectionLabel>Market Sentiment</SectionLabel>
          {fgLoading ? (
            <FearGreedSkeleton />
          ) : (
            <Card>
              {fearGreed
                ? <FearGreedGauge data={fearGreed} />
                : <div className="flex items-center justify-center h-40 text-sm font-sans" style={{ color: "var(--text-muted)" }}>
                    Market sentiment unavailable
                  </div>
              }
            </Card>
          )}
        </motion.section>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-10">
      {header}

      {/* Section 1 — Fear & Greed */}
      <motion.section custom={0} variants={sectionAnim} initial="hidden" animate="visible">
        <SectionLabel>Market Sentiment</SectionLabel>
        {fgLoading ? (
          <FearGreedSkeleton />
        ) : (
          <Card>
            {fearGreed
              ? <FearGreedGauge data={fearGreed} />
              : <div className="flex items-center justify-center h-40 text-sm font-sans" style={{ color: "var(--text-muted)" }}>
                  Market sentiment unavailable
                </div>
            }
          </Card>
        )}
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
