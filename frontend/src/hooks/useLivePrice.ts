import { useQueries } from "@tanstack/react-query";
import api from "../api/client";

export interface LiveQuote {
  ticker:        string;
  company_name?: string | null;
  current_price: number | null;
  prev_close:    number | null;
  change:        number;
  change_pct:    number;
  market_status: "OPEN" | "PRE_MARKET" | "AFTER_HOURS" | "CLOSED";
  price_label:   string;
  data_warning?: string[];
}

/**
 * Poll live quotes for all tickers every 10 seconds.
 * Returns a map of ticker → LiveQuote plus the current market status.
 */
export function useLiveQuotes(tickers: string[]) {
  const results = useQueries({
    queries: tickers.map((ticker) => ({
      queryKey:  ["live-quote", ticker],
      queryFn:   async (): Promise<LiveQuote> => {
        const res = await api.get(`/api/stocks/${ticker}/quote`);
        return res.data;
      },
      refetchInterval:            10_000,
      staleTime:                  9_000,
      refetchIntervalInBackground: false,
    })),
  });

  const quotes: Record<string, LiveQuote> = {};
  tickers.forEach((t, i) => {
    if (results[i].data) quotes[t] = results[i].data!;
  });

  const firstQuote = results.find((r) => r.data)?.data ?? null;

  return {
    quotes,
    marketStatus: firstQuote?.market_status ?? null as LiveQuote["market_status"] | null,
    priceLabel:   firstQuote?.price_label   ?? null,
  };
}
