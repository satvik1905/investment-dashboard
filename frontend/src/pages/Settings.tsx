function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[rgba(255,255,255,0.04)] last:border-0">
      <span className="text-text-secondary text-sm">{label}</span>
      <span className={`text-sm ${mono ? "font-mono text-text-primary" : "text-text-tertiary"}`}>
        {value}
      </span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-secondary rounded-xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
      <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.05)]">
        <span className="text-text-secondary text-xs font-semibold uppercase tracking-widest font-mono">
          {title}
        </span>
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  );
}

import React from "react";

export function Settings() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-text-primary tracking-tight">Settings</h1>
        <p className="text-text-tertiary text-sm mt-0.5">Configuration and preferences</p>
      </div>

      <div className="space-y-4">
        <Card title="Data Sources">
          <Row label="Primary market data"  value="yfinance (free)" />
          <Row label="Backup market data"   value="Alpha Vantage" />
          <Row label="Alpha Vantage key"    value="Set in backend/.env" mono={false} />
          <Row label="Env variable"         value="ALPHA_VANTAGE_API_KEY" />
        </Card>

        <Card title="Scanner Schedule">
          <Row label="Automatic scan"    value="Friday 4:15 PM ET" />
          <Row label="Signal generation" value="Pure math — instant" />
          <Row label="Method"            value="Danny Cheng EMA 13/34" />
          <Row label="Universe"          value="S&P 500 + NASDAQ 100" />
        </Card>

        <Card title="Signal Logic">
          <Row label="Weekly Red candle"    value="EMA 13 crossed above EMA 34" />
          <Row label="Weekly Yellow candle" value="EMA 13 crossed below EMA 34" />
          <Row label="Monthly timeframe"    value="Same crossover on 1mo bars" />
          <Row label="Stop placement"       value="Pivot ± 0.5× ATR" />
          <Row label="Target"               value="Nearest resistance / support" />
        </Card>

        <Card title="Local Dev">
          <Row label="Frontend" value=":5173" />
          <Row label="Backend"  value=":8000" />
          <Row label="API docs" value="localhost:8000/docs" />
          <Row label="Redis"    value=":6379" />
        </Card>
      </div>
    </div>
  );
}
