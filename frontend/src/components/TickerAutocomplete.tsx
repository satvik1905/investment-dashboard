import { useState, useRef, useEffect, useCallback } from "react";
import api from "../api/client";

interface Suggestion {
  symbol: string;
  name: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (symbol: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function TickerAutocomplete({ value, onChange, onSelect, onSubmit, disabled, placeholder }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (!query) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get<Suggestion[]>("/api/stocks/search", { params: { q: query } });
      setSuggestions(data);
      setOpen(data.length > 0);
      setActiveIndex(0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    onChange(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 200);
  };

  const handleSelect = useCallback((symbol: string) => {
    onSelect(symbol);
    setOpen(false);
    setSuggestions([]);
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter" && value) onSubmit();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(suggestions[activeIndex].symbol);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        type="text"
        placeholder={placeholder ?? "Enter ticker (e.g. AAPL)"}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        disabled={disabled}
        autoComplete="off"
        className="w-full bg-bg-secondary text-text-primary font-mono text-sm px-4 py-2.5 rounded-xl border border-white/[0.08] focus:outline-none focus:border-accent-blue/50 placeholder:text-text-tertiary disabled:opacity-50"
      />

      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-3.5 h-3.5 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
        </div>
      )}

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 top-full mt-1 w-full bg-bg-secondary border border-white/[0.10] rounded-xl overflow-hidden shadow-2xl">
          {suggestions.map((t, i) => (
            <li
              key={t.symbol}
              onMouseDown={() => handleSelect(t.symbol)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                i === activeIndex ? "bg-accent-blue/15" : "hover:bg-bg-tertiary"
              }`}
            >
              <span className="font-mono text-sm font-semibold text-text-primary w-20 shrink-0">
                {t.symbol}
              </span>
              <span className="text-text-secondary text-xs truncate">{t.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
