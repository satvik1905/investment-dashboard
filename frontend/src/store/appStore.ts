import { create } from "zustand";

interface AppState {
  selectedTicker: string | null;
  setSelectedTicker: (ticker: string | null) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  activeTab: "dashboard" | "watchlist" | "news" | "scanner";
  setActiveTab: (tab: "dashboard" | "watchlist" | "news" | "scanner") => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedTicker: null,
  setSelectedTicker: (ticker) => set({ selectedTicker: ticker }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  activeTab: "dashboard",
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
