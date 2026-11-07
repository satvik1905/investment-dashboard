---
target: the Dashboard (re-run)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/satvikkhopkar/Desktop/swingiq/frontend/src/pages/Dashboard.tsx"
target_fingerprint: "sha256:eefdddc70f8c374dd09c4017971d314a99895d2e58eef3458f7ad920bfbd52e5"
target_path: /Users/satvikkhopkar/Desktop/swingiq/frontend/src/pages/Dashboard.tsx
timestamp: 2026-11-06T22-24-23Z
slug: frontend-src-pages-dashboard-tsx
---
# Critique (re-run) — Dashboard (frontend/src/pages/Dashboard.tsx)

Method: dual-agent (isolated design review + isolated detector/browser)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Age chips work; data warnings (7/41) only inside the modal; no page-level "as of" |
| 2 | Match System / Real World | 3 | Plain candle labels; modal still uses green=good/red=bad on volume, resistance, change % |
| 3 | User Control and Freedom | 3 | Confirmed remove, Esc, Clear filters; no undo |
| 4 | Consistency and Standards | 2 | "Bearish flip" vs "SELL" (modal) vs "added — BUY" (toast) vs "BUY signal" (tour) |
| 5 | Error Prevention | 2 | FLY top bullish flip has price discrepancy, unflagged; chart axis shows four prices |
| 6 | Recognition Rather Than Recall | 3 | Swatch + label; no legend on dashboard |
| 7 | Flexibility and Efficiency | 2 | 13 Tabs to first ticker; no shortcuts |
| 8 | Aesthetic and Minimalist Design | 2 | 27 equal-weight holding rows; "Today" ×41; modal repeats header |
| 9 | Error Recovery | 3 | Specific reasons + Retry |
| 10 | Help and Documentation | 2 | Color tour never starts on phones |
| **Total** | | **24/40** | **Acceptable** |

Resolved since first run: stale signals (P0), phone layout (P0), HOLD/candle state (P1), keyboard/contrast (P1, mostly), confidence (P2). Detector: CLI 1 → 0; browser 52 → 4 per view (muted #65758b on #f1f5f9 page headings 4.3:1; modal 4.0:1; geist mono 70%).

## Priority Issues
- [P1] Data-quality problems invisible on dashboard; warnings noisy (FLY price discrepancy unflagged; 6 "no regular market price" likely after-hours false alarms) — row marker, severe vs soft treatment, rank warned flips lower. → harden
- [P1] Chart axis shows four "current prices" (per-color series last-value labels); red/green elsewhere contradicts red=bullish; SMA 200 #e2e8f0 invisible; cyan #00FFFF — last-value only on latest series, neutral volume/levels, deeper cyan, visible SMA 200, neutral change %. → clarify
- [P1] "Needs attention" flat; holding rows bury it — summary line, split flipped/confirming/stale, collapse holding, hide "Today". → layout
- [P2] Modal speaks a different language (BUY/SELL, machine "Why", unexplained Direction outlook, duplicated identity) — reuse State cell, plain Why. → clarify
- [P2] AI is the strongest CTA; phone signal below the fold — outline AI under "Optional AI context"; compact state strip above chart on phone. → quieter, adapt

## Persona Red Flags
- Alex: 13 Tabs to first ticker; no shortcuts; "Today" ×41; price sort treats missing quote as $0.
- Sam: page headings 4.3:1; tour "?" unnamed; TradingView logo links are tab stops; Add search lacks label/combobox role; focus lost after Add dialog closes.
- Casey: crowded header row; ~5 cards/screen; "Why" below chart; Add suggestions cover buttons.
- Priya: no color legend; no tour on phone; modal teaches red = bad.

## Minor Observations
CANBK.NS in "$"; EXIT NOW pulse ignores reduced motion; "SIGNALS 41" repeats group counts; Add dialog lacks already-watching hint; tour spotlight leaves panel bright.

## Questions to Consider
- Do bearish flips on stocks you don't hold need attention — should the dashboard know holdings?
- Should rows show weekly/monthly agreement instead of the daily flip alone?
- What if "Holding trend" were only a count?
- Should a ticker with suspect data show a signal color at all?
