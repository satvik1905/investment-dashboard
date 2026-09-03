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
      bg: "bg-destructive/10",
      border: "border-destructive/40",
      text: "text-destructive",
      icon: "⚡",
      label: "EXIT NOW",
      pulse: true,
    },
    MEDIUM: {
      bg: "bg-status-after/10",
      border: "border-status-after/40",
      text: "text-status-after",
      icon: "⚠",
      label: "WATCH CLOSELY",
      pulse: false,
    },
    LOW: {
      bg: "bg-primary/10",
      border: "border-primary/30",
      text: "text-primary",
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
        <p className="text-muted-foreground text-xs leading-relaxed">{reason}</p>
      </AlertDescription>
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-muted-foreground"
        >
          ×
        </Button>
      )}
    </Alert>
  );
}
