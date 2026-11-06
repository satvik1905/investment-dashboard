"""Danny Cheng candle-color state machine and the shared lookback that feeds it."""

import numpy as np
import pandas as pd
import pytest

from app.services import market_data
from app.services.indicators import DC_WARMUP_BARS, compute_danny_cheng

SIGNALS = {"RED", "YELLOW"}


def make_ohlcv(drifts, bars_per_regime=120, seed=7, freq="B"):
    """Random-walk OHLCV with one drift per regime, e.g. [+0.004, -0.004] = up then down."""
    rng = np.random.default_rng(seed)
    returns = np.concatenate([
        rng.normal(d, 0.012, bars_per_regime) for d in drifts
    ])
    close = 100 * np.exp(np.cumsum(returns))
    open_ = np.concatenate([[close[0]], close[:-1]])
    spread = np.abs(rng.normal(0, 0.006, len(close))) * close
    idx = pd.date_range("2022-01-03", periods=len(close), freq=freq)
    return pd.DataFrame({
        "open": open_,
        "high": np.maximum(open_, close) + spread,
        "low": np.minimum(open_, close) - spread,
        "close": close,
        "volume": rng.integers(1_000_000, 3_000_000, len(close)).astype(float),
    }, index=idx)


def colors_of(result):
    return [c["color"] for c in result["color_series"]]


@pytest.fixture(scope="module")
def up_down_up():
    return make_ohlcv([+0.004, -0.004, +0.004])


# ── State machine invariants ─────────────────────────────────────────────────

def test_too_little_data_returns_neutral_default():
    r = compute_danny_cheng(make_ohlcv([0.0], bars_per_regime=29))
    assert r["color_series"] == []
    assert r["current_color"] == "BLUE"
    assert r["last_signal_color"] is None


def test_one_color_per_candle(up_down_up):
    r = compute_danny_cheng(up_down_up)
    assert len(r["color_series"]) == len(up_down_up)
    assert set(colors_of(r)) <= {"BLUE", "CYAN", "RED", "YELLOW"}


def test_no_signals_fire_during_warmup(up_down_up):
    colors = colors_of(compute_danny_cheng(up_down_up))
    assert not SIGNALS & set(colors[:DC_WARMUP_BARS])


def test_signal_is_always_followed_by_its_continuation_color(up_down_up):
    colors = colors_of(compute_danny_cheng(up_down_up))
    follow = {"RED": "BLUE", "YELLOW": "CYAN"}
    for prev, nxt in zip(colors, colors[1:]):
        if prev in follow:
            assert nxt == follow[prev]


def test_signals_alternate_between_red_and_yellow(up_down_up):
    signals = [c for c in colors_of(compute_danny_cheng(up_down_up)) if c in SIGNALS]
    assert signals, "expected at least one reversal across up/down/up regimes"
    assert all(a != b for a, b in zip(signals, signals[1:]))


def test_trend_colors_match_the_state_between_signals(up_down_up):
    # BLUE only while in an uptrend (after RED), CYAN only in a downtrend (after YELLOW)
    colors = colors_of(compute_danny_cheng(up_down_up))[DC_WARMUP_BARS:]
    last = None
    for c in colors:
        if c in SIGNALS:
            last = c
        elif last == "RED":
            assert c == "BLUE"
        elif last == "YELLOW":
            assert c == "CYAN"


def test_downtrend_regime_produces_a_yellow_reversal(up_down_up):
    colors = colors_of(compute_danny_cheng(up_down_up))
    down_regime = colors[120:240]
    assert "YELLOW" in colors[100:240]
    assert down_regime.count("CYAN") > down_regime.count("BLUE")


def test_derived_fields_agree_with_color_series(up_down_up):
    r = compute_danny_cheng(up_down_up)
    colors = colors_of(r)
    last_idx = max(i for i, c in enumerate(colors) if c in SIGNALS)

    assert r["current_color"] == colors[-1]
    assert r["current_trend"] == ("UPTREND" if colors[-1] in ("BLUE", "RED") else "DOWNTREND")
    assert r["last_signal_color"] == colors[last_idx]
    assert r["last_signal_date"] == r["color_series"][last_idx]["time"]
    assert r["candles_since_signal"] == len(colors) - 1 - last_idx
    assert r["trend_sequence"] == colors[-5:]


def test_recent_colors_do_not_depend_on_which_bar_comes_first(up_down_up):
    # The bug this guards: state was seeded from bar 0, so different fetch
    # windows could disagree on today's color.
    baseline = colors_of(compute_danny_cheng(up_down_up))[-60:]
    for start in range(1, 60, 7):
        shifted = colors_of(compute_danny_cheng(up_down_up.iloc[start:]))[-60:]
        assert shifted == baseline, f"start bar {start} changed recent colors"


# ── Shared lookback (market_data.get_ohlcv_with_danny_history) ───────────────

@pytest.fixture
def fetched(monkeypatch):
    """Stub get_ohlcv; records each (period, interval) it was asked for."""
    calls = []

    def fake_get_ohlcv(_ticker, period="3mo", interval="1d"):
        calls.append((period, interval))
        freq = {"1d": "B", "1wk": "W-FRI", "1mo": "MS"}.get(interval, "h")
        bars = {"6mo": 126, "1y": 252, "2y": 504, "5y": 1260}.get(period, 100)
        if interval == "1wk":
            bars //= 5
        elif interval == "1mo":
            bars //= 21
        return make_ohlcv([0.001], bars_per_regime=bars, freq=freq)

    monkeypatch.setattr(market_data, "get_ohlcv", fake_get_ohlcv)
    return calls


def test_short_daily_period_fetches_full_lookback_and_slices(fetched):
    df, danny_df = market_data.get_ohlcv_with_danny_history("X", "6mo", "1d")

    assert fetched == [(market_data.DANNY_LOOKBACK["1d"], "1d")]
    assert len(danny_df) > len(df)
    assert df.index[-1] == danny_df.index[-1]
    span = df.index[-1] - df.index[0]
    assert pd.Timedelta(days=170) < span <= pd.Timedelta(days=184)


def test_weekly_chart_uses_same_history_as_scanner(fetched):
    _, danny_df = market_data.get_ohlcv_with_danny_history("X", "1y", "1wk")
    assert fetched == [("2y", "1wk")]
    assert len(danny_df) > 52


def test_period_longer_than_lookback_uses_one_df_for_both(fetched):
    df, danny_df = market_data.get_ohlcv_with_danny_history("X", "5y", "1wk")
    assert fetched == [("5y", "1wk")]
    assert df is danny_df


@pytest.mark.parametrize("period,interval", [("5d", "1h"), ("max", "1d")])
def test_unmapped_period_or_interval_passes_through(fetched, period, interval):
    df, danny_df = market_data.get_ohlcv_with_danny_history("X", period, interval)
    assert fetched == [(period, interval)]
    assert df is danny_df
