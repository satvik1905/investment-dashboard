from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from typing import List

from ..database import get_db
from ..models import Position, Journal
from ..schemas import PositionCreate, PositionClose, PositionResponse
from ..services.position_monitor import monitor_positions

router = APIRouter()


@router.get("", response_model=List[PositionResponse])
def get_positions(db: Session = Depends(get_db)):
    """All open positions."""
    return db.query(Position).filter(Position.status == "OPEN").order_by(Position.entry_date.desc()).all()


@router.post("", response_model=PositionResponse)
def add_position(position: PositionCreate, db: Session = Depends(get_db)):
    """Log a new trade entry."""
    db_pos = Position(**position.model_dump())
    db.add(db_pos)
    db.commit()
    db.refresh(db_pos)
    return db_pos


@router.put("/{position_id}/close", response_model=PositionResponse)
def close_position(position_id: int, close_data: PositionClose, db: Session = Depends(get_db)):
    """Close a position and write it to the journal."""
    pos = db.query(Position).filter(Position.id == position_id).first()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    if pos.status != "OPEN":
        raise HTTPException(status_code=400, detail="Position already closed")

    pos.exit_price  = close_data.exit_price
    pos.exit_date   = date.today()
    pos.exit_reason = close_data.exit_reason
    pos.status      = "CLOSED"

    entry  = float(pos.entry_price)
    exit_p = float(close_data.exit_price)
    pnl     = round((exit_p - entry) * pos.quantity, 2)
    pnl_pct = round((exit_p - entry) / entry * 100, 2) if entry != 0 else 0.0
    hold_days = (date.today() - pos.entry_date).days if pos.entry_date else 0
    outcome = "WIN" if pnl > 0 else ("LOSS" if pnl < 0 else "BREAKEVEN")

    journal_entry = Journal(
        ticker=pos.ticker,
        direction="LONG",
        entry_price=pos.entry_price,
        exit_price=close_data.exit_price,
        quantity=pos.quantity,
        entry_date=pos.entry_date,
        exit_date=date.today(),
        pnl=round(pnl, 2),
        pnl_percent=round(pnl_pct, 2),
        hold_days=hold_days,
        outcome=outcome,
        notes=close_data.exit_reason,
    )
    db.add(journal_entry)
    db.commit()
    db.refresh(pos)
    return pos


@router.get("/alerts")
def get_position_alerts(db: Session = Depends(get_db)):
    """Check all open positions against stop-loss and target levels."""
    return monitor_positions(db)
