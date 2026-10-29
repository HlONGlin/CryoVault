import ipaddress
import mimetypes
import socket
import tempfile
from email.message import Message
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import operations
from ..config import settings
from ..database import get_db
from ..deps import require_admin
from ..schemas import DirectInfo, FileDetail, to_file_out

router = APIRouter(
    prefix="/api/direct",
    tags=["direct"],
    dependencies=[Depends(require_admin)],
)


class LinkImportPayload(BaseModel):
    url: str = Field(min_length=8, max_length=4096)
    name: str = Field(default="", max_length=512)


def _validate_public_url(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only HTTP and HTTPS links are supported")
    if parsed.username or parsed.password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "URLs containing credentials are not allowed")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)}
    except OSError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not resolve the link host") from exc
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Links to private or local network addresses are not allowed")
    return url


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
    with httpx.Client(timeout=timeout, follow_redirects=False) as client:
        for redirect in range(6):
            _validate_public_url(current)
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
    group = operations.get_system_group(db)
    return DirectInfo(
        group_id=group.id,
        files=[to_file_out(f) for f in group.files],
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
    group = operations.get_system_group(db)
    created = [operations.save_upload(db, group, upload) for upload in files]
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
            file = operations.save_path(db, operations.get_system_group(db), path, name, content_type)
            return to_file_out(file)
        except httpx.HTTPError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not download the source link: {exc}") from exc
    finally:
        path.unlink(missing_ok=True)
