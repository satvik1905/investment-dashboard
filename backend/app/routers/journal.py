from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from ..database import get_db
from ..models import Journal
from ..schemas import JournalResponse, JournalAnalytics

router = APIRouter()


@router.get("", response_model=List[JournalResponse])
def get_journal(db: Session = Depends(get_db)):
    """All closed trades, most recent first."""
    return db.query(Journal).order_by(Journal.exit_date.desc()).all()


@router.get("/analytics", response_model=JournalAnalytics)
def get_analytics(db: Session = Depends(get_db)):
    """Win rate, total P&L, and performance statistics."""
    trades = db.query(Journal).all()

    if not trades:
        return JournalAnalytics(
            total_trades=0,
            wins=0,
            losses=0,
            breakeven=0,
            win_rate=0.0,
            total_pnl=0.0,
            avg_pnl_per_trade=0.0,
            avg_hold_days=0.0,
        )

    wins = sum(1 for t in trades if t.outcome == "WIN")
    losses = sum(1 for t in trades if t.outcome == "LOSS")
    breakeven = sum(1 for t in trades if t.outcome == "BREAKEVEN")
    total_pnl = sum(float(t.pnl) for t in trades if t.pnl is not None)
    avg_pnl = total_pnl / len(trades)
    hold_days = [t.hold_days for t in trades if t.hold_days is not None]
    avg_hold = sum(hold_days) / len(hold_days) if hold_days else 0
    pnls = [float(t.pnl) for t in trades if t.pnl is not None]
    win_rate = (wins / len(trades) * 100) if trades else 0

    return JournalAnalytics(
        total_trades=len(trades),
        wins=wins,
        losses=losses,
        breakeven=breakeven,
        win_rate=round(win_rate, 1),
        total_pnl=round(total_pnl, 2),
        avg_pnl_per_trade=round(avg_pnl, 2),
        avg_hold_days=round(avg_hold, 1),
        best_trade=max(pnls) if pnls else None,
        worst_trade=min(pnls) if pnls else None,
    )
