from fastapi import Cookie, HTTPException, status

from .config import settings
from .security import session_matches


async def require_admin(
    session: str | None = Cookie(default=None, alias=settings.session_cookie),
) -> None:
    """Guard admin endpoints with the HttpOnly session cookie.

    The raw admin token is only accepted by ``POST /api/admin/session``, which
    is rate limited. Every other admin endpoint therefore cannot be used as an
    unlimited brute-force oracle.
    """
    if not settings.admin_token:
        return
    if session_matches(session):
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing admin session",
    )
