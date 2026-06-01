interface Props {
  ticker: string;
  reason: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  onDismiss?: () => void;
}

export function AlertBanner({ ticker, reason, urgency, onDismiss }: Props) {
  const config = {
    HIGH: {
      bg: "bg-accent-red/10",
      border: "border-accent-red/40",
      text: "text-accent-red",
      icon: "⚡",
      label: "EXIT NOW",
      pulse: true,
    },
    MEDIUM: {
      bg: "bg-accent-amber/10",
      border: "border-accent-amber/40",
      text: "text-accent-amber",
      icon: "⚠",
      label: "WATCH CLOSELY",
      pulse: false,
    },
    LOW: {
      bg: "bg-accent-green/10",
      border: "border-accent-green/30",
      text: "text-accent-green",
      icon: "✓",
      label: "ON TRACK",
      pulse: false,
    },
  }[urgency];

  return (
    <div
      className={`relative flex items-start gap-3 px-4 py-3 rounded-xl border ${config.bg} ${config.border} ${config.pulse ? "animate-pulse" : ""}`}
    >
      <span className={`text-lg leading-none mt-0.5 ${config.text}`}>{config.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`font-mono text-sm font-semibold ${config.text}`}>{ticker}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${config.bg} ${config.border} ${config.text}`}>
            {config.label}
          </span>
        </div>
        <p className="text-text-secondary text-xs leading-relaxed">{reason}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-text-tertiary hover:text-text-secondary text-sm leading-none ml-1"
        >
          ×
        </button>
      )}
    </div>
  );
}
