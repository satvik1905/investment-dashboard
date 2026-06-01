import { useQuery } from "@tanstack/react-query";
import api from "../api/client";

export interface JournalEntry {
  id: number;
  ticker: string;
  direction: string | null;
  entry_price: string | null;
  exit_price: string | null;
  quantity: number | null;
  entry_date: string | null;
  exit_date: string | null;
  pnl: string | null;
  pnl_percent: string | null;
  hold_days: number | null;
  outcome: "WIN" | "LOSS" | "BREAKEVEN" | null;
  notes: string | null;
  signal_id: number | null;
  created_at: string | null;
}

export interface JournalAnalytics {
  total_trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl_per_trade: number;
  avg_hold_days: number;
  best_trade: number | null;
  worst_trade: number | null;
}

export function useJournal() {
  return useQuery<JournalEntry[]>({
    queryKey: ["journal"],
    queryFn: async () => {
      const res = await api.get("/api/journal");
      return res.data;
    },
  });
}

export function useJournalAnalytics() {
  return useQuery<JournalAnalytics>({
    queryKey: ["journal-analytics"],
    queryFn: async () => {
      const res = await api.get("/api/journal/analytics");
      return res.data;
    },
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await api.get("/api/dashboard");
      return res.data;
    },
    refetchInterval: 5 * 60_000,
  });
}

