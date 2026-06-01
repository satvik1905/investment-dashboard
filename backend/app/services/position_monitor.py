"""
Position monitor — pure math, no AI calls.
Checks stop-loss / target hit for each open position.
"""
from sqlalchemy.orm import Session
from datetime import date

from ..models import Position
from .market_data import get_quote


def monitor_positions(db: Session) -> list[dict]:
    """
    Check all open positions against their stop-loss and target price.
    Returns a list of simple HOLD/EXIT recommendations based on price alone.
    """
    open_positions = db.query(Position).filter(Position.status == "OPEN").all()
    results = []

    for pos in open_positions:
        try:
            quote = get_quote(pos.ticker)
            current_price = float(quote.get("current_price") or 0.0)
            entry_price   = float(pos.entry_price)
            stop_loss     = float(pos.stop_loss)   if pos.stop_loss   else None
            target_price  = float(pos.target_price) if pos.target_price else None
            pnl_pct       = ((current_price - entry_price) / entry_price * 100) if entry_price else 0
            hold_days     = (date.today() - pos.entry_date).days if pos.entry_date else 0

            if stop_loss and current_price <= stop_loss:
                recommendation = "EXIT"
                urgency        = "HIGH"
                reason         = f"Stop loss hit — price ${current_price:.2f} ≤ stop ${stop_loss:.2f}"
            elif target_price and current_price >= target_price:
                recommendation = "EXIT"
                urgency        = "HIGH"
                reason         = f"Target reached — price ${current_price:.2f} ≥ target ${target_price:.2f}"
            elif stop_loss and (current_price - stop_loss) / stop_loss <= 0.02:
                recommendation = "HOLD"
                urgency        = "MEDIUM"
                reason         = f"Approaching stop loss — monitor closely"
            else:
                recommendation = "HOLD"
                urgency        = "LOW"
                reason         = f"Position within normal range ({pnl_pct:+.1f}% P&L)"

            results.append({
                "position_id":    pos.id,
                "ticker":         pos.ticker,
                "recommendation": recommendation,
                "urgency":        urgency,
                "reason":         reason,
                "current_price":  current_price,
                "pnl_pct":        round(pnl_pct, 2),
                "hold_days":      hold_days,
            })

        except Exception as e:
            results.append({
                "position_id":    pos.id,
                "ticker":         pos.ticker,
                "recommendation": "HOLD",
                "urgency":        "LOW",
                "reason":         f"Could not fetch price: {e}",
                "current_price":  None,
                "pnl_pct":        None,
                "hold_days":      None,
            })

    return results
