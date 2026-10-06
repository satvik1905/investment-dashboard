import logging
import os

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")


class InviteRequest(BaseModel):
    email: EmailStr


@router.post("/invite")
async def invite_user(body: InviteRequest, request: Request):
    """
    Invite a new user via the Supabase Admin API.
    Only the admin (ADMIN_EMAIL) can call this endpoint.
    The endpoint is already behind the global require_auth dependency,
    so the caller must be authenticated.
    """

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=503,
            detail="Supabase is not configured on this server",
        )

    # Check that the caller is the admin
    caller_email = getattr(request.state, "user_email", None)
    if not ADMIN_EMAIL:
        raise HTTPException(
            status_code=403,
            detail="ADMIN_EMAIL is not configured; invites are disabled",
        )
    if not caller_email or caller_email.lower() != ADMIN_EMAIL.lower():
        raise HTTPException(
            status_code=403,
            detail="Only the admin can invite new users",
        )

    # Call Supabase Admin invite API
    invite_url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/invite"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"email": body.email}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(invite_url, json=payload, headers=headers)
    except httpx.RequestError as exc:
        logger.error("AUTH: Failed to reach Supabase invite API: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Failed to reach Supabase invite API",
        )

    if resp.status_code >= 400:
        logger.error(
            "AUTH: Supabase invite failed (%d): %s",
            resp.status_code,
            resp.text,
        )
        raise HTTPException(
            status_code=resp.status_code,
            detail=resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text,
        )

    logger.info("AUTH: Invited %s via Supabase", body.email)
    return resp.json()
