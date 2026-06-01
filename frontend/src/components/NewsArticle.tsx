interface Props {
  ticker: string;
  title: string;
  publisher: string;
  link: string;
  timeAgo: string;
}

export function NewsArticleRow({ ticker, title, publisher, link, timeAgo }: Props) {
  const open = () => link && window.open(link, "_blank", "noopener,noreferrer");

  return (
    <div
      onClick={open}
      className="group flex flex-col gap-2 px-5 py-4 cursor-pointer transition-colors"
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        background: "transparent",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Meta row */}
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
        >
          {ticker}
        </span>
        <span className="text-xs font-sans" style={{ color: "var(--text-muted)" }}>
          {publisher && <>{publisher} · </>}{timeAgo}
        </span>
      </div>

      {/* Headline */}
      <div className="flex items-start justify-between gap-4">
        <p
          className="text-sm font-sans font-medium leading-snug transition-colors"
          style={{
            color: "var(--text-primary)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {title}
        </p>
        <span
          className="shrink-0 text-xs font-sans transition-colors whitespace-nowrap"
          style={{ color: "var(--text-muted)" }}
        >
          Read more →
        </span>
      </div>
    </div>
  );
}
