/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        signal: {
          "buy-bg":     "hsl(var(--signal-buy-bg))",
          "buy-border": "hsl(var(--signal-buy-border))",
          "buy-fg":     "hsl(var(--signal-buy-fg))",
          "sell-bg":     "hsl(var(--signal-sell-bg))",
          "sell-border": "hsl(var(--signal-sell-border))",
          "sell-fg":     "hsl(var(--signal-sell-fg))",
          "hold-bg":     "hsl(var(--signal-hold-bg))",
          "hold-border": "hsl(var(--signal-hold-border))",
          "hold-fg":     "hsl(var(--signal-hold-fg))",
        },
        price: {
          target: "hsl(var(--price-target))",
          stop:   "hsl(var(--price-stop))",
        },
        conf: {
          track: "hsl(var(--conf-track))",
          fill:  "hsl(var(--conf-fill))",
        },
        status: {
          open:   "hsl(var(--status-open))",
          after:  "hsl(var(--status-after))",
          closed: "hsl(var(--status-closed))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular"],
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
