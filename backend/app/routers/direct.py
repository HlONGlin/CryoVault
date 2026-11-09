import ipaddress
import mimetypes
import socket
import tempfile
from email.message import Message
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

import httpx
import httpcore
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import operations
from ..config import settings
from ..database import get_db
from ..deps import require_admin
from ..models import FileItem, Group
from ..schemas import DirectInfo, FileDetail, to_file_out

router = APIRouter(
    prefix="/api/direct",
    tags=["direct"],
    dependencies=[Depends(require_admin)],
)


class LinkImportPayload(BaseModel):
    url: str = Field(min_length=8, max_length=4096)
    name: str = Field(default="", max_length=512)


def _resolve_public_url(url: str) -> tuple[str, str]:
    """Validate a URL and pin it to the address returned by this lookup."""
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only HTTP and HTTPS links are supported")
    if parsed.username or parsed.password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "URLs containing credentials are not allowed")
    try:
        addresses = list(dict.fromkeys(
            item[4][0]
            for item in socket.getaddrinfo(
                parsed.hostname,
                parsed.port or (443 if parsed.scheme == "https" else 80),
                type=socket.SOCK_STREAM,
            )
        ))
    except OSError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not resolve the link host") from exc
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Links to private or local network addresses are not allowed")
    return parsed.hostname.rstrip("."), addresses[0]


def _validate_public_url(url: str) -> str:
    """Backward-compatible validation helper used by smoke tests."""
    _resolve_public_url(url)
    return url


def _normalized_host(host: str) -> str:
    return host.rstrip(".").encode("idna").decode("ascii").lower()


class _PinnedSyncBackend(httpcore.SyncBackend):
    """Connect to a validated IP while retaining the URL hostname."""

    def __init__(self, host: str, address: str) -> None:
        super().__init__()
        self._host = _normalized_host(host)
        self._address = address

    def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        if _normalized_host(host) != self._host:
            raise OSError("Link download attempted to connect to an unexpected host")
        return super().connect_tcp(
            self._address,
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )


class _PinnedTransport(httpx.HTTPTransport):
    def __init__(self, host: str, address: str) -> None:
        # Proxy environment variables must not bypass address validation.
        super().__init__(trust_env=False)
        self._pool._network_backend = _PinnedSyncBackend(host, address)


def _download_name(response: httpx.Response, url: str, requested_name: str) -> str:
    if requested_name.strip():
        return requested_name.strip()
    disposition = response.headers.get("content-disposition", "")
    if disposition:
        message = Message()
        message["content-disposition"] = disposition
        filename = message.get_filename()
        if filename:
            return unquote(filename).replace("\\", "/").rsplit("/", 1)[-1]
    filename = unquote(Path(urlsplit(url).path).name)
    return filename or "download"


def _download_link(url: str, destination: Path) -> tuple[str, str]:
    current = url
    timeout = httpx.Timeout(30.0, connect=10.0)
    for redirect in range(6):
        host, address = _resolve_public_url(current)
        transport = _PinnedTransport(host, address)
        with httpx.Client(timeout=timeout, follow_redirects=False, transport=transport) as client:
            with client.stream("GET", current) as response:
                if response.is_redirect:
                    if redirect == 5:
                        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Too many redirects")
                    location = response.headers.get("location")
                    if not location:
                        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Invalid redirect response")
                    current = urljoin(current, location)
                    continue
                if response.status_code < 200 or response.status_code >= 300:
                    raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Source server returned HTTP {response.status_code}")
                content_length = response.headers.get("content-length")
                if settings.max_upload_size and content_length:
                    try:
                        if int(content_length) > settings.max_upload_size:
                            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds the configured upload limit")
                    except ValueError:
                        pass
                total = 0
                with destination.open("wb") as output:
                    for chunk in response.iter_bytes(1024 * 1024):
                        total += len(chunk)
                        if settings.max_upload_size and total > settings.max_upload_size:
                            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds the configured upload limit")
                        output.write(chunk)
                name = _download_name(response, current, "")
                content_type = response.headers.get("content-type", "").split(";", 1)[0]
                return name, content_type or mimetypes.guess_type(name)[0] or "application/octet-stream"
    raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not download the source link")


@router.get("", response_model=DirectInfo)
def direct_info(db: Session = Depends(get_db)):
    legacy_group = db.query(Group).filter(Group.is_system.is_(True)).first()
    files = (
        db.query(FileItem)
        .filter(FileItem.folder_id.is_(None))
        .order_by(FileItem.created_at.desc(), FileItem.id.desc())
        .all()
    )
    return DirectInfo(
        group_id=legacy_group.id if legacy_group else None,
        files=[to_file_out(f) for f in files],
    )


@router.post(
    "/files",
    response_model=list[FileDetail],
    status_code=status.HTTP_201_CREATED,
)
def upload_direct_files(
    files: list[UploadFile],
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No files provided")
    created = [operations.save_upload(db, None, upload) for upload in files]
    return [to_file_out(f) for f in created]


@router.post("/import", response_model=FileDetail, status_code=status.HTTP_201_CREATED)
def import_direct_link(payload: LinkImportPayload, db: Session = Depends(get_db)):
    temp = tempfile.NamedTemporaryFile(prefix="cryovault-link-", dir=settings.data_dir, delete=False)
    path = Path(temp.name)
    temp.close()
    try:
        try:
            name, content_type = _download_link(payload.url, path)
            if payload.name.strip():
                name = payload.name.strip()
            file = operations.save_path(db, None, path, name, content_type)
            return to_file_out(file)
        except httpx.HTTPError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not download the source link: {exc}") from exc
    finally:
        path.unlink(missing_ok=True)
