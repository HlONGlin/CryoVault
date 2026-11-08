from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .. import operations
from ..database import get_db
from ..models import Share
from ..responses import serve_file
from ..share_security import resolve_share as resolve_unified_share
from ..schemas import (
    PublicFileShare,
    TextContent,
    TextUpdate,
    to_public_file_share,
)

router = APIRouter(prefix="/api/file-share", tags=["file-share"])


def resolve_share(token: str, db: Session, request: Request):
    if db.query(Share.id).filter(Share.token == token).first():
        resolve_unified_share(db, token, request)
    share = operations.get_share_by_token(db, token)
    if share is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share link not found")
    return share


@router.get("/{token}", response_model=PublicFileShare)
def share_info(token: str, request: Request, db: Session = Depends(get_db)):
    return to_public_file_share(resolve_share(token, db, request))


@router.get("/{token}/download")
def share_download(token: str, request: Request, db: Session = Depends(get_db)):
    share = resolve_share(token, db, request)
    return serve_file(
        operations.stored_path(share.file),
        request,
        share.file.mime_type,
        filename=share.file.name,
    )


@router.get("/{token}/raw")
def share_raw(token: str, request: Request, db: Session = Depends(get_db)):
    share = resolve_share(token, db, request)
    return serve_file(
        operations.stored_path(share.file),
        request,
        share.file.mime_type,
        inline=True,
    )


@router.get("/{token}/content", response_model=TextContent)
def share_content(token: str, request: Request, db: Session = Depends(get_db)):
    share = resolve_share(token, db, request)
    return TextContent(
        name=share.file.name,
        content=operations.read_text(share.file),
        updated_at=share.file.updated_at,
        etag=operations.text_etag(share.file),
    )


@router.put("/{token}/content", response_model=TextContent)
def share_update_content(
    token: str, payload: TextUpdate, request: Request, db: Session = Depends(get_db)
):
    share = resolve_share(token, db, request)
    if not share.allow_edit:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Editing is disabled for this share"
        )
    file = operations.write_text(db, share.file, payload.content, payload.etag)
    return TextContent(name=file.name, content=payload.content, updated_at=file.updated_at, etag=operations.text_etag(file))
