---
target: the Dashboard
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/Users/satvikkhopkar/Desktop/swingiq/frontend/src/pages/Dashboard.tsx"
target_fingerprint: "sha256:50293098238af3c6895ccf12cbe8eab654aa6c0e24bfe186ffa33bf33fc11c2c"
target_path: /Users/satvikkhopkar/Desktop/swingiq/frontend/src/pages/Dashboard.tsx
timestamp: 2026-11-06T21-08-11Z
slug: frontend-src-pages-dashboard-tsx
---
# Critique — Dashboard (frontend/src/pages/Dashboard.tsx)

Method: dual-agent (isolated design review + isolated detector/browser)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 1 | Signal age never shown; 32/41 signals predate Nov 1 (oldest Jun 6) beside live prices |
| 2 | Match System / Real World | 2 | Red = bullish candle but red = SELL badge/delete/negative; "candle(s)" log copy |
| 3 | User Control and Freedom | 3 | Delete confirmed, Esc closes modal; no undo after remove |
| 4 | Consistency and Standards | 2 | Confidence grey in table vs colored in modal; off-palette blue-400 icon; tooltip hardcodes Roboto Mono + hex |
| 5 | Error Prevention | 2 | Add dialog suggestions cover buttons; no already-watching hint; refresh/delete 8px apart |
| 6 | Recognition Rather Than Recall | 2 | Up vs down trend only in truncated text; cryptic ▬/# toggle; legend only in modal tour |
| 7 | Flexibility and Efficiency | 2 | No keyboard rows/sort, no shortcuts, sort not remembered |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, but 41 equal-weight rows and 82 repeated icons |
| 9 | Error Recovery | 3 | ErrorState: reason + Retry + stale-data honesty |
| 10 | Help and Documentation | 2 | Help only inside modal; nothing explains HOLD or confidence |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict
Category-interchangeable shadcn data table; the Danny Cheng color vocabulary is absent from the Dashboard and only lives in the modal. Detector: CLI 1 (overused-font, StockDetailModal.tsx:369 tooltip Roboto Mono). Overlay: desktop 52 / mobile 48 / modal 36 — one 10px badge component (~40), one muted-on-slate pair at 4.3:1, geist mono 67% of text, tooltip High 2.3:1 / Low 3.8:1, amber confidence 2.1:1, modal lacks role=dialog.

## Priority Issues
- [P0] Months-old signals look current — age chip per row, de-emphasise stale, page banner with Refresh all, preliminary state. → harden
- [P0] Unusable on phones — sidebar never collapses; table clipped; Add Stock off-screen; modal chart ~60px. → adapt
- [P1] HOLD hides real state; candle colors absent; red means opposite things — make candle state the primary cell (swatch + "Uptrend · 5 blue"), BUY/SELL only for flips. → clarify, colorize
- [P1] Keyboard/screen-reader/contrast broken on core path — focusable ticker button, sortable header buttons with aria-sort, Radix Dialog, icon contrast + labels, muted token ≥4.5:1 on slate, badges ≥11px. → audit
- [P2] Confidence implies false precision and is inconsistent — drop or replace with prior-trend length / weekly+monthly agreement; remove toggle. → distill

## Persona Red Flags
- Alex: no changed-since-last-visit, sort resets, no keyboard rows or "/" search, 8s modal refresh.
- Sam: can't open tickers or sort by keyboard; modal has no focus trap; icon contrast fails.
- Casey: Add Stock unreachable; sidebar 56% of width; modal chart a sliver.
- Priya (invitee new to the system): reads downtrend HOLD as "keep it"; red SELL vs red-candle-buy conflict; AI button unavailable in prod.

## Minor Observations
Triple redundant headings; possible cry-wolf "stale data" warning on AAPL after hours; SELL outweighed by AI button and contradicted by "↑ 3d"; position alerts with no positions UI; EXIT NOW pulse ignores reduced motion; CANBK.NS unlabeled currency; empty search lacks clear-filter.

## Questions to Consider
- If the candle color is the signal, why is it absent from the screen used every morning?
- What should a no-flip day look like vs. an everything-flipped day?
- Is a 41-row table the right shape, vs. "Needs attention" above "Unchanged"?
- Should a signal older than the last weekly close count as a signal at all?
