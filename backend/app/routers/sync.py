from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..settings_store import get_or_create, public_settings, update_settings
from ..webdav import sync_scheduler

router = APIRouter(
    prefix="/api/admin/sync",
    tags=["sync"],
    dependencies=[Depends(require_admin)],
)


class WebDavSettingsPayload(BaseModel):
    enabled: bool
    url: str = Field(default="", max_length=2048)
    username: str = Field(default="", max_length=512)
    password: str = Field(default="", max_length=4096)
    clear_password: bool = False
    root: str = Field(default="/CryoVault", max_length=1024)
    interval_seconds: int = Field(default=900, ge=0, le=604800)
    conflict_policy: str = Field(default="keep_both", pattern="^(keep_both|local_wins|remote_wins)$")
    verify_tls: bool = True
    timeout: int = Field(default=60, ge=5, le=600)

    def validate_url(self) -> None:
        if self.url:
            from urllib.parse import urlparse

            parsed = urlparse(self.url)
            if (
                parsed.scheme not in ("http", "https")
                or not parsed.hostname
                or parsed.username
                or parsed.password
            ):
                raise ValueError("WebDAV URL must use HTTP or HTTPS")


@router.get("/settings")
def get_sync_settings(db: Session = Depends(get_db)):
    return public_settings(get_or_create(db))


@router.put("/settings")
def save_sync_settings(payload: WebDavSettingsPayload, db: Session = Depends(get_db)):
    try:
        payload.validate_url()
        row = update_settings(db, payload.model_dump())
        sync_scheduler.restart()
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    return public_settings(row)


@router.get("/status")
def sync_status():
    return sync_scheduler.status()


@router.post("/test")
def test_sync_connection():
    try:
        from ..webdav import sync_engine

        sync_engine.test_connection()
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"WebDAV connection failed: {exc}") from exc
    return {"ok": True}


@router.post("/run")
def run_sync():
    report = sync_scheduler.run_once()
    if report is None:
        detail = sync_scheduler.last_error or "WebDAV synchronization failed"
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail)
    return {"ok": True, "report": report}
