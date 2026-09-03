import { useState } from "react";
import { toast } from "sonner";
import { useSignals } from "../hooks/useSignals";
import { usePositionAlerts } from "../hooks/usePositions";
import { useLiveQuotes } from "../hooks/useLivePrice";
import type { LiveQuote } from "../hooks/useLivePrice";
import { SignalsTable } from "../components/SignalsTable";
import { StockDetailModal } from "../components/StockDetailModal";
import { useRemoveSignal, useGenerateSignal } from "../hooks/useSignals";
import { TickerAutocomplete } from "../components/TickerAutocomplete";
import { AlertBanner } from "../components/AlertBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ── Market status dot ─────────────────────────────────────────────────────────

function MarketStatusDot({ status }: { status: LiveQuote["market_status"] | null }) {
  if (!status) return null;
  const cfg: Record<string, { cls: string; label: string }> = {
    OPEN:        { cls: "bg-status-open",   label: "Market Open" },
    PRE_MARKET:  { cls: "bg-status-after",  label: "Pre-Market" },
    AFTER_HOURS: { cls: "bg-status-after",  label: "After Hours" },
    CLOSED:      { cls: "bg-status-closed", label: "Closed" },
  };
  const c = cfg[status] ?? cfg.CLOSED;
  return (
    <div className="flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.cls} ${status === "OPEN" ? "animate-pulse" : ""}`} />
      <span className="text-muted-foreground text-xs font-mono">{c.label}</span>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center rounded-lg border border-border bg-card">
      <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center mb-3">
        <span className="text-muted-foreground text-lg">◎</span>
      </div>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-widest font-mono">
        {title}
      </h2>
      {count !== undefined && (
        <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
          {count}
        </Badge>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { data: signals, isLoading: signalsLoading } = useSignals();
  const { data: alerts } = usePositionAlerts();
  const activeAlerts = alerts?.filter((a) => a.urgency !== "LOW") ?? [];
  const tickers = signals?.map((s) => s.ticker) ?? [];
  const { quotes, marketStatus } = useLiveQuotes(tickers);

  const [detailTicker, setDetailTicker] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [tickerInput, setTickerInput] = useState("");

  const removeSignal = useRemoveSignal({
    onSuccess: (ticker) => toast.success(`${ticker} removed`),
    onError:   (ticker) => toast.error(`Failed to remove ${ticker}`),
  });

  const addSignal = useGenerateSignal({
    onSettled: () => setTickerInput(""),
  });

  const handleAdd = () => {
    const t = tickerInput.trim().toUpperCase();
    if (!t) return;
    addSignal.mutate(t, {
      onSuccess: (sig) => {
        toast.success(`${sig.ticker} added — ${sig.signal}`);
        setAddModalOpen(false);
      },
      onError: (err: unknown) => {
        const detail = (err as { response?: { data?: { detail?: { message?: string; warnings?: string[] } | string } } })?.response?.data?.detail;
        let msg: string;
        if (detail && typeof detail === "object") {
          msg = detail.warnings?.[0] ?? detail.message ?? `Could not add ${t}`;
        } else {
          msg = typeof detail === "string" ? detail : `Could not add ${t}`;
        }
        toast.error(msg);
      },
    });
  };

  const closeModal = () => { setAddModalOpen(false); setTickerInput(""); };

  return (
    <>
      {detailTicker && (
        <StockDetailModal
          ticker={detailTicker}
          onClose={() => setDetailTicker(null)}
        />
      )}

      {/* Add Stock Modal */}
      <Dialog open={addModalOpen} onOpenChange={(open) => { if (!open) closeModal(); else setAddModalOpen(true); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Add Stock</DialogTitle>
            <DialogDescription>
              Search for a stock ticker to add to your watchlist.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <TickerAutocomplete
              value={tickerInput}
              onChange={setTickerInput}
              onSelect={(symbol) => setTickerInput(symbol)}
              onSubmit={handleAdd}
              disabled={addSignal.isPending}
              placeholder="Search ticker"
            />
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" className="rounded-full" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              className="rounded-full"
              onClick={handleAdd}
              disabled={!tickerInput.trim() || addSignal.isPending}
            >
              {addSignal.isPending ? (
                <span className="inline-block w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin align-middle" />
              ) : (
                "Add"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="p-6 max-w-screen-xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-sans text-2xl font-bold text-foreground tracking-tight">
              Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Watchlist signals
            </p>
          </div>

          <div className="flex items-center gap-4">
            <MarketStatusDot status={marketStatus} />
            <Button className="rounded-full" onClick={() => setAddModalOpen(true)}>
              <span className="text-lg leading-none font-light mr-1">+</span>
              Add Stock
            </Button>
          </div>
        </div>

        {/* Position alerts */}
        {activeAlerts.length > 0 && (
          <div className="space-y-2">
            {activeAlerts.map((alert) => (
              <AlertBanner
                key={alert.position_id}
                ticker={alert.ticker}
                reason={alert.reason}
                urgency={alert.urgency}
              />
            ))}
          </div>
        )}

        {/* Signals */}
        <section>
          <SectionHeader title="Signals" count={signals?.length} />
          {signalsLoading ? (
            <div className="h-64 rounded-lg bg-muted animate-pulse" />
          ) : signals?.length ? (
            <SignalsTable
              signals={signals}
              quotes={quotes}
              onRowClick={(signal) => setDetailTicker(signal.ticker)}
              onRemove={(ticker) => removeSignal.mutate(ticker)}
            />
          ) : (
            <EmptyState message="No signals yet. Click 'Add Stock' to get started." />
          )}
        </section>
      </div>
    </>
  );
}
