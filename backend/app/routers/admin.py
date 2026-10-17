from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Request,
    Response,
    status,
)

from ..config import settings
from ..deps import require_admin
from ..security import login_limiter, session_value, token_matches

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _client_key(request: Request) -> str:
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/status")
def auth_status():
    return {"auth_required": bool(settings.admin_token)}


@router.get("/verify", dependencies=[Depends(require_admin)])
def verify_token():
    return {"ok": True}


@router.post("/session")
def create_session(
    request: Request,
    response: Response,
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
):
    """Exchange the admin token for an HttpOnly session cookie.

    The token is sent once in a header, so it never lands in URLs, access logs
    or browser history.
    """
    if not settings.admin_token:
        return {"ok": True}

    key = _client_key(request)
    if login_limiter.blocked(key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again later.",
            headers={"Retry-After": str(login_limiter.retry_after(key))},
        )

    if not token_matches(x_admin_token):
        login_limiter.record_failure(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token",
        )

    login_limiter.reset(key)
    response.set_cookie(
        key=settings.session_cookie,
        value=session_value(),
        max_age=settings.session_max_age,
        path="/api",
        httponly=True,
        samesite="strict",
        secure=settings.cookie_secure,
    )
    return {"ok": True}


@router.delete("/session")
def delete_session(response: Response):
    response.delete_cookie(
        key=settings.session_cookie,
        path="/api",
        httponly=True,
        samesite="strict",
        secure=settings.cookie_secure,
    )
    return {"ok": True}
