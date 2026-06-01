import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";

export interface Signal {
  id: number;
  ticker: string;
  signal: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
  confidence: number | null;
  price_direction_3d: string | null;
  price_direction_7d: string | null;
  price_direction_14d: string | null;
  entry_zone_low: string | null;
  entry_zone_high: string | null;
  target_price: string | null;
  stop_loss: string | null;
  key_reason: string | null;
  risk_factors: string[] | null;
  summary: string | null;
  raw_indicators: Record<string, unknown> | null;
  generated_at: string | null;
}

export function useSignals() {
  return useQuery<Signal[]>({
    queryKey: ["signals"],
    queryFn: async () => {
      const res = await api.get("/api/signals/latest");
      return res.data;
    },
    refetchInterval: 5 * 60_000, // refresh every 5 minutes
  });
}

export function useRemoveSignal(callbacks?: {
  onSuccess?: (ticker: string) => void;
  onError?: (ticker: string) => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ticker: string) => {
      await api.delete(`/api/signals/${ticker}`);
      return ticker;
    },
    onMutate: async (ticker) => {
      await qc.cancelQueries({ queryKey: ["signals"] });
      const previous = qc.getQueryData<Signal[]>(["signals"]);
      qc.setQueryData<Signal[]>(["signals"], (old) =>
        old ? old.filter((s) => s.ticker !== ticker) : []
      );
      return { previous };
    },
    onSuccess: (_data, ticker) => {
      callbacks?.onSuccess?.(ticker);
    },
    onError: (_err, ticker, context: any) => {
      if (context?.previous) {
        qc.setQueryData(["signals"], context.previous);
      }
      callbacks?.onError?.(ticker);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["signals"] });
    },
  });
}

export function useGenerateSignal(callbacks?: {
  onMutate?: (ticker: string) => void;
  onSettled?: () => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ticker: string) => {
      const res = await api.post(`/api/signals/generate?ticker=${ticker}`);
      return res.data as Signal;
    },
    onMutate: (ticker) => callbacks?.onMutate?.(ticker),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signals"] }),
    onSettled: () => callbacks?.onSettled?.(),
  });
}
