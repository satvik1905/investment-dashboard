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
      className="group flex flex-col gap-2 px-5 py-4 cursor-pointer transition-colors border-b border-[rgba(255,255,255,0.05)] bg-transparent hover:bg-bg-tertiary"
    >
      {/* Meta row */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-bg-tertiary text-text-secondary border border-[rgba(255,255,255,0.06)]">
          {ticker}
        </span>
        <span className="text-xs font-sans text-text-tertiary">
          {publisher && <>{publisher} · </>}{timeAgo}
        </span>
      </div>

      {/* Headline */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-sans font-medium leading-snug text-text-primary line-clamp-2">
          {title}
        </p>
        <span className="shrink-0 text-xs font-sans text-text-tertiary transition-colors whitespace-nowrap">
          Read more →
        </span>
      </div>
    </div>
  );
}
