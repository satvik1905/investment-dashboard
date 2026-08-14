import { useJournal, useJournalAnalytics } from "../hooks/useJournal";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function Journal() {
  const { data: trades, isLoading } = useJournal();
  const { data: analytics } = useJournalAnalytics();

  const stats = analytics
    ? [
        {
          label: "Win Rate",
          value: `${analytics.win_rate.toFixed(0)}%`,
          valueClass: analytics.win_rate >= 50 ? "text-accent-green" : "text-accent-red",
          sub: `${analytics.wins}W / ${analytics.losses}L`,
        },
        {
          label: "Total P&L",
          value: `${analytics.total_pnl >= 0 ? "+" : ""}$${analytics.total_pnl.toFixed(2)}`,
          valueClass: analytics.total_pnl >= 0 ? "text-accent-green" : "text-accent-red",
          sub: `${analytics.total_trades} trades`,
        },
        {
          label: "Avg P&L",
          value: `${analytics.avg_pnl_per_trade >= 0 ? "+" : ""}$${analytics.avg_pnl_per_trade.toFixed(2)}`,
          valueClass: analytics.avg_pnl_per_trade >= 0 ? "text-accent-green" : "text-accent-red",
          sub: "per trade",
        },
        {
          label: "Avg Hold",
          value: `${analytics.avg_hold_days.toFixed(1)}d`,
          valueClass: "text-text-primary",
          sub: analytics.best_trade != null ? `Best: +$${analytics.best_trade.toFixed(2)}` : "—",
        },
      ]
    : [];

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">
          Trade Journal
        </h1>
        <p className="text-text-tertiary text-sm mt-0.5">Performance history and analytics</p>
      </div>

      {/* Stat cards */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-0">
              <CardContent className="p-4">
                <div className="text-text-tertiary text-[10px] uppercase tracking-widest font-mono mb-2">
                  {s.label}
                </div>
                <div className={cn("font-mono text-2xl font-bold leading-none", s.valueClass)}>
                  {s.value}
                </div>
                <div className="text-text-muted text-[11px] font-mono mt-1.5">{s.sub}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* P&L chart */}
      {trades && trades.length > 0 && (
        <Card className="p-0">
          <CardContent className="p-5">
            <div className="text-text-tertiary text-[10px] uppercase tracking-widest font-mono mb-4">
              P&L by Trade
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={trades.slice().reverse()}
                margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
              >
                <XAxis
                  dataKey="ticker"
                  tick={{ fill: "var(--text-disabled)", fontSize: 10, fontFamily: "Roboto Mono" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--text-disabled)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#FFFFFF",
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: "Roboto Mono",
                  }}
                  labelStyle={{ color: "#475569" }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, "P&L"]}
                />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                  {trades
                    .slice()
                    .reverse()
                    .map((entry, i) => (
                      <Cell
                        key={i}
                        fill={parseFloat(entry.pnl ?? "0") >= 0 ? "#10B981" : "#F43F5E"}
                      />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Trade table */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
          <span className="text-text-secondary text-sm font-medium">Trade History</span>
          {trades && (
            <span className="text-text-tertiary text-xs font-mono">{trades.length} trades</span>
          )}
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : trades?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                {["Ticker", "Direction", "Entry", "Exit", "Qty", "Hold", "P&L", "Outcome"].map((h) => (
                  <TableHead
                    key={h}
                    className="px-5 py-3 text-[10px] font-normal text-text-tertiary uppercase tracking-widest font-mono"
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((t) => {
                const pnl = parseFloat(t.pnl ?? "0");
                return (
                  <TableRow key={t.id}>
                    <TableCell className="px-5 py-3 font-mono text-text-primary font-medium">
                      {t.ticker}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-text-secondary text-xs">{t.direction ?? "—"}</TableCell>
                    <TableCell className="px-5 py-3 font-mono text-text-secondary text-xs">
                      {t.entry_price ? `$${parseFloat(t.entry_price).toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="px-5 py-3 font-mono text-text-secondary text-xs">
                      {t.exit_price ? `$${parseFloat(t.exit_price).toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="px-5 py-3 font-mono text-text-tertiary text-xs">
                      {t.quantity ?? "—"}
                    </TableCell>
                    <TableCell className="px-5 py-3 font-mono text-text-tertiary text-xs">
                      {t.hold_days != null ? `${t.hold_days}d` : "—"}
                    </TableCell>
                    <TableCell className={cn(
                      "px-5 py-3 font-mono text-xs font-medium",
                      pnl >= 0 ? "text-accent-green" : "text-accent-red",
                    )}>
                      {t.pnl ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <Badge
                        variant={
                          t.outcome === "WIN" ? "win" :
                          t.outcome === "LOSS" ? "loss" :
                          "warning"
                        }
                        className="text-[10px] font-semibold font-mono"
                      >
                        {t.outcome ?? "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="py-16 text-center">
            <p className="text-text-tertiary text-sm">No closed trades yet.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
