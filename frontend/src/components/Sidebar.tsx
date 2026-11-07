import { useAppStore } from "../store/appStore";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "../hooks/useAuth";
import { supabaseEnabled } from "../lib/supabase";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

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

const SIGN_OUT_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 14.5H3.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M10.5 11.5L14 8l-3.5-3.5M14 8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/** Display name from Supabase metadata, falling back to the email's local part. */
function displayName(user: User | null): string {
  const meta = user?.user_metadata ?? {};
  const name = (meta.full_name || meta.name || "").trim();
  if (name) return name;
  return user?.email?.split("@")[0] ?? "Account";
}

function initials(name: string): string {
  const words = name.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={`${size === "lg" ? "w-9 h-9 text-sm" : "w-8 h-8 text-xs"} shrink-0 rounded-full bg-signal-buy-bg text-primary border border-primary/20 flex items-center justify-center font-semibold font-sans`}
    >
      {initials(name)}
    </span>
  );
}

/** Avatar + name that opens a small account menu (identity and log out). */
function AccountMenu({ collapsed = false, compact = false }: { collapsed?: boolean; compact?: boolean }) {
  const { user, signOut } = useAuth();
  const name = displayName(user);

  let trigger;
  if (compact) {
    // Phone tab bar: avatar stacked over a label, like the other tabs
    trigger = (
      <button
        type="button"
        className="flex flex-col items-center justify-center gap-1 h-14 w-full text-[11px] font-medium cursor-pointer transition-colors text-muted-foreground active:text-foreground"
      >
        <span className="w-5 h-5 rounded-full bg-signal-buy-bg text-primary border border-primary/20 flex items-center justify-center text-[9px] font-semibold">
          {initials(name)}
        </span>
        Account
      </button>
    );
  } else {
    trigger = (
      <Button
        variant="ghost"
        aria-label={`Account: ${name}`}
        className={`w-full flex items-center gap-3 h-auto rounded-lg hover:bg-accent ${collapsed ? "justify-center px-0 py-2" : "justify-start px-2 py-2"}`}
      >
        <Avatar name={name} />
        {!collapsed && (
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-medium text-foreground truncate">{name}</span>
            {user?.email && (
              <span className="block text-xs text-muted-foreground truncate">{user.email}</span>
            )}
          </span>
        )}
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={compact ? "top" : collapsed ? "right" : "top"}
        align={compact ? "end" : "start"}
        sideOffset={8}
        className="w-60 p-1.5"
      >
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate">{name}</div>
            {user?.email && (
              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
            )}
          </div>
        </div>
        <div className="my-1 h-px bg-border" />
        <Button
          variant="ghost"
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-2 py-2 h-auto rounded-md justify-start text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <span className="shrink-0">{SIGN_OUT_ICON}</span>
          Log out
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function Sidebar() {
  const { activeTab, setActiveTab, sidebarOpen, setSidebarOpen } = useAppStore();
  const collapsed = !sidebarOpen;

  return (
    <aside
      className={`${collapsed ? "w-14" : "w-[220px]"} hidden md:flex bg-card border-r border-border flex-col h-screen sticky top-0 shrink-0 transition-[width] duration-200`}
    >
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path
                d="M11 1L21 11L11 21L1 11L11 1Z"
                fill="hsl(138 76% 97%)"
                stroke="var(--primary)"
                strokeWidth="1.5"
              />
              <path d="M11 5L17 11L11 17L5 11L11 5Z" fill="var(--primary)" opacity="0.5"/>
            </svg>
          </div>
          {!collapsed && (
            <div>
              <div className="font-sans font-bold text-foreground text-base tracking-tight leading-none">
                SwingIQ
              </div>
              <div className="text-[11px] text-muted-foreground tracking-widest uppercase font-mono mt-0.5">
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

      {/* Account */}
      {supabaseEnabled && (
        <div className="px-2 pt-2 pb-3 border-t border-border">
          <AccountMenu collapsed={collapsed} />
        </div>
      )}

      </TooltipProvider>
    </aside>
  );
}

/** Phone navigation: the same three destinations as the sidebar, plus the account menu, within thumb reach. */
export function BottomNav() {
  const { activeTab, setActiveTab } = useAppStore();

  return (
    <nav
      aria-label="Main"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-card/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      <div className={`grid ${supabaseEnabled ? "grid-cols-4" : "grid-cols-3"}`}>
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 h-14 text-[11px] font-medium cursor-pointer transition-colors ${
                active ? "text-primary" : "text-muted-foreground active:text-foreground"
              }`}
            >
              <span className="[&_svg]:w-5 [&_svg]:h-5">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
        {supabaseEnabled && <AccountMenu compact />}
      </div>
    </nav>
  );
}
