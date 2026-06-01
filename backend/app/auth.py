import logging
import os
import secrets

from dotenv import load_dotenv
from fastapi import HTTPException, Request

load_dotenv()

logger = logging.getLogger(__name__)

_PASSWORD = os.getenv("SWINGIQ_PASSWORD", "")

if _PASSWORD:
    logger.warning("AUTH GATE: ON")
else:
    logger.warning("AUTH GATE: OFF (SWINGIQ_PASSWORD not set)")


async def require_auth(request: Request):
    """App-level dependency. Skipped when SWINGIQ_PASSWORD is unset/empty."""
    if not _PASSWORD:
        return
    token = request.headers.get("X-SwingIQ-Key", "")
    if not secrets.compare_digest(token, _PASSWORD):
        raise HTTPException(status_code=401, detail="Unauthorized")
