from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import require_admin
from ..models import FileItem, Folder, Group, Share
from ..responses import serve_file
from ..schemas import TextContent, TextUpdate, to_file_out
from ..security import login_limiter
from ..share_security import (
    contains_folder, cookie_name, cookie_valid, cookie_value, hash_password, resolve_share,
    shared_file, verify_password,
)
from .folders import list_contents

admin_router = APIRouter(prefix="/api/shares", tags=["shares"], dependencies=[Depends(require_admin)])
public_router = APIRouter(prefix="/api/public/shares", tags=["public shares"])


class ShareCreate(BaseModel):
    target_type: str = Field(pattern="^(file|folder)$")
    file_id: int | None = None
    folder_id: int | None = None
    allow_edit: bool = False
    expires_at: datetime | None = None
    password: str | None = Field(default=None, max_length=1024)


class ShareUpdate(BaseModel):
    allow_edit: bool | None = None
    expires_at: datetime | None = None
    password: str | None = Field(default=None, max_length=1024)


class PasswordPayload(BaseModel):
    password: str = Field(max_length=1024)


def share_out(share: Share):
    target = share.file if share.target_type == "file" else share.folder
    return {
        "id": share.id, "token": share.token, "target_type": share.target_type,
        "file_id": share.file_id, "folder_id": share.folder_id,
        "name": target.name if target is not None else "根目录",
        "allow_edit": share.allow_edit, "expires_at": share.expires_at,
        "password_required": bool(share.password_hash), "created_at": share.created_at,
    }


def _utc_naive(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


@admin_router.get("")
def list_shares(db: Session = Depends(get_db)):
    return [share_out(share) for share in db.query(Share).order_by(Share.created_at.desc()).all()]


@admin_router.post("", status_code=201)
def create_share(payload: ShareCreate, db: Session = Depends(get_db)):
    if payload.target_type == "file":
        if payload.file_id is None or payload.folder_id is not None or db.get(FileItem, payload.file_id) is None:
            raise HTTPException(404, "File not found")
    elif payload.file_id is not None or payload.folder_id is None or db.get(Folder, payload.folder_id) is None:
        raise HTTPException(404, "Folder not found")
    share = Share(target_type=payload.target_type, file_id=payload.file_id,
                  folder_id=payload.folder_id, allow_edit=payload.allow_edit,
                  expires_at=_utc_naive(payload.expires_at),
                  password_hash=hash_password(payload.password) if payload.password else None)
    db.add(share)
    db.commit()
    db.refresh(share)
    return share_out(share)


@admin_router.patch("/{share_id}")
def update_share(share_id: int, payload: ShareUpdate, db: Session = Depends(get_db)):
    share = db.get(Share, share_id)
    if share is None:
        raise HTTPException(404, "Share not found")
    if "allow_edit" in payload.model_fields_set and payload.allow_edit is not None:
        share.allow_edit = payload.allow_edit
        from ..models import FileShare, Group
        legacy_file = db.query(FileShare).filter(FileShare.share_token == share.token).first()
        legacy_group = db.query(Group).filter(Group.share_token == share.token).first()
        if legacy_file:
            legacy_file.allow_edit = payload.allow_edit
        if legacy_group:
            legacy_group.allow_edit = payload.allow_edit
    if "expires_at" in payload.model_fields_set:
        share.expires_at = _utc_naive(payload.expires_at)
    if "password" in payload.model_fields_set:
        share.password_hash = hash_password(payload.password) if payload.password else None
    db.commit()
    return share_out(share)


@admin_router.delete("/{share_id}", status_code=204)
def delete_share(share_id: int, db: Session = Depends(get_db)):
    share = db.get(Share, share_id)
    if share is None:
        raise HTTPException(404, "Share not found")
    # Legacy share records are removed or rotated in the same transaction.
    from ..models import FileShare, Group, gen_token
    legacy_file = db.query(FileShare).filter(FileShare.share_token == share.token).first()
    if legacy_file:
        db.delete(legacy_file)
    legacy_group = db.query(Group).filter(Group.share_token == share.token).first()
    if legacy_group:
        legacy_group.share_token = gen_token()
    db.delete(share)
    db.commit()


@public_router.get("/{token}")
def public_info(token: str, request: Request, db: Session = Depends(get_db)):
    share = resolve_share(db, token, request, allow_locked=True)
    if share.password_hash and not cookie_valid(share, request.cookies.get(cookie_name(share), "")):
        return {"password_required": True}
    return {**share_out(share), "file": to_file_out(share.file) if share.file else None}


@public_router.post("/{token}/unlock")
def unlock_share(token: str, payload: PasswordPayload, request: Request, response: Response,
                 db: Session = Depends(get_db)):
    share = resolve_share(db, token, request, allow_locked=True)
    if not share.password_hash:
        return {"ok": True}
    key = "share:" + (request.client.host if request.client else "unknown") + ":" + token
    if login_limiter.blocked(key):
        raise HTTPException(429, "Too many failed attempts")
    if not verify_password(payload.password, share.password_hash):
        login_limiter.record_failure(key)
        raise HTTPException(403, "Invalid share password")
    login_limiter.reset(key)
    response.set_cookie(cookie_name(share), cookie_value(share), max_age=3600, path="/api",
                        httponly=True, samesite="strict", secure=settings.cookie_secure)
    return {"ok": True}


@public_router.get("/{token}/folders")
def public_listing(token: str, request: Request, folder_id: int | None = None,
                   page: int = 1, page_size: int = 100, sort: str = "name",
                   order: str = "asc", q: str = "", db: Session = Depends(get_db)):
    share = resolve_share(db, token, request)
    if share.target_type != "folder":
        raise HTTPException(404, "Folder not found")
    if share.folder_id is None:
        legacy = db.query(Group).filter(Group.share_token == token, Group.is_system.is_(True)).first()
        if legacy is None or folder_id is not None:
            raise HTTPException(404, "Folder not found")
        query = db.query(FileItem).filter(FileItem.group_id == legacy.id, FileItem.folder_id.is_(None))
        if q:
            query = query.filter(FileItem.name.contains(q, autoescape=True))
        if page < 1 or page_size < 1 or page_size > 500:
            raise HTTPException(422, "Invalid pagination")
        total = query.count()
        rows = query.order_by(FileItem.name, FileItem.id).offset((page - 1) * page_size).limit(page_size).all()
        return {"items": [{"type": "file", **to_file_out(row).model_dump()} for row in rows],
                "page": page, "page_size": page_size, "total": total}
    target = share.folder_id if folder_id is None else folder_id
    if not contains_folder(db, share.folder_id, target):
        raise HTTPException(404, "Folder not found")
    if page < 1 or page_size < 1 or page_size > 500:
        raise HTTPException(422, "Invalid pagination")
    return list_contents(target, page, page_size, sort, order, q, db)


@public_router.get("/{token}/files/{file_id}/{action}")
def public_file(token: str, file_id: int, action: str, request: Request, db: Session = Depends(get_db)):
    from .. import operations
    share = resolve_share(db, token, request)
    file = shared_file(db, share, file_id)
    if action == "content":
        return TextContent(name=file.name, content=operations.read_text(file),
                           updated_at=file.updated_at, etag=operations.text_etag(file))
    if action not in ("raw", "download"):
        raise HTTPException(404, "Not found")
    return serve_file(operations.stored_path(file), request, file.mime_type,
                      filename=file.name if action == "download" else None, inline=action == "raw")


@public_router.put("/{token}/files/{file_id}/content", response_model=TextContent)
def public_update_content(token: str, file_id: int, payload: TextUpdate, request: Request,
                          db: Session = Depends(get_db)):
    from .. import operations
    share = resolve_share(db, token, request)
    if not share.allow_edit:
        raise HTTPException(403, "Editing is disabled for this share")
    file = shared_file(db, share, file_id)
    file = operations.write_text(db, file, payload.content, payload.etag)
    return TextContent(name=file.name, content=payload.content, updated_at=file.updated_at,
                       etag=operations.text_etag(file))
