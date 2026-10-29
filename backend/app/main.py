from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import settings
from .database import SessionLocal, init_db
from .routers import admin, direct, file_share, files, groups, share, sync, update
from .settings_store import load_saved_settings
from .webdav import sync_scheduler


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    load_saved_settings(SessionLocal)
    sync_scheduler.start()
    yield
    sync_scheduler.stop()


_docs = settings.docs_enabled
app = FastAPI(
    title=settings.app_name,
    version=__version__,
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
    openapi_url="/openapi.json" if _docs else None,
    lifespan=lifespan,
)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", "Content-Range", "Accept-Ranges"],
    )

app.include_router(admin.router)
app.include_router(groups.router)
app.include_router(files.router)
app.include_router(share.router)
app.include_router(file_share.router)
app.include_router(direct.router)
app.include_router(sync.router)
app.include_router(update.router)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    return response


@app.get("/api/health")
def health():
    return {"status": "ok", "name": settings.app_name, "version": __version__}


# Optionally serve the built frontend (frontend/dist) for single-service deployment.
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
_dist_root = _dist.resolve()
_PANEL_PLACEHOLDER = "__CRYOVAULT_PANEL_BASE__"
_PUBLIC_PREFIXES = ("s/", "f/")
_INDEX_FILE = _dist / "index.html"
_INDEX_TEMPLATE = (
    _INDEX_FILE.read_text(encoding="utf-8") if _INDEX_FILE.is_file() else ""
)


def _index_html(with_panel: bool) -> HTMLResponse:
    base = settings.normalized_panel_path if with_panel else ""
    return HTMLResponse(
        _INDEX_TEMPLATE.replace(_PANEL_PLACEHOLDER, base),
        headers={"Cache-Control": "no-store"},
    )


def _static_file(relative: str) -> Path | None:
    """Resolve a request path to a file inside dist, or None.

    Guards against path traversal via encoded separators such as
    ``..%2F..%2Fbackend/app/config.py``.
    """
    if not relative or "\x00" in relative:
        return None
    try:
        candidate = (_dist / relative).resolve()
    except (OSError, ValueError):
        return None
    if _dist_root != candidate and _dist_root not in candidate.parents:
        return None
    return candidate if candidate.is_file() else None


if _INDEX_TEMPLATE:
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")

        panel = settings.normalized_panel_path.lstrip("/")
        is_public = full_path.startswith(_PUBLIC_PREFIXES)

        if any(part == ".." for part in full_path.replace("\\", "/").split("/")):
            raise HTTPException(status_code=404, detail="Not found")

        if panel:
            # The admin console only exists under the secret panel path.
            is_panel = full_path == panel or full_path.startswith(panel + "/")
            if not (is_panel or is_public):
                raise HTTPException(status_code=404, detail="Not found")
            relative = full_path[len(panel) :].lstrip("/") if is_panel else full_path
        else:
            is_panel = True
            relative = full_path

        asset = _static_file(relative)
        if asset is not None:
            return FileResponse(asset)
        # Never expose the secret panel path to public share visitors.
        return _index_html(with_panel=is_panel)
