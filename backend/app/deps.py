from fastapi import Header, HTTPException, Query, status

from .config import settings


async def require_admin(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    token: str | None = Query(default=None),
) -> None:
    """Guard admin endpoints.

    The token may be sent via the ``X-Admin-Token`` header (used by fetch calls)
    or the ``token`` query parameter (used by ``<img>`` / ``<video>`` sources that
    cannot set custom headers). No-op when CRYOVAULT_ADMIN_TOKEN is unset.
    """
    if not settings.admin_token:
        return
    if x_admin_token == settings.admin_token or token == settings.admin_token:
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing admin token",
    )
