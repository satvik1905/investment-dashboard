import { cn } from "@/lib/utils";

export type CandleColor = "RED" | "YELLOW" | "BLUE" | "CYAN";

// Same fills as the chart (StockDetailModal DC_FILL); cyan is deepened from the chart's
// #00FFFF so a small swatch stays visible on white
export const CANDLE_FILL: Record<CandleColor, string> = {
  RED: "#FF4444",
  YELLOW: "#FFD700",
  BLUE: "#1565C0",
  CYAN: "#06B6D4",
};

/** A small candle-shaped color chip in the Danny Cheng palette. */
export function CandleSwatch({ color, className }: { color: CandleColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block w-1.5 h-3.5 rounded-[2px] ring-1 ring-black/15 shrink-0", className)}
      style={{ backgroundColor: CANDLE_FILL[color] }}
    />
  );
}
