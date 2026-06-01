import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";

export interface FearGreedData {
  score: number | null;
  rating: string;
  previous_close: number | null;
  previous_1_week: number | null;
  previous_1_month: number | null;
  timestamp: string;
  error?: string;
}

export interface NewsArticle {
  ticker: string;
  title: string;
  publisher: string;
  link: string;
  published_at: string | null;
}

export function useFearGreed() {
  return useQuery<FearGreedData>({
    queryKey: ["fear-greed"],
    queryFn: async () => {
      const res = await api.get("/api/news/fear-greed");
      return res.data;
    },
    staleTime: 3_600_000,
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
    qc.invalidateQueries({ queryKey: ["fear-greed"] });
    qc.invalidateQueries({ queryKey: ["news-feed"] });
  };
}
