import type { Signal } from "../hooks/useSignals";
import { CandleSwatch, type CandleColor } from "./CandleSwatch";
import { cn } from "@/lib/utils";

/**
 * The watchlist's one vocabulary for a signal: the Danny Cheng candle color, a plain
 * label, and how long ago the trend flipped. Shared by the dashboard and the detail modal.
 */

export const STATE_LABEL: Record<CandleColor, string> = {
  RED: "Bullish flip",
  YELLOW: "Bearish flip",
  BLUE: "Uptrend",
  CYAN: "Downtrend",
};

export interface CandleState {
  color: CandleColor | null;
  label: string;
  detail: string;
  sinceFlip: number | null;
}

export function candleState(signal: Signal): CandleState {
  const ri = signal.raw_indicators ?? {};
  // Older rows may lack Danny Cheng fields; fall back to the signal itself
  const color =
    (ri.danny_current_color as CandleColor | undefined) ??
    (signal.signal.endsWith("BUY") ? "RED" : signal.signal.endsWith("SELL") ? "YELLOW" : null);
  const sinceFlip = (ri.danny_candles_since_signal as number | undefined) ?? null;
  const lastFlip = (ri.danny_last_signal_color as string | null | undefined) ?? null;

  if (!color) return { color: null, label: "Hold", detail: "Trend data unavailable", sinceFlip };

  let detail: string;
  if (color === "RED" || color === "YELLOW") {
    detail = `${color === "RED" ? "Red" : "Yellow"} candle on the latest close`;
  } else if (lastFlip && sinceFlip != null) {
    detail = `${sinceFlip} candle${sinceFlip === 1 ? "" : "s"} since ${lastFlip.toLowerCase()} flip`;
  } else {
    detail = "No flip in the last 6 months";
  }
  return { color, label: STATE_LABEL[color], detail, sinceFlip };
}

export function StateCell({ signal, size = "sm" }: { signal: Signal; size?: "sm" | "lg" }) {
  const state = candleState(signal);
  const large = size === "lg";
  return (
    <div className="flex items-center gap-2.5" title={signal.key_reason ?? undefined}>
      {state.color
        ? <CandleSwatch color={state.color} className={large ? "w-2 h-6" : "h-4"} />
        : <span className="w-1.5 shrink-0" />}
      <div className="min-w-0">
        <div className={cn("font-medium text-foreground leading-snug", large ? "text-base font-semibold" : "text-sm")}>{state.label}</div>
        <div className={cn("text-muted-foreground leading-snug truncate", large ? "text-sm" : "text-xs")}>{state.detail}</div>
      </div>
    </div>
  );
}
