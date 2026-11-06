/**
 * Data-quality warnings come from the backend's ticker validation (market_data.validate_ticker),
 * attached to the signal at calculation time and to live quotes.
 *
 * "No regular market price" is common and usually transient, so it gets a quiet note.
 * Everything else (price discrepancy, possibly delisted, stale or gappy history) means the
 * signal itself may be built on bad data, so it gets a visible "Check data" flag.
 */

import type { Signal } from "../hooks/useSignals";
import type { LiveQuote } from "../hooks/useLivePrice";

export interface DataIssue {
  severity: "check" | "quiet";
  messages: string[];
}

const QUIET = /^No regular market price/;

function signalWarnings(signal: Signal): string[] {
  const w = signal.raw_indicators?.data_warning;
  return Array.isArray(w) ? (w as string[]) : [];
}

/** Classify a bare warning list (the modal gets warnings from both the signal and the quote). */
export function classifyWarnings(messages: string[] | null | undefined): DataIssue | null {
  if (!messages?.length) return null;
  const serious = messages.filter((m) => !QUIET.test(m));
  return serious.length ? { severity: "check", messages: serious } : { severity: "quiet", messages };
}

export function dataIssue(signal: Signal, quote?: LiveQuote): DataIssue | null {
  return classifyWarnings([...new Set([...signalWarnings(signal), ...(quote?.data_warning ?? [])])]);
}

/** Whether a signal was calculated on data that needs checking (used for ranking). */
export function needsDataCheck(signal: Signal): boolean {
  return signalWarnings(signal).some((m) => !QUIET.test(m));
}
