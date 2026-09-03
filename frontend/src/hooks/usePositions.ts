import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";

export interface Position {
  id: number;
  ticker: string;
  entry_price: string;
  entry_date: string;
  quantity: number;
  stop_loss: string | null;
  target_price: string | null;
  notes: string | null;
  status: string;
  exit_price: string | null;
  exit_date: string | null;
  exit_reason: string | null;
  created_at: string | null;
}

export function usePositions() {
  return useQuery<Position[]>({
    queryKey: ["positions"],
    queryFn: async () => {
      const res = await api.get("/api/positions");
      return res.data;
    },
    refetchInterval: 5 * 60_000,
  });
}

export function useAddPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<Position, "id" | "status" | "exit_price" | "exit_date" | "exit_reason" | "created_at">) => {
      const res = await api.post("/api/positions", data);
      return res.data as Position;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["positions"] }),
  });
}

export interface PositionAlert {
  position_id: number;
  ticker: string;
  recommendation: "HOLD" | "EXIT";
  urgency: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  current_price: number | null;
  pnl_pct: number | null;
  hold_days: number | null;
}

export function usePositionAlerts() {
  return useQuery<PositionAlert[]>({
    queryKey: ["position-alerts"],
    queryFn: async () => {
      const res = await api.get("/api/positions/alerts");
      return res.data;
    },
    refetchInterval: 60_000,
  });
}

export function useClosePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, exit_price, exit_reason }: { id: number; exit_price: number; exit_reason?: string }) => {
      const res = await api.put(`/api/positions/${id}/close`, { exit_price, exit_reason });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions"] });
    },
  });
}

