import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <Alert
      className={cn(
        "relative flex items-start gap-3 rounded-xl",
        config.bg,
        config.border,
        config.pulse && "animate-pulse",
      )}
    >
      <span className={cn("text-lg leading-none mt-0.5", config.text)}>{config.icon}</span>
      <AlertDescription className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn("font-mono text-sm font-semibold", config.text)}>{ticker}</span>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider",
              config.bg,
              config.border,
              config.text,
            )}
          >
            {config.label}
          </Badge>
        </div>
        <p className="text-text-secondary text-xs leading-relaxed">{reason}</p>
      </AlertDescription>
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDismiss}
          className="text-text-tertiary hover:text-text-secondary"
        >
          ×
        </Button>
      )}
    </Alert>
  );
}
