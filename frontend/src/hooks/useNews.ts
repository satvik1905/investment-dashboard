import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";

export interface NewsArticle {
  ticker: string;
  title: string;
  publisher: string;
  link: string;
  published_at: string | null;
}

export interface VixData {
  current: number | null;
  previous_close: number | null;
  change: number | null;
  change_pct: number | null;
  closes: { date: string; value: number }[];
  error?: string;
}

export type VixRange = "30d" | "3m" | "6m" | "1y";

export function useVix(range: VixRange = "30d") {
  return useQuery<VixData>({
    queryKey: ["vix", range],
    queryFn: async () => {
      const res = await api.get(`/api/news/vix?range=${range}`);
      return res.data;
    },
    staleTime: 900_000,
    retry: 2,
  });
}

export function useNewsFeed(tickers: string[]) {
  return useQuery<{ articles: NewsArticle[] }>({
    queryKey: ["news-feed", tickers],
    queryFn: async () => {
      const res = await api.get(`/api/news/feed?tickers=${tickers.join(",")}`);
      return res.data;
    },
    staleTime: 900_000,
    enabled: tickers.length > 0,
    retry: 2,
  });
}

export function useNewsRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["vix"] });
    qc.invalidateQueries({ queryKey: ["news-feed"] });
  };
}
