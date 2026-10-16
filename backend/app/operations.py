import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .config import settings
from .models import FileItem, Group
from .storage import is_text


def stored_path(file: FileItem) -> Path:
    return settings.storage_dir / file.stored_name


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
    original_name = Path(upload.filename or "untitled").name
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


def delete_file(db: Session, file: FileItem) -> None:
    stored_path(file).unlink(missing_ok=True)
    db.delete(file)
    db.commit()


def read_text(file: FileItem) -> str:
    if not is_text(file.name, file.mime_type):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is not a text file")
    try:
        return stored_path(file).read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "File is not valid UTF-8 text"
        )


def write_text(db: Session, file: FileItem, content: str) -> FileItem:
    if not is_text(file.name, file.mime_type):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is not a text file")
    path = stored_path(file)
    path.write_text(content, encoding="utf-8")
    file.size = path.stat().st_size
    db.commit()
    db.refresh(file)
    return file


def rename_file(db: Session, file: FileItem, new_name: str) -> FileItem:
    file.name = Path(new_name).name
    db.commit()
    db.refresh(file)
    return file


def purge_group_files(group: Group) -> None:
    for file in group.files:
        stored_path(file).unlink(missing_ok=True)
