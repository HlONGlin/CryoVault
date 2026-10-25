import json
import os
import subprocess
import sys

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import version as versions
from ..config import settings
from ..deps import require_admin

router = APIRouter(prefix="/api/admin/update", tags=["update"])

UPDATE_MODULE = "app.updater"


class UpdateInfo(BaseModel):
    current: str
    latest: str | None
    update_available: bool
    can_apply: bool
    reason: str | None = None
    tag: str | None = None
    url: str | None = None
    notes: str | None = None
    published_at: str | None = None
    error: str | None = None
    cached: bool = False


def _can_apply() -> tuple[bool, str | None]:
    if not settings.update_enabled:
        return False, "当前部署未启用在线更新，请使用一键安装脚本重新安装后重试。"
    if sys.platform != "linux":
        return False, "在线更新仅在 Linux + systemd 部署下可用。"
    if not (settings.update_command or "").strip():
        return False, "未配置 CRYOVAULT_UPDATE_COMMAND，请重新运行一键安装脚本。"
    return True, None


def _build_info(force: bool, cached: bool) -> UpdateInfo:
    current = versions.running_version()
    lookup = versions.latest_release(force=force)
    can_apply, reason = _can_apply()
    release = lookup.release
    if release is None:
        return UpdateInfo(
            current=current,
            latest=None,
            update_available=False,
            can_apply=can_apply,
            reason=reason,
            error=lookup.error,
            cached=cached,
        )
    return UpdateInfo(
        current=current,
        latest=release.version,
        update_available=versions.is_newer(release.version, current),
        can_apply=can_apply,
        reason=reason,
        tag=release.tag,
        url=release.url,
        notes=release.notes,
        published_at=release.published_at,
        cached=cached,
    )


@router.get("", response_model=UpdateInfo)
def check_update(force: bool = False):
    """Report the running version and whether a newer release exists."""
    return _build_info(force=force, cached=not force)


@router.get("/refresh", response_model=UpdateInfo)
def refresh_update():
    """Bypass the cache and query upstream again."""
    return _build_info(force=True, cached=False)


@router.get("/stream", dependencies=[Depends(require_admin)])
def stream_update():
    """Run the updater and stream its progress as Server-Sent Events."""
    can_apply, reason = _can_apply()
    if not can_apply:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=reason)

    def events():
        # Record the PID of the server process that handles the admin session.
        # Multi-worker deployments spawn us from a child Popen; the updater
        # waits for this process to exit before swapping the program files.
        parent = subprocess.run(
            ["ps", "-o", "ppid=", "-p", str(os.getpid())],
            capture_output=True,
            text=True,
            check=False,
        ).stdout.strip()
        env_extra = {"CRYOVAULT_UPDATE_PID": parent or str(os.getpid())}
        try:
            process = subprocess.Popen(
                [sys.executable, "-u", "-m", UPDATE_MODULE],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                env={**os.environ, "PYTHONUNBUFFERED": "1", **env_extra},
            )
        except OSError as exc:
            yield _sse("error", message=f"无法启动更新进程：{exc}")
            return

        assert process.stdout is not None
        try:
            for raw in iter(process.stdout.readline, b""):
                line = raw.decode("utf-8", errors="replace").rstrip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except ValueError:
                    yield _sse("log", message=line)
                    continue
                event = str(payload.pop("event", "log"))
                yield _sse(event, **payload)
        finally:
            if process.poll() is None:
                process.kill()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


def _sse(event: str, **payload) -> str:
    return f"data: {json.dumps({'event': event, **payload}, ensure_ascii=False)}\n\n"
