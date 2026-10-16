from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .. import operations
from ..database import get_db
from ..models import Group
from ..responses import serve_file
from ..schemas import ShareInfo, TextContent, TextUpdate, to_file_out

router = APIRouter(prefix="/api/share", tags=["share"])


def resolve_group(token: str, db: Session) -> Group:
    group = db.query(Group).filter(Group.share_token == token).first()
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share link not found")
    return group


def resolve_group_file(token: str, file_id: int, db: Session):
    group = resolve_group(token, db)
    file = operations.get_file_or_404(db, file_id)
    if file.group_id != group.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return group, file


def require_edit(group: Group) -> None:
    if not group.allow_edit:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Editing is disabled for this share")


@router.get("/{token}", response_model=ShareInfo)
def share_info(token: str, db: Session = Depends(get_db)):
    group = resolve_group(token, db)
    return ShareInfo(
        name=group.name,
        description=group.description,
        share_token=group.share_token,
        allow_edit=group.allow_edit,
    )


@router.get("/{token}/files")
def share_files(token: str, db: Session = Depends(get_db)):
    group = resolve_group(token, db)
    return [to_file_out(f) for f in group.files]


@router.get("/{token}/files/{file_id}/download")
def share_download(token: str, file_id: int, request: Request, db: Session = Depends(get_db)):
    _, file = resolve_group_file(token, file_id, db)
    return serve_file(
        operations.stored_path(file), request, file.mime_type, filename=file.name
    )


@router.get("/{token}/files/{file_id}/raw")
def share_raw(token: str, file_id: int, request: Request, db: Session = Depends(get_db)):
    _, file = resolve_group_file(token, file_id, db)
    return serve_file(
        operations.stored_path(file), request, file.mime_type, inline=True
    )


@router.get("/{token}/files/{file_id}/content", response_model=TextContent)
def share_content(token: str, file_id: int, db: Session = Depends(get_db)):
    _, file = resolve_group_file(token, file_id, db)
    return TextContent(
        name=file.name,
        content=operations.read_text(file),
        updated_at=file.updated_at,
    )


@router.put("/{token}/files/{file_id}/content", response_model=TextContent)
def share_update_content(
    token: str, file_id: int, payload: TextUpdate, db: Session = Depends(get_db)
):
    group, file = resolve_group_file(token, file_id, db)
    require_edit(group)
    file = operations.write_text(db, file, payload.content)
    return TextContent(name=file.name, content=payload.content, updated_at=file.updated_at)