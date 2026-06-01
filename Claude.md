# SwingIQ — AI-Powered Swing Trading Intelligence Platform

## CLAUDE.md — Full Project Context for AI Assistant

---

## 🧠 What This Project Is

SwingIQ is a personal, full-stack web application that acts as an autonomous AI-powered swing trading assistant. It uses **Claude Opus 4.6** (via the Anthropic API) to autonomously research the stock market every morning, find the best swing trade candidates, generate BUY/SELL/HOLD signals, and monitor open positions for exit signals.

This is built for **one user only (no auth system)**. The goal is to make $10+/month on $500 capital through informed swing trading decisions.

---

## 👤 User & Goals

- **Solo user** — no authentication, no multi-user support
- **Capital**: $500 starting capital
- **Target**: 2% monthly return (~$10/month)
- **Trading style**: Swing trading (hold positions 2-14 days)
- **Key need**: Wake up every morning, open the app, see AI-researched trade picks + status of open positions

---

## 🏗️ Full Tech Stack

### Frontend

- **React 18 + TypeScript** — UI framework
- **Vite** — build tool
- **TailwindCSS** — styling
- **TradingView Lightweight Charts** — candlestick charts (free, open source)
- **Recharts** — performance charts, P&L visualization
- **React Query (TanStack)** — data fetching and caching
- **Zustand** — global state management
- **Axios** — HTTP client

### Backend

- **FastAPI (Python 3.11)** — REST API
- **Celery** — background task queue (daily research scheduler)
- **Redis** — Celery broker + API response cache
- **PostgreSQL 15** — persistent database
- **SQLAlchemy 2.0** — ORM
- **Alembic** — database migrations
- **pandas-ta** — technical indicator computation
- **yfinance** — free market data (primary source)
- **Alpha Vantage** — backup market data source

### AI

- **Anthropic Claude Sonnet 4.6** (`claude-sonnet-4-6`) — autonomous research + signal reasoning
- **Model**: `claude-sonnet-4-6`
- **Thinking mode**: off (not used)
- **Web search tool**: enabled on research phase only; disabled on signal generation, position monitoring, and recalculation
- **Pricing**: $3/million input tokens, $15/million output tokens
- **Expected cost**: ~$3-6/month for 1 research session/day

### Deployment

- **Frontend**: Vercel (free tier)
- **Backend + DB + Redis**: Railway (~$5/month) OR Render (free tier with cold starts)
- **Local dev**: Run everything directly on Mac, no Docker

---

## 📁 Project Structure

```
swingiq/
├── frontend/                          # React + TypeScript app
│   ├── src/
│   │   ├── components/
│   │   │   ├── SignalCard.tsx          # BUY/SELL/HOLD signal display
│   │   │   ├── CandlestickChart.tsx   # TradingView chart component
│   │   │   ├── PositionCard.tsx       # Open position with P&L
│   │   │   ├── ConfidenceMeter.tsx    # Radial confidence gauge
│   │   │   ├── VolumeChart.tsx        # Volume histogram
│   │   │   └── AlertBanner.tsx        # Exit signal alert
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx          # Main page — signals + positions
│   │   │   ├── Research.tsx           # Today's AI research results
│   │   │   ├── Journal.tsx            # Trade journal + analytics
│   │   │   └── Settings.tsx           # API keys, preferences
│   │   ├── hooks/
│   │   │   ├── useSignals.ts          # Fetch today's signals
│   │   │   ├── usePositions.ts        # Fetch open positions
│   │   │   └── useJournal.ts          # Fetch trade history
│   │   ├── store/
│   │   │   └── appStore.ts            # Zustand global state
│   │   ├── api/
│   │   │   └── client.ts              # Axios instance
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── backend/                           # FastAPI Python app
│   ├── app/
│   │   ├── main.py                    # FastAPI app entry point
│   │   ├── database.py                # SQLAlchemy setup
│   │   ├── models.py                  # Database models
│   │   ├── schemas.py                 # Pydantic schemas
│   │   ├── routers/
│   │   │   ├── signals.py             # Signal endpoints
│   │   │   ├── stocks.py              # Stock data endpoints
│   │   │   ├── journal.py             # Trade journal endpoints
│   │   │   └── dashboard.py           # Dashboard summary endpoint
│   │   ├── services/
│   │   │   ├── market_data.py         # yfinance + Alpha Vantage
│   │   │   ├── indicators.py          # Technical indicator computation
│   │   │   ├── claude_service.py      # Opus 4.6 API integration
│   │   │   └── position_monitor.py    # Open position exit checker
│   │   └── tasks/
│   │       ├── celery_app.py          # Celery configuration
│   │       └── daily_research.py      # Morning research job (6:30 AM)
│   ├── alembic/                       # Database migrations
│   ├── requirements.txt
│   └── .env                           # Environment variables (never commit)
│
├── CLAUDE.md                          # This file
└── README.md
```

---

## 🗄️ Database Schema

### signals

```sql
id              SERIAL PRIMARY KEY
ticker          VARCHAR(10)
signal          VARCHAR(20)        -- STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL
confidence      INTEGER            -- 0-100
price_direction_3d  VARCHAR(10)    -- UP, DOWN, NEUTRAL
price_direction_7d  VARCHAR(10)
price_direction_14d VARCHAR(10)
entry_zone_low  DECIMAL(10,2)
entry_zone_high DECIMAL(10,2)
target_price    DECIMAL(10,2)
stop_loss       DECIMAL(10,2)
key_reason      TEXT
risk_factors    JSONB              -- array of strings
summary         TEXT               -- plain English explanation
raw_indicators  JSONB              -- all indicator values
generated_at    TIMESTAMP
```

### positions (open trades)

```sql
id              SERIAL PRIMARY KEY
ticker          VARCHAR(10)
entry_price     DECIMAL(10,2)
entry_date      DATE
quantity        INTEGER
stop_loss       DECIMAL(10,2)
target_price    DECIMAL(10,2)
notes           TEXT
status          VARCHAR(10)        -- OPEN, CLOSED
exit_price      DECIMAL(10,2)
exit_date       DATE
exit_reason     TEXT               -- AI recommendation or manual
created_at      TIMESTAMP
```

### journal

```sql
id              SERIAL PRIMARY KEY
ticker          VARCHAR(10)
direction       VARCHAR(10)        -- LONG, SHORT
entry_price     DECIMAL(10,2)
exit_price      DECIMAL(10,2)
quantity        INTEGER
entry_date      DATE
exit_date       DATE
pnl             DECIMAL(10,2)
pnl_percent     DECIMAL(6,2)
hold_days       INTEGER
outcome         VARCHAR(10)        -- WIN, LOSS, BREAKEVEN
notes           TEXT
signal_id       INTEGER            -- reference to original signal
created_at      TIMESTAMP
```

### research_sessions

```sql
id              SERIAL PRIMARY KEY
session_date    DATE
candidates_found    INTEGER
top_picks       JSONB              -- array of tickers Claude picked
market_summary  TEXT               -- Claude's market overview
raw_response    TEXT               -- full Claude response
created_at      TIMESTAMP
```

---

## 🤖 Claude Opus 4.6 Integration

### Model String

```python
model = "claude-sonnet-4-6"
```

### How the Daily Research Works

Every morning at 6:30 AM (via Celery Beat), the system:

1. Calls Opus 4.6 with web search enabled
2. Opus searches for: most active stocks, volume movers, earnings catalysts, sector momentum
3. Opus picks 10-15 candidates from its research
4. System pulls OHLCV data for each candidate via yfinance
5. System computes all technical indicators for each candidate
6. System sends all indicator data back to Opus for signal generation
7. Opus reasons about each stock and outputs structured signals
8. Signals are stored in PostgreSQL
9. Open positions are checked — Opus decides HOLD or EXIT for each

### System Prompt (Investment Guru Personality)

```
You are SwingIQ, an expert swing trading analyst and personal investment guru
with 20 years of experience. You are direct, opinionated, and confident.
You never say "it could go either way" — you always take a clear stance.

Your job:
1. Research the market autonomously using web search
2. Find the highest-probability swing trade setups
3. Give clear BUY/SELL/HOLD recommendations with specific entry, target, and stop-loss levels
4. Monitor open positions and tell the user exactly when to exit

You prioritize:
- Capital preservation above all else
- High-probability setups with clear risk/reward (minimum 2:1)
- Liquid stocks (avg volume > 1M shares/day)
- Strong technical setups confirmed by multiple indicators
- Clear catalysts or momentum

You always provide:
- A clear signal: STRONG_BUY / BUY / HOLD / SELL / STRONG_SELL
- Confidence score (0-100)
- Entry zone (price range to buy)
- Target price (where to take profit)
- Stop loss (where to cut losses)
- Key reason (the single most important factor)
- Risk factors (what could go wrong)
- Plain English summary (max 3 sentences, speak like a trusted advisor)
```

### API Call Pattern

```python
import anthropic

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=2000,
    tools=[{"type": "web_search_20250305", "name": "web_search"}],
    system=SYSTEM_PROMPT,
    messages=[{"role": "user", "content": user_prompt}]
)
```

---

## 📊 Technical Indicators Computed

All computed using `pandas-ta` on 6 months of daily OHLCV data:

| Indicator          | Parameters       | Signal Logic                              |
| ------------------ | ---------------- | ----------------------------------------- |
| RSI                | Period: 14       | <30 oversold (BUY), >70 overbought (SELL) |
| MACD               | 12/26/9          | Bullish crossover = BUY signal            |
| SMA                | 20, 50, 200 day  | Price above all = strong uptrend          |
| EMA                | 12, 26 day       | EMA crossover confirms momentum           |
| Bollinger Bands    | 20 period, 2 std | Price at lower band = potential BUY       |
| Volume             | 20-day avg       | Spike >2x avg on up-day = strong BUY      |
| ATR                | Period: 14       | Used for stop-loss placement              |
| Stochastic         | %K:14, %D:3      | Confirms RSI signals                      |
| OBV                | Cumulative       | Rising OBV confirms uptrend               |
| Support/Resistance | 20-day pivots    | Key entry/exit levels                     |

---

## 🌐 API Endpoints

### Signals

- `GET /api/signals/latest` — Today's generated signals
- `GET /api/signals/{ticker}/history` — Signal history for a ticker
- `POST /api/signals/generate` — Manually trigger signal for one ticker

### Research

- `GET /api/research/latest` — Latest research session results
- `POST /api/research/trigger` — Manually trigger morning research

### Stocks

- `GET /api/stocks/{ticker}/quote` — Current price + basic data
- `GET /api/stocks/{ticker}/chart` — OHLCV data for charting (params: period, interval)

### Positions

- `GET /api/positions` — All open positions
- `POST /api/positions` — Log a new trade entry
- `PUT /api/positions/{id}/close` — Close a position
- `GET /api/positions/{id}/analysis` — Get Opus 4.6 analysis of specific position

### Journal

- `GET /api/journal` — All closed trades
- `GET /api/journal/analytics` — Win rate, P&L, performance stats

### Dashboard

- `GET /api/dashboard` — Summary: signals + positions + P&L + market sentiment

---

## 🔔 Position Monitoring & Exit Alerts

Every morning after research, Opus 4.6 reviews all open positions:

**Input to Opus:**

- Original entry price, date, target, stop-loss
- Current price and % P&L
- Latest indicator values
- Any relevant news from web search

**Output from Opus:**

- HOLD / EXIT recommendation
- If EXIT: reason (target hit, stop-loss, thesis change, better opportunity)
- If HOLD: updated target and what to watch

**Alert Display:**

- Green banner: position on track
- Yellow banner: watch closely
- Red banner: EXIT NOW with reason

---

## ⚙️ Environment Variables (.env)

```
ANTHROPIC_API_KEY=your_key_here
ALPHA_VANTAGE_API_KEY=your_key_here
DATABASE_URL=postgresql://localhost/swingiq
REDIS_URL=redis://localhost:6379
CELERY_BROKER_URL=redis://localhost:6379/0
FRONTEND_URL=http://localhost:5173
```

---

## 🚀 Local Development Setup

### Start PostgreSQL

```bash
brew services start postgresql@15
createdb swingiq
```

### Start Redis

```bash
brew services start redis
```

### Start Backend

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Start Celery Worker

```bash
cd backend
source venv/bin/activate
celery -A app.tasks.celery_app worker --loglevel=info
```

### Start Celery Scheduler

```bash
cd backend
source venv/bin/activate
celery -A app.tasks.celery_app beat --loglevel=info
```

### Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:5173
Backend runs at: http://localhost:8000
API docs at: http://localhost:8000/docs

---

## 📦 Backend Dependencies (requirements.txt)

```
fastapi==0.110.0
uvicorn==0.27.0
sqlalchemy==2.0.27
alembic==1.13.1
psycopg2-binary==2.9.9
pydantic==2.6.1
pydantic-settings==2.1.0
anthropic==0.21.0
yfinance==0.2.36
pandas==2.2.0
pandas-ta==0.3.14b
numpy==1.26.4
celery==5.3.6
redis==5.0.1
httpx==0.26.0
python-dotenv==1.0.1
```

---

## 🎨 Frontend Design System

- **Color scheme**: Dark theme (trading app feel)
- **Primary color**: #1E3A5F (deep navy)
- **Accent**: #2E75B6 (bright blue)
- **BUY signal**: Green (#22C55E)
- **SELL signal**: Red (#EF4444)
- **HOLD signal**: Amber (#F59E0B)
- **Font**: Inter

### Key UI Components

- `SignalCard` — shows ticker, signal badge, confidence meter, entry/target/stop, AI summary
- `CandlestickChart` — TradingView chart with MA overlays and entry/target/stop lines
- `PositionCard` — open trade with live P&L, hold days, AI status (HOLD/EXIT)
- `AlertBanner` — red banner at top of dashboard when Opus recommends exiting a position
- `ResearchSummary` — Claude's market overview from the morning session

---

## 📋 Build Order (Follow This Sequence)

1. **Backend foundation**: `main.py`, `database.py`, `models.py`, `schemas.py`
2. **Market data service**: `services/market_data.py`
3. **Indicators service**: `services/indicators.py`
4. **Claude service**: `services/claude_service.py`
5. **Position monitor**: `services/position_monitor.py`
6. **API routers**: `routers/signals.py`, `routers/stocks.py`, `routers/positions.py`, `routers/journal.py`, `routers/dashboard.py`
7. **Celery tasks**: `tasks/celery_app.py`, `tasks/daily_research.py`
8. **Database migrations**: Alembic setup and initial migration
9. **Frontend setup**: Vite + React + TypeScript + TailwindCSS
10. **Frontend pages**: Dashboard → Research → Journal → Settings
11. **Frontend components**: SignalCard → CandlestickChart → PositionCard → AlertBanner
12. **Connect frontend to backend**: Axios client + React Query hooks
13. **Testing**: End-to-end signal generation test
14. **Deployment**: Vercel (frontend) + Railway (backend)

---

## ⚠️ Important Rules for AI Assistant

1. **Always use `claude-sonnet-4-6`** as the model string
2. **Always use `thinking: {"type": "adaptive"}`** for research calls
3. **Always include web_search tool** on research and position monitoring calls
4. **Never add authentication** — this is a single-user personal app
5. **Never use Docker** — run everything directly on Mac with Homebrew
6. **Always use `python3.11`** — not python3.9 which is the Mac default
7. **Always activate venv** before running any Python commands
8. **Frontend port**: 5173 (Vite default)
9. **Backend port**: 8000 (uvicorn default)
10. **Use TailwindCSS utility classes only** — no custom CSS files
11. **All API calls go through `/api/` prefix**
12. **Store all sensitive keys in `.env`** — never hardcode them
13. **Use `pandas-ta` for indicators** — not TA-Lib (requires C compilation)
14. **yfinance is primary data source** — Alpha Vantage is fallback only

---

## 💰 Cost Summary

| Item                           | Cost              |
| ------------------------------ | ----------------- |
| Anthropic API (1 session/day)  | ~$10-15/month     |
| Railway hosting                | ~$5/month         |
| Vercel frontend                | Free              |
| yfinance market data           | Free              |
| TradingView Lightweight Charts | Free              |
| **Total**                      | **~$15-20/month** |

---

_Last updated: March 2026 | Version 1.0_

---

## 🎨 Frontend Design Guidelines (MUST FOLLOW)

This project uses a **production-grade frontend design approach**. When building any frontend component, page, or UI element, follow these rules strictly.

### Design Direction

SwingIQ is a **professional trading terminal** — the aesthetic should feel like a premium, dark-themed financial tool. Think Bloomberg Terminal meets modern fintech. The design must be:

- **Dark theme** — deep navy/charcoal backgrounds, never white
- **Data-dense but clean** — lots of information, zero clutter
- **High contrast** — sharp whites and bright accents on dark backgrounds
- **Professional and trustworthy** — this handles real money decisions

### Typography

- **Display font**: Use `DM Mono` or `JetBrains Mono` for numbers, prices, tickers — monospace fonts feel native to trading
- **Body font**: Use `DM Sans` or `Syne` for labels and UI text
- **Never use**: Inter, Roboto, Arial, or system fonts — too generic
- Import from Google Fonts

### Color Palette (CSS Variables)

```css
:root {
  --bg-primary: #0a0e1a; /* deep navy — main background */
  --bg-secondary: #0f1629; /* slightly lighter — cards */
  --bg-tertiary: #1a2035; /* hover states, borders */
  --accent-blue: #3b82f6; /* primary accent */
  --accent-green: #22c55e; /* BUY signals, profit */
  --accent-red: #ef4444; /* SELL signals, loss */
  --accent-amber: #f59e0b; /* HOLD signals, warnings */
  --accent-purple: #8b5cf6; /* AI/Claude indicators */
  --text-primary: #f1f5f9; /* main text */
  --text-secondary: #94a3b8; /* muted labels */
  --text-tertiary: #475569; /* disabled/hint text */
  --border: rgba(255, 255, 255, 0.08);
}
```

### Component Aesthetic Rules

- **Cards**: Dark background (`--bg-secondary`), subtle border, `border-radius: 12px`
- **Signal badges**: Pill shaped, color-coded — green for BUY, red for SELL, amber for HOLD
- **Numbers/prices**: Always monospace font, right-aligned
- **Positive P&L**: `--accent-green` with subtle green background tint
- **Negative P&L**: `--accent-red` with subtle red background tint
- **Confidence meter**: Animated radial arc, color shifts red → amber → green
- **Charts**: Dark background, colored candlesticks, subtle grid lines

### Motion & Animations

- Subtle fade-in on page load with staggered card reveals
- Smooth number transitions when P&L updates
- Pulse animation on EXIT alert banners
- Hover states on all interactive elements
- Loading skeleton states while data fetches

### Layout

- **Sidebar navigation**: Narrow left sidebar with icons + labels
- **Main content**: Clean grid layout, 2-3 columns on desktop
- **Signal cards**: 3 per row on desktop, 1 on mobile
- **Charts**: Full width, fixed height 400px
- Generous padding, clear visual hierarchy

### Memorable Design Details

- Ticker symbols in monospace with subtle glow on hover
- Signal strength shown as animated bar
- AI-generated content marked with subtle purple `✦ AI` badge
- Timestamps shown as relative time ("2 hours ago")
- Empty states with helpful prompts

### What to NEVER Do

- Never use purple gradients on white backgrounds
- Never use light theme
- Never use boring default Tailwind colors without customization
- Never make it look like a generic dashboard template
- Never use Inter, Roboto, or Arial fonts
