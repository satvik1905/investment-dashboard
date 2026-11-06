import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Human-readable reason for a failed API call. */
export function describeError(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { detail?: unknown } }; code?: string };
  if (!e?.response) {
    return e?.code === "ECONNABORTED"
      ? "The server took too long to respond — it may be waking up."
      : "Can't reach the server.";
  }
  const detail = e.response.data?.detail;
  if (typeof detail === "string" && detail.length < 140) return detail;
  return `Server error (${e.response.status ?? "unknown"}).`;
}

interface Props {
  title: string;
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  /** Inline single-row banner instead of a full empty-state block */
  compact?: boolean;
  className?: string;
}

export function ErrorState({ title, error, onRetry, retrying, compact, className }: Props) {
  const reason = error !== undefined ? describeError(error) : null;

  const retry = onRetry && (
    <Button
      variant="outline"
      size="sm"
      onClick={onRetry}
      disabled={retrying}
      className="rounded-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
    >
      <span className={cn("inline-block", retrying && "animate-spin")}>↻</span>
      {retrying ? "Retrying…" : "Retry"}
    </Button>
  );

  if (compact) {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3",
          className,
        )}
      >
        <span className="text-destructive text-base leading-none">⚠</span>
        <div className="flex-1 min-w-0">
          <p className="text-destructive text-sm font-semibold">{title}</p>
          {reason && <p className="text-muted-foreground text-xs mt-0.5">{reason}</p>}
        </div>
        {retry}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center py-14 px-6 text-center rounded-lg border border-destructive/20 bg-card",
        className,
      )}
    >
      <div className="w-10 h-10 rounded-full border border-destructive/30 bg-destructive/5 flex items-center justify-center mb-3">
        <span className="text-destructive text-lg">⚠</span>
      </div>
      <p className="text-foreground text-sm font-semibold">{title}</p>
      {reason && <p className="text-muted-foreground text-xs mt-1 max-w-sm">{reason}</p>}
      {retry && <div className="mt-4">{retry}</div>}
    </div>
  );
}
