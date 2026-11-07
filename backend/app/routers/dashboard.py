from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date

from ..auth import current_user_id
from ..database import get_db
from ..models import Signal, Position, Journal
from ..schemas import DashboardResponse, SignalResponse, PositionResponse

router = APIRouter()


@router.get("", response_model=DashboardResponse)
def get_dashboard(user_id: str = Depends(current_user_id), db: Session = Depends(get_db)):
    """Single endpoint that returns everything the dashboard needs."""
    today = date.today()

    # Today's signals (or most recent)
    signals = (
        db.query(Signal)
        .filter(Signal.user_id == user_id)
        .filter(func.date(Signal.generated_at) == today)
        .order_by(Signal.confidence.desc())
        .all()
    )
    if not signals:
        latest_ts = db.query(func.max(Signal.generated_at)).filter(Signal.user_id == user_id).scalar()
        if latest_ts:
            signals = (
                db.query(Signal)
                .filter(Signal.user_id == user_id)
                .filter(func.date(Signal.generated_at) == latest_ts.date())
                .order_by(Signal.confidence.desc())
                .all()
            )

    # Open positions
    positions = db.query(Position).filter(Position.user_id == user_id, Position.status == "OPEN").all()

    # P&L from journal
    journal_entries = db.query(Journal).filter(Journal.user_id == user_id).all()
    total_pnl = sum(float(t.pnl) for t in journal_entries if t.pnl is not None)
    wins = sum(1 for t in journal_entries if t.outcome == "WIN")
    win_rate = (wins / len(journal_entries) * 100) if journal_entries else 0.0

    return DashboardResponse(
        signals_today=signals,
        open_positions=positions,
        total_pnl=round(total_pnl, 2),
        win_rate=round(win_rate, 1),
    )
