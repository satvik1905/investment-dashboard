import logging
import os
import secrets
from typing import Optional

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import HTTPException, Request

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SUPABASE_URL: Optional[str] = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY: Optional[str] = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
ADMIN_EMAIL: Optional[str] = os.getenv("ADMIN_EMAIL")

# Legacy password-based auth (fallback for local dev)
_PASSWORD: str = os.getenv("SWINGIQ_PASSWORD", "")

# ---------------------------------------------------------------------------
# JWKS cache (populated once on first auth request)
# ---------------------------------------------------------------------------
_jwks_keys: list[dict] = []
_jwks_loaded: bool = False


async def _load_jwks() -> None:
    """Fetch the JWKS from Supabase and cache the keys in memory."""
    global _jwks_keys, _jwks_loaded
    if _jwks_loaded:
        return
    if not SUPABASE_URL:
        return

    jwks_url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(jwks_url)
            resp.raise_for_status()
            data = resp.json()
            _jwks_keys = data.get("keys", [])
            _jwks_loaded = True
            logger.info("AUTH: JWKS loaded from Supabase (%d keys)", len(_jwks_keys))
    except Exception as exc:
        logger.error("AUTH: Failed to fetch JWKS from %s: %s", jwks_url, exc)
        raise HTTPException(
            status_code=503,
            detail="Unable to fetch authentication keys from Supabase",
        )


def _get_signing_key(token: str) -> jwt.algorithms.RSAAlgorithm:
    """Find the correct public key from the cached JWKS for the given token."""
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.DecodeError:
        raise HTTPException(status_code=401, detail="Invalid token header")

    kid = unverified_header.get("kid")
    for key_data in _jwks_keys:
        if key_data.get("kid") == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(key_data)

    # If no kid match, try the first key (some Supabase setups use a single key)
    if _jwks_keys:
        return jwt.algorithms.RSAAlgorithm.from_jwk(_jwks_keys[0])

    raise HTTPException(status_code=401, detail="No matching signing key found")


# ---------------------------------------------------------------------------
# Startup log
# ---------------------------------------------------------------------------
if SUPABASE_URL:
    logger.warning("AUTH: Supabase JWT mode")
elif _PASSWORD:
    logger.warning("AUTH GATE: ON (legacy password mode)")
else:
    logger.warning("AUTH GATE: OFF (no auth configured)")


# ---------------------------------------------------------------------------
# Main auth dependency
# ---------------------------------------------------------------------------
async def require_auth(request: Request):
    """
    App-level FastAPI dependency.

    - If SUPABASE_URL is set: verify the Bearer JWT from the Authorization header.
    - Otherwise, fall back to legacy X-SwingIQ-Key password check.
    - If neither is configured, auth is effectively disabled (local dev).
    """

    # ----- Supabase JWT mode -----
    if SUPABASE_URL:
        await _load_jwks()

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing Bearer token")

        token = auth_header[len("Bearer "):]
        if not token:
            raise HTTPException(status_code=401, detail="Empty Bearer token")

        public_key = _get_signing_key(token)

        try:
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                options={
                    "verify_exp": True,
                    "verify_aud": False,  # Supabase audience varies by project
                },
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.InvalidTokenError as exc:
            raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")

        # Populate request state for downstream use
        request.state.user_id = payload.get("sub")
        request.state.user_email = payload.get("email")
        return

    # ----- Legacy password mode -----
    if _PASSWORD:
        token = request.headers.get("X-SwingIQ-Key", "")
        if not secrets.compare_digest(token, _PASSWORD):
            raise HTTPException(status_code=401, detail="Unauthorized")
        return

    # ----- No auth (local dev) -----
    return
