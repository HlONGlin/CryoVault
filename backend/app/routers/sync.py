from fastapi import APIRouter, Depends, HTTPException, status

from ..deps import require_admin
from ..webdav import sync_scheduler

router = APIRouter(
    prefix="/api/admin/sync",
    tags=["sync"],
    dependencies=[Depends(require_admin)],
)


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
