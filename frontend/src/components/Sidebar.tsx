import { useAppStore } from "../store/appStore";
import { useLiveQuotes } from "../hooks/useLivePrice";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    ),
  },
  {
    id: "news",
    label: "News",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="2" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M4 5.5h8M4 8h8M4 10.5h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: "watchlist",
    label: "Watchlist",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5l1.6 4.9H15l-4.1 3 1.6 4.9L8 11.3l-4.5 3.1 1.6-4.9L1 6.4h5.4L8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "scanner",
    label: "Scanner",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: "journal",
    label: "Journal",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
] as const;

function MarketStatus() {
  const { marketStatus } = useLiveQuotes(["SPY"]);
  const dotClass =
    marketStatus === "OPEN"
      ? "bg-accent-green animate-pulse"
      : marketStatus === "PRE_MARKET" || marketStatus === "AFTER_HOURS"
      ? "bg-accent-amber animate-pulse"
      : "bg-accent-red";
  const label =
    marketStatus === "OPEN"        ? "Market Open"
    : marketStatus === "PRE_MARKET"  ? "Pre-Market"
    : marketStatus === "AFTER_HOURS" ? "After Hours"
    : marketStatus === "CLOSED"      ? "Market Closed"
    : "Loading…";

  return (
    <div className="px-5 py-4 border-t border-[rgba(255,255,255,0.05)]">
      <div className="hidden md:flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-text-tertiary text-[10px] tracking-widest uppercase font-mono">{label}</span>
      </div>
      {/* Mobile: dot only */}
      <div className={`md:hidden w-1.5 h-1.5 rounded-full mx-auto ${dotClass}`} />
    </div>
  );
}

export function Sidebar() {
  const { activeTab, setActiveTab } = useAppStore();

  return (
    <aside
      className="w-14 md:w-[220px] bg-bg-secondary border-r border-[rgba(255,255,255,0.05)] flex flex-col h-screen sticky top-0 shrink-0"
    >
      {/* Logo */}
      <div className="px-4 md:px-5 py-5 border-b border-[rgba(255,255,255,0.05)]">
        <div className="flex items-center gap-3">
          {/* Diamond logo mark */}
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path
                d="M11 1L21 11L11 21L1 11L11 1Z"
                fill="rgba(16,185,129,0.15)"
                stroke="#10B981"
                strokeWidth="1.5"
              />
              <path d="M11 5L17 11L11 17L5 11L11 5Z" fill="#10B981" opacity="0.5"/>
            </svg>
          </div>
          <div className="hidden md:block">
            <div className="font-display font-bold text-text-primary text-base tracking-tight leading-none">
              SwingIQ
            </div>
            <div className="text-[10px] text-text-tertiary tracking-widest uppercase font-mono mt-0.5">
              Trading Terminal
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 md:px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => setActiveTab(item.id)}
              className={`
                relative w-full flex items-center gap-3 px-3 py-2.5 h-auto rounded-lg justify-start
                ${active
                  ? "text-text-primary bg-[rgba(255,255,255,0.06)]"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-[rgba(255,255,255,0.04)]"
                }
              `}
            >
              {/* Active left bar */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent-green rounded-r-full" />
              )}
              <span className={`shrink-0 ${active ? "text-accent-green" : ""}`}>
                {item.icon}
              </span>
              <span className="hidden md:block text-sm font-medium font-sans">
                {item.label}
              </span>
            </Button>
          );
        })}
      </nav>

      <MarketStatus />
    </aside>
  );
}
