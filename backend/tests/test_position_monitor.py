"""Position alerts: EXIT / HOLD / UNKNOWN decisions from price vs stop and target."""

from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services import position_monitor


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *_):
        return self

    def all(self):
        return self.rows


class FakeDB:
    def __init__(self, rows):
        self.rows = rows

    def query(self, _model):
        return FakeQuery(self.rows)


def make_position(stop="95.00", target="120.00", entry="100.00", days_held=3):
    return SimpleNamespace(
        id=1,
        ticker="TEST",
        entry_price=Decimal(entry),
        stop_loss=Decimal(stop) if stop else None,
        target_price=Decimal(target) if target else None,
        entry_date=date.today() - timedelta(days=days_held),
    )


@pytest.fixture
def quote(monkeypatch):
    """Set the price get_quote returns; pass an Exception to make it raise."""
    def _set(value):
        def fake_get_quote(_ticker):
            if isinstance(value, Exception):
                raise value
            return {"current_price": value}
        monkeypatch.setattr(position_monitor, "get_quote", fake_get_quote)
    return _set


def check(position):
    [result] = position_monitor.monitor_positions(FakeDB([position]), "user-1")
    return result


def test_price_at_or_below_stop_exits(quote):
    quote(94.0)
    r = check(make_position())
    assert (r["recommendation"], r["urgency"]) == ("EXIT", "HIGH")
    assert "Stop loss hit" in r["reason"]


def test_price_exactly_at_stop_exits(quote):
    quote(95.0)
    assert check(make_position())["recommendation"] == "EXIT"


def test_price_at_or_above_target_exits(quote):
    quote(121.0)
    r = check(make_position())
    assert (r["recommendation"], r["urgency"]) == ("EXIT", "HIGH")
    assert "Target reached" in r["reason"]


def test_price_within_2pct_of_stop_is_watch_closely(quote):
    quote(96.5)  # 1.6% above the $95 stop
    r = check(make_position())
    assert (r["recommendation"], r["urgency"]) == ("HOLD", "MEDIUM")


def test_price_in_normal_range_holds(quote):
    quote(105.0)
    r = check(make_position())
    assert (r["recommendation"], r["urgency"]) == ("HOLD", "LOW")
    assert r["pnl_pct"] == 5.0
    assert r["hold_days"] == 3


def test_no_stop_or_target_holds(quote):
    quote(50.0)
    r = check(make_position(stop=None, target=None))
    assert (r["recommendation"], r["urgency"]) == ("HOLD", "LOW")


def test_quote_failure_is_unknown_not_hold(quote):
    quote(RuntimeError("yfinance down"))
    r = check(make_position())
    assert (r["recommendation"], r["urgency"]) == ("UNKNOWN", "MEDIUM")
    assert r["current_price"] is None
    assert "yfinance down" in r["reason"]


@pytest.mark.parametrize("missing", [None, 0, 0.0])
def test_missing_price_is_unknown_not_a_false_stop_loss_exit(quote, missing):
    # Regression: a missing price used to become $0.00 and fire "Stop loss hit"
    quote(missing)
    r = check(make_position())
    assert r["recommendation"] == "UNKNOWN"
    assert r["urgency"] != "LOW"  # LOW alerts are hidden on the dashboard


def test_one_bad_quote_does_not_hide_other_positions(monkeypatch):
    prices = {"GOOD": 94.0}

    def fake_get_quote(ticker):
        if ticker not in prices:
            raise RuntimeError("no data")
        return {"current_price": prices[ticker]}

    monkeypatch.setattr(position_monitor, "get_quote", fake_get_quote)
    bad, good = make_position(), make_position()
    bad.ticker, good.ticker = "BAD", "GOOD"

    results = {r["ticker"]: r for r in position_monitor.monitor_positions(FakeDB([bad, good]), "user-1")}
    assert results["BAD"]["recommendation"] == "UNKNOWN"
    assert results["GOOD"]["recommendation"] == "EXIT"
