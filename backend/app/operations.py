import uuid
import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .config import settings
from .models import FileItem, FileShare, Group
from .storage import is_text

SYSTEM_GROUP_NAME = "单文件分享"


def stored_path(file: FileItem) -> Path:
    return settings.storage_dir / file.stored_name


def get_system_group(db: Session) -> Group:
    group = db.query(Group).filter(Group.is_system.is_(True)).first()
    if group is None:
        group = Group(
            name=SYSTEM_GROUP_NAME,
            description="直接上传并生成链接的单个文件",
            is_system=True,
        )
        db.add(group)
        db.commit()
        db.refresh(group)
    return group


def get_file_share(db: Session, file: FileItem) -> FileShare | None:
    return db.query(FileShare).filter(FileShare.file_id == file.id).first()


def get_share_by_token(db: Session, token: str) -> FileShare | None:
    return db.query(FileShare).filter(FileShare.share_token == token).first()


def ensure_file_share(
    db: Session, file: FileItem, allow_edit: bool | None = None
) -> FileShare:
    share = get_file_share(db, file)
    if share is None:
        share = FileShare(
            file_id=file.id,
            allow_edit=bool(allow_edit),
        )
        db.add(share)
    elif allow_edit is not None:
        share.allow_edit = allow_edit
    db.commit()
    db.refresh(share)
    return share


def revoke_file_share(db: Session, file: FileItem) -> None:
    share = get_file_share(db, file)
    if share is not None:
        db.delete(share)
        db.commit()


def get_group_or_404(db: Session, group_id: int) -> Group:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")
    return group


def get_file_or_404(db: Session, file_id: int) -> FileItem:
    file = db.get(FileItem, file_id)
    if file is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return file


def save_upload(db: Session, group: Group, upload: UploadFile) -> FileItem:
    raw_name = (upload.filename or "untitled").replace("\\", "/")
    original_name = raw_name.rsplit("/", 1)[-1].strip() or "untitled"
    stored_name = uuid.uuid4().hex
    dest = settings.storage_dir / stored_name

    size = 0
    with dest.open("wb") as out:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if settings.max_upload_size and size > settings.max_upload_size:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    "File exceeds the configured upload limit",
                )
            out.write(chunk)

    file = FileItem(
        group_id=group.id,
        name=original_name,
        stored_name=stored_name,
        size=size,
        mime_type=upload.content_type or "application/octet-stream",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def save_path(
    db: Session,
    group: Group,
    source: Path,
    name: str,
    mime_type: str = "application/octet-stream",
) -> FileItem:
    size = source.stat().st_size
    if settings.max_upload_size and size > settings.max_upload_size:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "File exceeds the configured upload limit",
        )
    raw_name = (name or "untitled").replace("\\", "/")
    original_name = raw_name.rsplit("/", 1)[-1].strip() or "untitled"
    stored_name = uuid.uuid4().hex
    destination = settings.storage_dir / stored_name
    shutil.move(str(source), str(destination))
    file = FileItem(
        group_id=group.id,
        name=original_name,
        stored_name=stored_name,
        size=size,
        mime_type=mime_type or "application/octet-stream",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def delete_file(db: Session, file: FileItem) -> None:
    stored_path(file).unlink(missing_ok=True)
    db.delete(file)
    db.commit()


def read_text(file: FileItem) -> str:
    if not is_text(file.name, file.mime_type):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is not a text file")
    if file.size > settings.max_text_edit_size:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "Text file is too large to open in the editor",
        )
    try:
        return stored_path(file).read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "File is not valid UTF-8 text"
        )


def write_text(db: Session, file: FileItem, content: str) -> FileItem:
    if not is_text(file.name, file.mime_type):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is not a text file")

    data = content.encode("utf-8")
    if len(data) > settings.max_text_edit_size:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "Text file is too large to save",
        )

    path = stored_path(file)
    tmp = path.with_name(f"{path.name}.tmp")
    tmp.write_bytes(data)
    tmp.replace(path)

    file.size = len(data)
    file.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(file)
    return file


def rename_file(db: Session, file: FileItem, new_name: str) -> FileItem:
    cleaned = new_name.replace("\\", "/").rsplit("/", 1)[-1].strip()
    if cleaned:
        file.name = cleaned
        db.commit()
        db.refresh(file)
    return file


def purge_group_files(group: Group) -> None:
    for file in group.files:
        stored_path(file).unlink(missing_ok=True)
