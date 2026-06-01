/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Backgrounds — map old names to new values
        "bg-primary":   "#080B12",
        "bg-secondary": "#111827",
        "bg-tertiary":  "#161E2E",

        // Signals
        "accent-blue":   "#3B82F6",
        "accent-green":  "#10B981",
        "accent-red":    "#F43F5E",
        "accent-amber":  "#F59E0B",
        "accent-purple": "#8B5CF6",

        // Text
        "text-primary":   "#F8FAFC",
        "text-secondary": "#94A3B8",
        "text-tertiary":  "#7C8AA0",
        "text-disabled":  "#475569",
      },
      fontFamily: {
        display: ['"Syne"', "sans-serif"],
        mono:    ['"DM Mono"', '"JetBrains Mono"', "monospace"],
        sans:    ['"DM Sans"', "sans-serif"],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.2)",
        "card-hover": "0 4px 24px rgba(0,0,0,0.5)",
        glow: "0 0 20px rgba(16,185,129,0.15)",
      },
      animation: {
        "fade-in":    "fadeIn 0.3s ease forwards",
        "slide-up":   "slideUp 0.35s ease forwards",
        "pulse-slow": "pulse 3s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
