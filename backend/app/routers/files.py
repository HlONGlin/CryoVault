from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import operations
from ..config import settings
from ..database import get_db
from ..deps import require_admin
from ..models import FileItem
from ..responses import serve_file
from ..schemas import (
    FileShareCreate,
    FileShareOut,
    TextContent,
    TextUpdate,
    to_file_out,
    to_file_share_out,
)

router = APIRouter(
    prefix="/api/files",
    tags=["files"],
    dependencies=[Depends(require_admin)],
)


class RenamePayload(BaseModel):
    name: str = Field(min_length=1, max_length=512)


class ArchivePayload(BaseModel):
    file_ids: list[int] = Field(min_length=1, max_length=500)


@router.post("/archive")
def download_archive(
    payload: ArchivePayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    requested_ids = list(dict.fromkeys(payload.file_ids))
    files = db.query(FileItem).filter(FileItem.id.in_(requested_ids)).all()
    by_id = {file.id: file for file in files}
    if len(by_id) != len(requested_ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more files not found")

    temp = NamedTemporaryFile(
        prefix="cryovault-",
        suffix=".zip",
        dir=settings.data_dir,
        delete=False,
    )
    archive_path = Path(temp.name)
    temp.close()
    try:
        used_names: set[str] = set()
        with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
            for file_id in requested_ids:
                file = by_id[file_id]
                source = operations.stored_path(file)
                if not source.is_file():
                    raise FileNotFoundError(source)
                name = file.name or f"file-{file.id}"
                candidate = name
                suffix = 2
                while candidate in used_names:
                    stem, dot, extension = name.rpartition(".")
                    candidate = (
                        f"{stem or name} ({suffix})"
                        f"{dot}{extension}" if dot else f"{name} ({suffix})"
                    )
                    suffix += 1
                used_names.add(candidate)
                archive.write(source, arcname=candidate)
    except Exception:
        archive_path.unlink(missing_ok=True)
        raise

    background_tasks.add_task(archive_path.unlink, missing_ok=True)
    return FileResponse(
        archive_path,
        media_type="application/zip",
        filename="cryovault-files.zip",
    )


@router.get("/{file_id}")
def get_file(file_id: int, db: Session = Depends(get_db)):
    return to_file_out(operations.get_file_or_404(db, file_id))


@router.patch("/{file_id}")
def rename_file(file_id: int, payload: RenamePayload, db: Session = Depends(get_db)):
    file = operations.get_file_or_404(db, file_id)
    return to_file_out(operations.rename_file(db, file, payload.name))


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(file_id: int, db: Session = Depends(get_db)):
    operations.delete_file(db, operations.get_file_or_404(db, file_id))


@router.get("/{file_id}/download")
def download_file(file_id: int, request: Request, db: Session = Depends(get_db)):
    file = operations.get_file_or_404(db, file_id)
    return serve_file(
        operations.stored_path(file),
        request,
        file.mime_type,
        filename=file.name,
    )


@router.get("/{file_id}/raw")
def raw_file(file_id: int, request: Request, db: Session = Depends(get_db)):
    file = operations.get_file_or_404(db, file_id)
    return serve_file(
        operations.stored_path(file),
        request,
        file.mime_type,
        inline=True,
    )


@router.get("/{file_id}/content", response_model=TextContent)
def get_content(file_id: int, db: Session = Depends(get_db)):
    file = operations.get_file_or_404(db, file_id)
    return TextContent(
        name=file.name,
        content=operations.read_text(file),
        updated_at=file.updated_at,
    )


@router.put("/{file_id}/content", response_model=TextContent)
def update_content(file_id: int, payload: TextUpdate, db: Session = Depends(get_db)):
    file = operations.get_file_or_404(db, file_id)
    file = operations.write_text(db, file, payload.content)
    return TextContent(name=file.name, content=payload.content, updated_at=file.updated_at)


@router.get("/{file_id}/share", response_model=FileShareOut | None)
def get_file_share(file_id: int, db: Session = Depends(get_db)):
    file = operations.get_file_or_404(db, file_id)
    share = operations.get_file_share(db, file)
    return to_file_share_out(share) if share else None


@router.post("/{file_id}/share", response_model=FileShareOut)
def create_file_share(
    file_id: int, payload: FileShareCreate, db: Session = Depends(get_db)
):
    file = operations.get_file_or_404(db, file_id)
    share = operations.ensure_file_share(db, file, payload.allow_edit)
    return to_file_share_out(share)


@router.delete("/{file_id}/share", status_code=status.HTTP_204_NO_CONTENT)
def delete_file_share(file_id: int, db: Session = Depends(get_db)):
    file = operations.get_file_or_404(db, file_id)
    operations.revoke_file_share(db, file)
