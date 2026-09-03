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
      className="group flex flex-col gap-2 px-5 py-4 cursor-pointer transition-colors border-b border-border bg-transparent hover:bg-muted"
    >
      {/* Meta row */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
          {ticker}
        </span>
        <span className="text-xs font-sans text-muted-foreground">
          {publisher && <>{publisher} · </>}{timeAgo}
        </span>
      </div>

      {/* Headline */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-sans font-medium leading-snug text-foreground line-clamp-2">
          {title}
        </p>
        <span className="shrink-0 text-xs font-sans text-muted-foreground transition-colors whitespace-nowrap">
          Read more →
        </span>
      </div>
    </div>
  );
}
