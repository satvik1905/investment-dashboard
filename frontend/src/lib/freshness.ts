/**
 * Signal freshness. Signals are computed from daily candles, so a signal is stale
 * once a newer daily close exists than the one it was computed from.
 * Market holidays are not modelled — on a holiday this errs toward "stale".
 */

const ET = "America/New_York";

/** The most recent weekday 4:00 PM ET at or before `now`. */
export function lastMarketClose(now: Date = new Date()): Date {
  // Wall-clock ET time expressed as a local Date, plus the offset back to the real instant
  const et = new Date(now.toLocaleString("en-US", { timeZone: ET }));
  const offsetMs = now.getTime() - et.getTime();

  const close = new Date(et);
  close.setHours(16, 0, 0, 0);
  if (et < close) close.setDate(close.getDate() - 1);
  while (close.getDay() === 0 || close.getDay() === 6) close.setDate(close.getDate() - 1);

  return new Date(close.getTime() + offsetMs);
}

export function isStale(generatedAt: string | null, now: Date = new Date()): boolean {
  if (!generatedAt) return true;
  return new Date(generatedAt) < lastMarketClose(now);
}

/** Compact age: "Today", "1d", "64d". */
export function signalAge(generatedAt: string | null, now: Date = new Date()): string {
  if (!generatedAt) return "—";
  const days = Math.floor((now.getTime() - new Date(generatedAt).getTime()) / 86_400_000);
  return days <= 0 ? "Today" : `${days}d`;
}
