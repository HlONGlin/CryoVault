import uuid
import shutil
import mimetypes
import os
import hashlib
import hmac
import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from .config import settings
from .models import FileItem, FileShare, Folder, Group, Share
from .storage import is_text

SYSTEM_GROUP_NAME = "单文件分享"
_edit_lock = threading.Lock()
TREE_WRITE_LOCK = threading.RLock()


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
        db.flush()
        db.add(Share(token=group.share_token, target_type="folder", folder_id=None,
                     allow_edit=group.allow_edit, created_at=group.created_at))
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
    db.flush()
    unified = db.query(Share).filter(Share.token == share.share_token).first()
    if unified is None:
        unified = Share(token=share.share_token, target_type="file", file_id=file.id,
                        allow_edit=share.allow_edit, created_at=share.created_at)
        db.add(unified)
    else:
        unified.allow_edit = share.allow_edit
    db.commit()
    db.refresh(share)
    return share


def revoke_file_share(db: Session, file: FileItem) -> None:
    share = get_file_share(db, file)
    if share is not None:
        unified = db.query(Share).filter(Share.token == share.share_token).first()
        if unified is not None:
            db.delete(unified)
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


def _unique_name(db: Session, name: str, folder_id: int | None, exclude_id: int | None = None, group_id: int | None = None) -> str:
    candidate = name
    stem, dot, extension = name.rpartition(".")
    stem = stem if dot else name
    suffix = f".{extension}" if dot else ""
    index = 2
    while True:
        query = db.query(FileItem.id).filter(FileItem.folder_id == folder_id, FileItem.name == candidate)
        if group_id is not None:
            query = query.filter(FileItem.group_id == group_id)
        if exclude_id is not None:
            query = query.filter(FileItem.id != exclude_id)
        folder_query = db.query(Folder.id).filter(Folder.parent_id == folder_id, Folder.name == candidate)
        if query.first() is None and folder_query.first() is None:
            return candidate
        candidate = f"{stem} ({index}){suffix}"
        index += 1


def safe_mime_type(name: str, declared: str | None = None) -> str:
    """Choose a MIME type from the filename, with a tightly cleaned fallback."""
    guessed = mimetypes.guess_type(name)[0]
    if guessed:
        return guessed
    candidate = (declared or "").split(";", 1)[0].strip().lower()
    if (
        candidate
        and len(candidate) <= 200
        and candidate.count("/") == 1
        and all(ch.isalnum() or ch in "!#$&^_.+-/" for ch in candidate)
        and candidate.split("/", 1)[0]
        in {"application", "audio", "font", "image", "model", "multipart", "text", "video"}
        and not candidate.endswith(("+xml", "/xml", "/html", "/javascript"))
    ):
        return candidate
    return "application/octet-stream"


def save_upload(db: Session, group: Group | None, upload: UploadFile, folder_id: int | None = None) -> FileItem:
    raw_name = (upload.filename or "untitled").replace("\\", "/")
    original_name = raw_name.rsplit("/", 1)[-1].strip() or "untitled"
    if group is not None and not group.is_system and folder_id is None:
        folder_id = db.execute(
            text("SELECT folder_id FROM legacy_group_folders WHERE group_id = :id"), {"id": group.id}
        ).scalar()
    if folder_id is not None and db.get(Folder, folder_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Folder not found")
    stored_name = uuid.uuid4().hex
    dest = settings.storage_dir / stored_name
    temp = settings.storage_dir / f".{stored_name}.upload"

    size = 0
    committed = False
    try:
        with temp.open("wb") as out:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if settings.max_upload_size and size > settings.max_upload_size:
                    raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds the configured upload limit")
                out.write(chunk)
        os.replace(temp, dest)
        with TREE_WRITE_LOCK:
            original_name = _unique_name(
                db,
                original_name,
                folder_id,
                group_id=group.id if group and folder_id is None else None,
            )
            file = FileItem(
                group_id=group.id if group else None,
                folder_id=folder_id,
                name=original_name,
                stored_name=stored_name,
                size=size,
                mime_type=safe_mime_type(original_name),
            )
            db.add(file)
            db.commit()
        committed = True
        db.refresh(file)
        return file
    except Exception:
        db.rollback()
        temp.unlink(missing_ok=True)
        if not committed:
            dest.unlink(missing_ok=True)
        raise


def save_path(
    db: Session,
    group: Group | None,
    source: Path,
    name: str,
    mime_type: str = "application/octet-stream",
    folder_id: int | None = None,
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
    committed = False
    try:
        shutil.move(str(source), str(destination))
        file = FileItem(
            group_id=group.id if group else None,
            folder_id=folder_id,
            name=original_name,
            stored_name=stored_name,
            size=size,
            mime_type=safe_mime_type(original_name, mime_type),
        )
        with TREE_WRITE_LOCK:
            file.name = _unique_name(db, file.name, folder_id)
            db.add(file)
            db.commit()
        committed = True
        db.refresh(file)
        return file
    except Exception:
        db.rollback()
        if not committed:
            destination.unlink(missing_ok=True)
        raise


def delete_file(db: Session, file: FileItem) -> None:
    path = stored_path(file)
    db.delete(file)
    db.commit()
    path.unlink(missing_ok=True)


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


def text_etag(file: FileItem) -> str:
    return hashlib.sha256(stored_path(file).read_bytes()).hexdigest()


def write_text(db: Session, file: FileItem, content: str, etag: str | None = None) -> FileItem:
    if not is_text(file.name, file.mime_type):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is not a text file")

    data = content.encode("utf-8")
    if len(data) > settings.max_text_edit_size:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "Text file is too large to save",
        )

    path = stored_path(file)
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    with _edit_lock:
        if not etag or not hmac.compare_digest(text_etag(file), etag):
            raise HTTPException(status.HTTP_409_CONFLICT, "File changed; reload before saving")
        old_data = path.read_bytes()
        try:
            tmp.write_bytes(data)
            tmp.replace(path)
            file.size = len(data)
            file.updated_at = datetime.now(timezone.utc)
            db.commit()
        except Exception:
            db.rollback()
            tmp.write_bytes(old_data)
            tmp.replace(path)
            raise
        finally:
            tmp.unlink(missing_ok=True)
    db.refresh(file)
    return file


def rename_file(db: Session, file: FileItem, new_name: str) -> FileItem:
    cleaned = new_name.replace("\\", "/").rsplit("/", 1)[-1].strip()
    if cleaned:
        with TREE_WRITE_LOCK:
            file.name = _unique_name(db, cleaned, file.folder_id, file.id)
            db.commit()
            db.refresh(file)
    return file


def purge_group_files(group: Group) -> None:
    for file in group.files:
        stored_path(file).unlink(missing_ok=True)
