---
target: the Dashboard (run 3)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/satvikkhopkar/Desktop/swingiq/frontend/src/pages/Dashboard.tsx"
target_fingerprint: "sha256:8fedddaf81c15d217aec7565574cbe88bbfb1dfd6398d9eef74c2fa7afda08b6"
target_path: /Users/satvikkhopkar/Desktop/swingiq/frontend/src/pages/Dashboard.tsx
timestamp: 2026-11-07T00-47-05Z
slug: frontend-src-pages-dashboard-tsx
---
# Critique (run 3) — Dashboard (frontend/src/pages/Dashboard.tsx)

Method: dual-agent (isolated design review + isolated detector/browser; B restarted once after user stop)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | "Since the last close" never says which close; no date on the page |
| 2 | Match System / Real World | 3 | Labels make red=bullish workable; "Flipped one candle ago" over "Uptrend · 1 candle since red flip" |
| 3 | User Control and Freedom | 3 | Confirmed remove; Esc returns focus |
| 4 | Consistency and Standards | 3 | One vocabulary everywhere; CANBK.NS priced in "$" |
| 5 | Error Prevention | 2 | Only bullish flip is a Check-data ticker yet counts in summary; Add dialog lacks already-watched mark, list covers buttons |
| 6 | Recognition Rather Than Recall | 2 | No color legend on dashboard; tour desktop-only |
| 7 | Flexibility and Efficiency | 2 | No shortcuts; ~3 tab stops per row; sort not remembered |
| 8 | Aesthetic and Minimalist Design | 3 | Clean; Updated column blank when current |
| 9 | Error Recovery | 3 | Specific, honest errors with Retry |
| 10 | Help and Documentation | 1 | Only help is a desktop-only tour inside the modal |
| **Total** | | **25/40** | **Acceptable** |

Detector: CLI clean; browser 3 per view (52 → 4 → 3): muted #65758b on #f1f5f9 at 4.3:1 ("Watchlist signals", "After Hours", inactive W/M toggle, quiet Yahoo note; lead: phone tab bar inactive labels); geist mono 61–67%.

## Priority Issues
- [P1] Suspect-data signal leads the summary (FLY counted as 1 bullish flip, sorts first) — summary "· 1 needs a data check", "Bullish flip, unverified" in State, flagged rows last regardless of color. → harden, clarify
- [P1] No as-of date; Updated column dead — "Since Thu Nov 5 close · all signals current"; move Nd-old chip into State; drop column. → clarify, distill
- [P2] Phone first screen mostly chrome (~316px before first row) — drop subtitle, icon Add Stock, summary chips as filters. → layout
- [P2] Colors not learnable on dashboard/phone; tooltips fail on touch — tappable legend popover, tappable info note, "?" on phone. → onboard
- [P2] Add Stock dialog misleads (list covers buttons, no already-watched tag, non-US "$"). → harden

## Persona Red Flags
- Alex: no / or j/k; ~120 tab stops expanded; sort resets; no refresh-stale action.
- Sam: unnamed TradingView logo tab stops; 4.3:1 muted text; quiet note not keyboard-reachable.
- Casey: ~4.5 cards first view; hover-only info; phone modal header+banner ~45% of viewport.
- New invitee: no legend; blue/cyan hard to tell at 6px; summary shows only red/yellow.

## Minor Observations
"Click 'Add Stock'" on touch; Holding toggle triple affordance; tablet single-column cards; RSI label collides with OB 70; static "Updated just now"; EXIT NOW pulse/emoji; mono "After Hours".

## Questions to Consider
- Should the title be the close date instead of "Dashboard"?
- Are bearish flips on unheld stocks really "attention"?
- Why is the only filled button the rarest action?
- If summary counts were filters, would search and the dropdown be needed?
