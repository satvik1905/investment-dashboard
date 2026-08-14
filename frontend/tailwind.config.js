/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Backgrounds — light theme
        "bg-primary":   "#F5F5F5",
        "bg-secondary": "#FFFFFF",
        "bg-tertiary":  "#F0F1F3",

        // Signals
        "accent-blue":   "#2563EB",
        "accent-green":  "#16A34A",
        "accent-red":    "#DC2626",
        "accent-amber":  "#D97706",
        "accent-purple": "#7C3AED",

        // Text
        "text-primary":   "#1A1A2E",
        "text-secondary": "#475569",
        "text-tertiary":  "#64748B",
        "text-disabled":  "#94A3B8",
        "text-muted":     "#64748B",
      },
      fontFamily: {
        display: ['"Roboto"', "sans-serif"],
        mono:    ['"Roboto Mono"', "monospace"],
        sans:    ['"Roboto"', "sans-serif"],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 16px rgba(0,0,0,0.08)",
        glow: "0 0 20px rgba(22,163,74,0.1)",
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
