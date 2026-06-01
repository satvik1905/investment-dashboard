import logging

import pandas as pd
import ta
from typing import Any

logger = logging.getLogger(__name__)


def compute_all(df: pd.DataFrame) -> dict[str, Any]:
    """
    Compute all technical indicators on a OHLCV DataFrame.
    Returns a flat dict of scalar values + signals.
    """
    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"]

    n = len(df)
    w14 = min(14, n)
    w9  = min(9, n)
    w3  = min(3, n)

    result: dict[str, Any] = {}
    current = _last(close)
    result["current_price"] = current

    # ── RSI ────────────────────────────────────────────────────────────────
    rsi_ind = ta.momentum.RSIIndicator(close=close, window=w14)
    result["rsi_14"] = _last(rsi_ind.rsi())
    result["rsi_signal"] = _rsi_signal(result["rsi_14"])

    # ── MACD ───────────────────────────────────────────────────────────────
    macd_slow = min(26, n)
    macd_fast = min(12, n)
    macd_sign = min(9, n)
    macd_ind = ta.trend.MACD(close=close, window_slow=macd_slow, window_fast=macd_fast, window_sign=macd_sign)
    result["macd"] = _last(macd_ind.macd())
    result["macd_signal"] = _last(macd_ind.macd_signal())
    result["macd_hist"] = _last(macd_ind.macd_diff())
    result["macd_crossover"] = _macd_crossover(macd_ind.macd_diff())

    # ── SMAs ───────────────────────────────────────────────────────────────
    for period in [20, 50, 200]:
        w = min(period, n)
        sma = ta.trend.SMAIndicator(close=close, window=w)
        result[f"sma_{period}"] = _last(sma.sma_indicator())

    result["above_sma20"] = (current > result["sma_20"]) if result["sma_20"] else None
    result["above_sma50"] = (current > result["sma_50"]) if result["sma_50"] else None
    result["above_sma200"] = (current > result["sma_200"]) if result["sma_200"] else None

    # ── EMAs ───────────────────────────────────────────────────────────────
    for period in [12, 26]:
        w = min(period, n)
        ema = ta.trend.EMAIndicator(close=close, window=w)
        result[f"ema_{period}"] = _last(ema.ema_indicator())

    # ── Bollinger Bands ────────────────────────────────────────────────────
    bb_w = min(20, n)
    bb = ta.volatility.BollingerBands(close=close, window=bb_w, window_dev=2)
    result["bb_upper"] = _last(bb.bollinger_hband())
    result["bb_mid"] = _last(bb.bollinger_mavg())
    result["bb_lower"] = _last(bb.bollinger_lband())
    result["bb_pct"] = _last(bb.bollinger_pband())
    result["bb_signal"] = _bb_signal(current, result["bb_lower"], result["bb_upper"])

    # ── Volume ────────────────────────────────────────────────────────────
    result["volume_current"] = int(_last(volume)) if _last(volume) else None
    vol_w = min(20, n)
    vol_avg = float(volume.rolling(vol_w).mean().iloc[-1]) if n >= vol_w else None
    result["volume_avg_20"] = vol_avg
    result["volume_ratio"] = (
        result["volume_current"] / vol_avg
        if result["volume_current"] and vol_avg
        else None
    )
    result["volume_signal"] = "HIGH" if result["volume_ratio"] and result["volume_ratio"] > 1.5 else "NORMAL"

    # ── ATR ────────────────────────────────────────────────────────────────
    atr = ta.volatility.AverageTrueRange(high=high, low=low, close=close, window=w14)
    result["atr_14"] = _last(atr.average_true_range())

    # ── Stochastic ─────────────────────────────────────────────────────────
    stoch = ta.momentum.StochasticOscillator(high=high, low=low, close=close, window=w14, smooth_window=w3)
    result["stoch_k"] = _last(stoch.stoch())
    result["stoch_d"] = _last(stoch.stoch_signal())
    result["stoch_signal"] = _stoch_signal(result["stoch_k"], result["stoch_d"])

    # ── OBV ────────────────────────────────────────────────────────────────
    obv = ta.volume.OnBalanceVolumeIndicator(close=close, volume=volume)
    obv_series = obv.on_balance_volume()
    if len(obv_series) >= 5:
        result["obv_trend"] = "RISING" if obv_series.iloc[-1] > obv_series.iloc[-5] else "FALLING"
    else:
        result["obv_trend"] = None

    # ── Support / Resistance (20-day pivots) ───────────────────────────────
    recent = df.tail(20)
    result["support"] = float(recent["low"].min())
    result["resistance"] = float(recent["high"].max())

    # ── Trend score (0–100, aggregated) ───────────────────────────────────
    result["trend_score"] = trend_score(result)

    return _round_floats(result)


# ── Helpers ────────────────────────────────────────────────────────────────

def _last(series) -> float | None:
    if series is None or len(series) == 0:
        return None
    s = series.dropna()
    if s.empty:
        return None
    return float(s.iloc[-1])


def _rsi_signal(rsi: float | None) -> str:
    if rsi is None:
        return "NEUTRAL"
    if rsi < 30:
        return "OVERSOLD"
    if rsi > 70:
        return "OVERBOUGHT"
    if rsi < 45:
        return "BEARISH"
    if rsi > 55:
        return "BULLISH"
    return "NEUTRAL"


def _macd_crossover(hist_series) -> str | None:
    if hist_series is None or len(hist_series) < 2:
        return None
    prev = hist_series.iloc[-2]
    curr = hist_series.iloc[-1]
    if pd.isna(prev) or pd.isna(curr):
        return None
    if prev < 0 and curr > 0:
        return "BULLISH"
    if prev > 0 and curr < 0:
        return "BEARISH"
    return "NONE"


def _bb_signal(price: float | None, lower: float | None, upper: float | None) -> str:
    if price is None or lower is None or upper is None:
        return "NEUTRAL"
    band_range = upper - lower
    if band_range == 0:
        return "NEUTRAL"
    pct = (price - lower) / band_range
    if pct < 0.15:
        return "OVERSOLD"
    if pct > 0.85:
        return "OVERBOUGHT"
    return "NEUTRAL"


def _stoch_signal(k: float | None, d: float | None) -> str:
    if k is None or d is None:
        return "NEUTRAL"
    if k < 20 and d < 20:
        return "OVERSOLD"
    if k > 80 and d > 80:
        return "OVERBOUGHT"
    if k > d and k < 50:
        return "BULLISH"
    return "NEUTRAL"


def trend_score(ind: dict) -> int:
    score = 50
    rsi = ind.get("rsi_14")
    if rsi:
        score += (rsi - 50) * 0.3

    if ind.get("above_sma20"):
        score += 5
    if ind.get("above_sma50"):
        score += 7
    if ind.get("above_sma200"):
        score += 8

    mc = ind.get("macd_crossover")
    if mc == "BULLISH":
        score += 10
    elif mc == "BEARISH":
        score -= 10

    if ind.get("obv_trend") == "RISING":
        score += 5
    elif ind.get("obv_trend") == "FALLING":
        score -= 5

    vr = ind.get("volume_ratio")
    if vr and vr > 2:
        score += 5

    return max(0, min(100, int(score)))


def compute_confidence(signal: str, ind: dict, danny: dict) -> int:
    """
    Signal-aware confidence score (0-100).

    BUY:  base = trend_score × 0.5  +  recency bonus (0-30)  +  volume bonus (0-20)
    SELL: base = (100 - trend_score) × 0.5  +  recency bonus  +  volume bonus
    HOLD: min(trend_score, 75) — reflects trend clarity, capped to avoid
          implying high conviction when there's no actionable signal.

    Recency: how many candles since the last RED/YELLOW signal fired.
      ≤1 candle → 30,  ≤3 → 20,  ≤5 → 10,  >5 → 0
    Volume: volume_ratio > 1.5 → 20,  > 1.0 → 10,  else → 0
    """
    ts = ind.get("trend_score", 50)
    cs = danny.get("candles_since_signal", 99)
    vr = ind.get("volume_ratio") or 0

    if signal == "HOLD":
        return max(0, min(75, int(ts)))

    # Recency bonus
    if cs <= 1:
        recency = 30
    elif cs <= 3:
        recency = 20
    elif cs <= 5:
        recency = 10
    else:
        recency = 0

    # Volume bonus
    if vr > 1.5:
        vol_bonus = 20
    elif vr > 1.0:
        vol_bonus = 10
    else:
        vol_bonus = 0

    if signal in ("BUY", "STRONG_BUY"):
        base = ts * 0.5
    else:  # SELL, STRONG_SELL
        base = (100 - ts) * 0.5

    return max(0, min(100, int(base + recency + vol_bonus)))


def generate_key_reason(signal: str, ind: dict, danny: dict) -> str:
    """
    One-line explanation of why the signal fired, ≤80 chars.
    Built from Danny Cheng state + the dominant supporting indicator.
    """
    color = danny.get("current_color", "BLUE")
    prior = danny.get("candles_since_signal", 0)
    rsi = ind.get("rsi_14")
    vr = ind.get("volume_ratio")

    rsi_note = ""
    if rsi is not None:
        if rsi < 30:
            rsi_note = f", RSI {rsi:.0f} (oversold)"
        elif rsi > 70:
            rsi_note = f", RSI {rsi:.0f} (overbought)"
        else:
            rsi_note = f", RSI {rsi:.0f}"

    vol_note = f", vol {vr:.1f}×" if vr and vr >= 1.0 else ""

    if signal in ("BUY", "STRONG_BUY"):
        # prior here means candles_since_signal (how far back the RED was)
        if color == "RED":
            return f"RED reversal candle{rsi_note}{vol_note}"[:80]
        # RED was recent but we're now BLUE
        trend_len = prior
        return f"RED reversal {trend_len} candle(s) ago{rsi_note}{vol_note}"[:80]

    if signal in ("SELL", "STRONG_SELL"):
        if color == "YELLOW":
            return f"YELLOW reversal candle{rsi_note}{vol_note}"[:80]
        trend_len = prior
        return f"YELLOW reversal {trend_len} candle(s) ago{rsi_note}{vol_note}"[:80]

    # HOLD
    trend = danny.get("current_trend", "UPTREND")
    if trend == "UPTREND":
        seq_len = sum(1 for c in reversed(danny.get("trend_sequence", []))
                      if c == "BLUE")
        return f"Uptrend intact, {seq_len} blue candle(s), no reversal signal"[:80]
    else:
        seq_len = sum(1 for c in reversed(danny.get("trend_sequence", []))
                      if c == "CYAN")
        return f"Downtrend continues, {seq_len} cyan candle(s), awaiting reversal"[:80]


def generate_risk_factors(signal: str, ind: dict, danny: dict,
                          entry_price: float | None,
                          target: float | None,
                          stop: float | None) -> list[str]:
    """
    Conditional risk flags from indicator thresholds.
    Returns up to 4 items sorted by severity (most concerning first).
    Empty list if nothing is flagged.

    Severity tiers (internal, for sorting only):
      1 = structural (no exit levels, below SMA 200)
      2 = momentum divergence (RSI extremes counter to signal, MACD against)
      3 = volume / volatility concerns
      4 = target proximity
    """
    _risks: list[tuple[int, str]] = []  # (severity, message)

    rsi = ind.get("rsi_14")
    vr = ind.get("volume_ratio")
    atr = ind.get("atr_14")
    price = ind.get("current_price") or 0

    # Structural: no exit levels
    if target is None and stop is None:
        _risks.append((1, "No clear exit levels (target and stop undefined)"))
    elif target is None:
        _risks.append((1, "No target price — resistance not identified"))
    elif stop is None:
        _risks.append((1, "No stop loss — support not identified"))

    # RSI extremes — symmetric, flagged regardless of signal type
    if rsi is not None:
        if rsi > 70:
            _risks.append((2, f"RSI overbought ({rsi:.0f})"))
        elif rsi > 65:
            _risks.append((2, f"RSI approaching overbought ({rsi:.0f})"))
        elif rsi < 30:
            _risks.append((2, f"RSI oversold ({rsi:.0f})"))
        elif rsi < 35:
            _risks.append((2, f"RSI approaching oversold ({rsi:.0f})"))

    # SMA 200 — primarily a concern for BUY signals but flagged always
    if ind.get("above_sma200") is False:
        _risks.append((1, "Price below 200-day SMA"))

    # MACD against signal direction
    mc = ind.get("macd_crossover")
    if signal in ("BUY", "STRONG_BUY") and mc == "BEARISH":
        _risks.append((2, "MACD bearish crossover"))
    elif signal in ("SELL", "STRONG_SELL") and mc == "BULLISH":
        _risks.append((2, "MACD bullish crossover"))

    # Volume concerns
    if vr is not None and vr < 0.8:
        _risks.append((3, f"Low volume confirmation ({vr:.1f}× avg)"))

    # Volatility hole
    if danny.get("vol_hole_active"):
        _risks.append((3, "Volatility hole detected"))

    # High ATR relative to price
    if atr and price and price > 0:
        atr_pct = atr / price * 100
        if atr_pct > 3:
            _risks.append((3, f"High volatility — ATR {atr_pct:.1f}% of price"))

    # Target proximity (only meaningful for BUY/SELL with both levels)
    if target and entry_price and entry_price > 0:
        target_pct = abs(target - entry_price) / entry_price * 100
        if target_pct < 3:
            _risks.append((4, f"Target only {target_pct:.1f}% from entry"))

    # Sort by severity, cap at 4
    _risks.sort(key=lambda x: x[0])
    return [msg for _, msg in _risks[:4]]


def generate_summary(signal: str, ind: dict, danny: dict,
                     entry_low: float | None, entry_high: float | None,
                     target: float | None, stop: float | None,
                     confidence: int,
                     risk_factors: list[str]) -> str:
    """
    3-sentence narrative from templates. No LLM — pure string formatting.

    Sentence 1: signal + confidence + trigger (from Danny Cheng state)
    Sentence 2: key levels + risk/reward ratio (or note if levels missing)
    Sentence 3: strongest risk factor if any, else strongest confirming indicator
    """
    color = danny.get("current_color", "BLUE")
    trend = danny.get("current_trend", "UPTREND")
    cs = danny.get("candles_since_signal", 0)
    rsi = ind.get("rsi_14")

    # ── Sentence 1: signal + confidence + trigger ──────────────────────────
    if signal in ("BUY", "STRONG_BUY"):
        prior_color = "cyan downtrend"
        trigger = f"RED reversal candle" if color == "RED" else f"RED reversal {cs} candle(s) ago"
        s1 = f"{signal} signal at {confidence}% confidence — {trigger}."
    elif signal in ("SELL", "STRONG_SELL"):
        prior_color = "blue uptrend"
        trigger = f"YELLOW reversal candle" if color == "YELLOW" else f"YELLOW reversal {cs} candle(s) ago"
        s1 = f"{signal} signal at {confidence}% confidence — {trigger}."
    else:
        direction = "uptrend" if trend == "UPTREND" else "downtrend"
        seq = danny.get("trend_sequence", [])
        cont_color = "blue" if trend == "UPTREND" else "cyan"
        count = sum(1 for c in reversed(seq) if c.lower() == cont_color)
        s1 = f"HOLD at {confidence}% confidence — {direction} intact with {count} consecutive {cont_color} candle(s)."

    # ── Sentence 2: key levels + risk/reward ───────────────────────────────
    if entry_low and entry_high and target and stop:
        entry_mid = (entry_low + entry_high) / 2
        risk_amt = abs(entry_mid - stop)
        reward_amt = abs(target - entry_mid)
        rr = reward_amt / risk_amt if risk_amt > 0 else 0
        s2 = (f"Entry ${entry_low:.2f}–${entry_high:.2f}, "
              f"target ${target:.2f}, stop ${stop:.2f} — "
              f"{rr:.1f}:1 risk/reward.")
    elif entry_low and entry_high:
        s2 = f"Entry ${entry_low:.2f}–${entry_high:.2f}, exit levels not fully defined."
    else:
        s2 = "No actionable entry or exit levels at this time."

    # ── Sentence 3: top risk factor, or strongest confirming indicator ─────
    if risk_factors:
        s3 = f"Watch: {risk_factors[0]}."
    else:
        # Build a confirming statement from the strongest positive signal
        confirms = []
        if rsi is not None:
            if rsi < 35:
                confirms.append(f"RSI oversold at {rsi:.0f}")
            elif rsi > 65:
                confirms.append(f"RSI overbought at {rsi:.0f}")
            else:
                confirms.append(f"RSI neutral at {rsi:.0f}")
        vr = ind.get("volume_ratio")
        if vr and vr > 1.2:
            confirms.append(f"volume confirms at {vr:.1f}× avg")
        if ind.get("above_sma200"):
            confirms.append("price above all major SMAs")
        s3 = f"{' and '.join(confirms[:2])}." if confirms else "No significant risk factors identified."
        # Capitalize first letter
        s3 = s3[0].upper() + s3[1:]

    return f"{s1} {s2} {s3}"


def _round_floats(d: dict) -> dict:
    return {k: round(v, 4) if isinstance(v, float) else v for k, v in d.items()}


# ── Danny Cheng Candle Coloring ────────────────────────────────────────────────

def compute_danny_cheng(df: pd.DataFrame) -> dict:
    """
    Danny Cheng state-machine candle coloring.

    STATE MACHINE (not per-candle independent):
      UPTREND  → all candles BLUE
        Bearish reversal: HA bearish + MACD hist crosses below 0 + RSI < 50
        → fires ONE YELLOW candle, switches to DOWNTREND
      DOWNTREND → all candles CYAN
        Bullish reversal: HA bullish + MACD hist crosses above 0 + RSI > 50
        → fires ONE RED candle, switches to UPTREND

    RED always followed by BLUE. YELLOW always followed by CYAN.

    Volatility holes: RARE — ATR > 3× avg AND price gap ≥ 0.5% AND volume > 2.5× avg.
    """
    _empty = {
        "color_series": [], "current_color": "BLUE",
        "vol_holes": [], "vol_hole_active": False, "trend_sequence": [],
        "current_trend": "UPTREND", "last_signal_color": None,
        "last_signal_date": None, "candles_since_signal": 0,
    }
    if len(df) < 30:
        return _empty

    close  = df["close"]
    high   = df["high"]
    low    = df["low"]
    open_  = df["open"]
    volume = df["volume"]

    # ── Heikin-Ashi ───────────────────────────────────────────────────────────
    ha_close = (open_ + high + low + close) / 4
    ha_open_vals: list[float] = [float((open_.iloc[0] + close.iloc[0]) / 2)]
    for i in range(1, len(df)):
        ha_open_vals.append((ha_open_vals[-1] + float(ha_close.iloc[i - 1])) / 2)
    ha_open = pd.Series(ha_open_vals, index=df.index)

    # ── MACD histogram ────────────────────────────────────────────────────────
    macd_hist = ta.trend.MACD(
        close=close, window_slow=26, window_fast=12, window_sign=9
    ).macd_diff().fillna(0)

    # ── RSI ───────────────────────────────────────────────────────────────────
    rsi_series = ta.momentum.RSIIndicator(close=close, window=14).rsi().fillna(50)

    # ── Dates ─────────────────────────────────────────────────────────────────
    dates = [
        dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]
        for dt in df.index
    ]

    # ── State machine ─────────────────────────────────────────────────────────
    state       = "UPTREND" if float(ha_close.iloc[0]) >= float(ha_open.iloc[0]) else "DOWNTREND"
    colors: list[str] = []
    just_flipped = False   # blocks a second flip on the candle immediately after a signal

    for i in range(len(df)):
        ha_bull  = float(ha_close.iloc[i]) > float(ha_open.iloc[i])
        hist_val = float(macd_hist.iloc[i])
        rsi_val  = float(rsi_series.iloc[i])

        if just_flipped:
            # Candle immediately after a signal must be the continuation color
            colors.append("BLUE" if state == "UPTREND" else "CYAN")
            just_flipped = False
        elif state == "UPTREND":
            # Bearish reversal: HA bearish + at least one of (MACD < 0, RSI < 50)
            if (not ha_bull) and ((hist_val < 0) or (rsi_val < 50)):
                colors.append("YELLOW")
                state = "DOWNTREND"
                just_flipped = True
            else:
                colors.append("BLUE")
        else:  # DOWNTREND
            # Bullish reversal: HA bullish + at least one of (MACD > 0, RSI > 50)
            if ha_bull and ((hist_val > 0) or (rsi_val > 50)):
                colors.append("RED")
                state = "UPTREND"
                just_flipped = True
            else:
                colors.append("CYAN")

        logger.debug(
            "DC [%s] HA=%s RSI=%.1f MACD=%.4f State=%s -> %s",
            dates[i], "bullish" if ha_bull else "bearish",
            rsi_val, hist_val, state, colors[-1],
        )

    # ── Volatility holes — STRICT: 3× ATR + price gap ≥ 0.5% + vol > 2.5× avg ─
    atr     = ta.volatility.AverageTrueRange(high=high, low=low, close=close, window=14).average_true_range()
    atr_avg = atr.rolling(20).mean()
    vol_avg = volume.rolling(20).mean()

    vol_holes: list[str] = []
    for i in range(1, len(df)):
        atr_val     = float(atr.iloc[i])     if not pd.isna(atr.iloc[i])     else 0.0
        avg_val     = float(atr_avg.iloc[i]) if not pd.isna(atr_avg.iloc[i]) else 0.0
        vol_val     = float(volume.iloc[i])
        vol_avg_val = float(vol_avg.iloc[i]) if not pd.isna(vol_avg.iloc[i]) else 0.0
        price       = float(close.iloc[i])

        if avg_val == 0 or vol_avg_val == 0 or price == 0:
            continue

        atr_spike = atr_val > avg_val * 3
        price_gap = abs(float(low.iloc[i]) - float(high.iloc[i - 1])) / price >= 0.005
        vol_spike = vol_val > vol_avg_val * 2.5

        if atr_spike and price_gap and vol_spike:
            vol_holes.append(dates[i])

    # ── Derived fields ─────────────────────────────────────────────────────────
    current_color   = colors[-1] if colors else "BLUE"
    current_trend   = "UPTREND" if current_color in ("BLUE", "RED") else "DOWNTREND"
    vol_hole_active = bool(vol_holes and dates[-1] == vol_holes[-1])
    trend_sequence  = colors[-5:] if len(colors) >= 5 else colors[:]

    # Last signal candle (RED or YELLOW) and how many candles ago
    last_signal_color: str | None = None
    last_signal_date:  str | None = None
    candles_since_signal = 0
    for i in range(len(colors) - 1, -1, -1):
        if colors[i] in ("RED", "YELLOW"):
            last_signal_color    = colors[i]
            last_signal_date     = dates[i]
            candles_since_signal = len(colors) - 1 - i
            break

    return {
        "color_series":          [{"time": dt, "color": c} for dt, c in zip(dates, colors)],
        "current_color":         current_color,
        "vol_holes":             vol_holes,
        "vol_hole_active":       vol_hole_active,
        "trend_sequence":        trend_sequence,
        "current_trend":         current_trend,
        "last_signal_color":     last_signal_color,
        "last_signal_date":      last_signal_date,
        "candles_since_signal":  candles_since_signal,
    }
