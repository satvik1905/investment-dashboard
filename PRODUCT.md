# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner and a few invited people (friends/family) who swing trade small personal
accounts. Access is invite-only through Supabase; everyone shares the same watchlist,
signals, and scans — there is no per-user data. The typical session is a quick check:
open the app in the morning (on a phone as often as a desktop), see which stocks just
flipped trend, check the watchlist, and decide whether to act.

## Product Purpose

SwingIQ turns the Danny Cheng candle-color system into a daily decision aid for swing
trades held roughly 2–14 days. It scans ~600 liquid US stocks for fresh weekly and
monthly trend flips and keeps a watchlist whose BUY / SELL / HOLD state follows each
stock's latest candle color. Success is the owner's original target: grow a ~$500
account by about 2% a month (~$10/month) through better-timed entries and exits.

## Positioning

A single, rule-based reversal system applied consistently across timeframes — not
predictions, price targets, or AI stock picks. Signals come from candle color flips
(red after a cyan downtrend = bullish, yellow after a blue uptrend = bearish), and the
same algorithm drives the scanner, the watchlist, and the chart, so all three agree.

## Operating Context

- Morning routine: scan results and watchlist reviewed before or around the US open.
- Weekly candles are final only after Friday's close; scans taken earlier are preliminary.
- Scans run on demand from the Scanner page in production (no scheduler is deployed);
  a scheduled Friday scan exists only where the Celery beat process runs.
- Market data comes from yfinance and can be delayed, missing, or wrong for some tickers.
- Users act on signals in their own brokerage; SwingIQ never places trades.

## Capabilities and Constraints

- **Scanner:** weekly and monthly red/yellow flips across S&P 500, NASDAQ 100 and a small
  extras list; prior-trend length, volume ratio, RSI; past scans selectable by date.
- **Watchlist (Dashboard):** per-ticker signal (BUY/SELL/HOLD from candle color),
  confidence score, 3/7/14-day momentum direction, key reason; live quotes.
- **Stock detail:** Danny Cheng–colored chart (daily/weekly/monthly) with SMAs, volume,
  RSI, support/resistance lines.
- **News & sentiment:** VIX and headlines for watchlist tickers.
- **Positions & journal:** backend support with stop/target alerts, but no UI yet —
  whether to build one is undecided.
- **AI:** optional on-demand Claude context/analysis buttons; they rely on a local
  `claude` CLI and are unavailable in production. AI never produces the signal.
- Removed deliberately: auto-generated entry/target/stop levels (didn't fit the system).
- Hosting is free/cheap tier (Vercel, Render with cold starts, Neon, Upstash), so the
  first request after idle can be slow.
- Terminology: candle colors RED / YELLOW (signal flips) and BLUE / CYAN (trend
  continuation); "flip", "prior trend", "weekly + monthly" (multi-timeframe).

## Evidence on Hand

- The algorithm itself: `backend/app/services/indicators.py` (`compute_danny_cheng`)
  and its tests in `backend/tests/test_danny_cheng.py`.
- Real scan history in the database (scan dates with result counts).
- No backtest, win rate, or track record exists for these signals. Do not show or
  imply performance statistics, accuracy claims, or returns that haven't been measured.

## Product Principles

1. **The candle color is the signal.** Present the system's state plainly; never dress
   it up with precision the method doesn't produce.
2. **Never let failure look like calm.** Stale scans, failed requests, and missing
   prices must be visible — real money decisions depend on knowing what's unknown.
3. **Answer the morning question in seconds,** on a phone as well as a desktop: what
   flipped, what changed on my watchlist, what needs action.
4. **Capital preservation first.** Small accounts can't absorb big mistakes; surface
   risk context (bearish flips, oversold/overbought, low volume) without hype.
5. **AI is optional context, never the source of a call.**
