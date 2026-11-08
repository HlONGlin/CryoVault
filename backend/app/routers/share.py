from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from .. import operations
from ..database import get_db
from ..models import Folder, Group, Share
from ..responses import serve_file
from ..schemas import ShareInfo, TextContent, TextUpdate, to_file_out
from ..share_security import resolve_share, shared_file

router = APIRouter(prefix="/api/share", tags=["share"])


def resolve_group(token: str, db: Session, request: Request) -> Group:
    if db.query(Share.id).filter(Share.token == token).first():
        resolve_share(db, token, request)
    group = db.query(Group).filter(Group.share_token == token).first()
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share link not found")
    if not group.is_system:
        folder_id = db.execute(text("SELECT folder_id FROM legacy_group_folders WHERE group_id=:id"),
                               {"id": group.id}).scalar()
        if folder_id is None or db.get(Folder, folder_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Share link not found")
    return group


def resolve_group_file(token: str, file_id: int, db: Session, request: Request):
    group = resolve_group(token, db, request)
    file = operations.get_file_or_404(db, file_id)
    if file.group_id != group.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    unified = db.query(Share).filter(Share.token == token).first()
    if unified is not None:
        shared_file(db, unified, file_id)
    return group, file


def require_edit(group: Group) -> None:
    if not group.allow_edit:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Editing is disabled for this share")


@router.get("/{token}", response_model=ShareInfo)
def share_info(token: str, request: Request, db: Session = Depends(get_db)):
    group = resolve_group(token, db, request)
    return ShareInfo(
        name=group.name,
        description=group.description,
        share_token=group.share_token,
        allow_edit=group.allow_edit,
    )


@router.get("/{token}/files")
def share_files(token: str, request: Request, db: Session = Depends(get_db)):
    group = resolve_group(token, db, request)
    unified = db.query(Share).filter(Share.token == token).first()
    result = []
    for file in group.files:
        try:
            if unified is not None:
                shared_file(db, unified, file.id)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            continue
        result.append(to_file_out(file))
    return result


@router.get("/{token}/files/{file_id}/download")
def share_download(token: str, file_id: int, request: Request, db: Session = Depends(get_db)):
    _, file = resolve_group_file(token, file_id, db, request)
    return serve_file(
        operations.stored_path(file), request, file.mime_type, filename=file.name
    )


@router.get("/{token}/files/{file_id}/raw")
def share_raw(token: str, file_id: int, request: Request, db: Session = Depends(get_db)):
    _, file = resolve_group_file(token, file_id, db, request)
    return serve_file(
        operations.stored_path(file), request, file.mime_type, inline=True
    )


@router.get("/{token}/files/{file_id}/content", response_model=TextContent)
def share_content(token: str, file_id: int, request: Request, db: Session = Depends(get_db)):
    _, file = resolve_group_file(token, file_id, db, request)
    return TextContent(
        name=file.name,
        content=operations.read_text(file),
        updated_at=file.updated_at,
        etag=operations.text_etag(file),
    )


@router.put("/{token}/files/{file_id}/content", response_model=TextContent)
def share_update_content(
    token: str, file_id: int, payload: TextUpdate, request: Request, db: Session = Depends(get_db)
):
    group, file = resolve_group_file(token, file_id, db, request)
    require_edit(group)
    file = operations.write_text(db, file, payload.content, payload.etag)
    return TextContent(name=file.name, content=payload.content, updated_at=file.updated_at, etag=operations.text_etag(file))
