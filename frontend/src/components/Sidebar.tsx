import { useAppStore } from "../store/appStore";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

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
] as const;

export function Sidebar() {
  const { activeTab, setActiveTab, sidebarOpen, setSidebarOpen } = useAppStore();
  const collapsed = !sidebarOpen;

  return (
    <aside
      className={`${collapsed ? "w-14" : "w-[220px]"} bg-card border-r border-border flex flex-col h-screen sticky top-0 shrink-0 transition-[width] duration-200`}
    >
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path
                d="M11 1L21 11L11 21L1 11L11 1Z"
                fill="hsl(138 76% 97%)"
                stroke="hsl(var(--primary))"
                strokeWidth="1.5"
              />
              <path d="M11 5L17 11L11 17L5 11L11 5Z" fill="hsl(var(--primary))" opacity="0.5"/>
            </svg>
          </div>
          {!collapsed && (
            <div>
              <div className="font-sans font-bold text-foreground text-base tracking-tight leading-none">
                SwingIQ
              </div>
              <div className="text-[10px] text-muted-foreground tracking-widest uppercase font-mono mt-0.5">
                Trading Terminal
              </div>
            </div>
          )}
        </div>
      </div>

      <TooltipProvider delayDuration={0}>
      {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            const button = (
              <Button
                variant="ghost"
                onClick={() => setActiveTab(item.id)}
                className={`
                  relative w-full flex items-center gap-3 px-3 py-2.5 h-auto rounded-lg
                  ${collapsed ? "justify-center" : "justify-start"}
                  ${active
                    ? "text-foreground bg-signal-buy-bg"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }
                `}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
                )}
                <span className={`shrink-0 ${active ? "text-primary" : ""}`}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="text-sm font-medium font-sans">
                    {item.label}
                  </span>
                )}
              </Button>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return <div key={item.id}>{button}</div>;
          })}
        </nav>

      {/* Collapse toggle */}
      <div className="px-2 pb-1">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={() => setSidebarOpen(true)}
                className="w-full flex items-center justify-center px-3 py-2.5 h-auto rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 rotate-180">
                  <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M6 1.5V14.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M10 6L8 8L10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>Expand</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="ghost"
            onClick={() => setSidebarOpen(false)}
            className="w-full flex items-center gap-3 px-3 py-2.5 h-auto rounded-lg justify-start text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M6 1.5V14.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M10 6L8 8L10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-sm font-medium font-sans">Collapse</span>
          </Button>
        )}
      </div>

      </TooltipProvider>
    </aside>
  );
}
