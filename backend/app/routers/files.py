from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import operations
from ..config import settings
from ..database import get_db
from ..deps import require_admin
from ..models import FileItem, Folder
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
    name: str | None = Field(default=None, min_length=1, max_length=512)
    folder_id: int | None = None


class ArchivePayload(BaseModel):
    file_ids: list[int] = Field(default_factory=list, max_length=500)
    folder_ids: list[int] = Field(default_factory=list, max_length=500)


class ImportPayload(BaseModel):
    url: str = Field(min_length=8, max_length=4096)
    name: str = Field(default="", max_length=512)
    folder_id: int | None = None


@router.post("/import", status_code=201)
def import_link(payload: ImportPayload, db: Session = Depends(get_db)):
    import httpx
    from .direct import _download_link
    if payload.folder_id is not None and db.get(Folder, payload.folder_id) is None:
        raise HTTPException(404, "Folder not found")
    temp = NamedTemporaryFile(prefix="cryovault-link-", dir=settings.data_dir, delete=False)
    path = Path(temp.name)
    temp.close()
    try:
        name, content_type = _download_link(payload.url, path)
        file = operations.save_path(db, None, path, payload.name.strip() or name, content_type, payload.folder_id)
        return to_file_out(file)
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Could not download the source link") from exc
    finally:
        path.unlink(missing_ok=True)


@router.post("", status_code=status.HTTP_201_CREATED)
def upload_files(
    files: list[UploadFile] = File(...),
    folder_id: int | None = Form(None),
    db: Session = Depends(get_db),
):
    if folder_id is not None and db.get(Folder, folder_id) is None:
        raise HTTPException(404, "Folder not found")
    results = []
    for upload in files:
        try:
            file = operations.save_upload(db, None, upload, folder_id)
            results.append({"name": upload.filename, "file": to_file_out(file), "error": None})
        except HTTPException as exc:
            results.append({"name": upload.filename, "file": None, "error": str(exc.detail)})
        except Exception:
            results.append({"name": upload.filename, "file": None, "error": "Upload failed"})
        finally:
            upload.file.close()
    return {"results": results}


@router.post("/archive")
def download_archive(
    payload: ArchivePayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    requested_ids = list(dict.fromkeys(payload.file_ids))
    requested_folders = list(dict.fromkeys(payload.folder_ids))
    if not requested_ids and not requested_folders:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No files or folders selected")
    files = db.query(FileItem).filter(FileItem.id.in_(requested_ids)).all()
    by_id = {file.id: file for file in files}
    if len(by_id) != len(requested_ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more files not found")
    folders = db.query(Folder).filter(Folder.id.in_(requested_folders)).all()
    folder_by_id = {folder.id: folder for folder in folders}
    if len(folder_by_id) != len(requested_folders):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more folders not found")

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
            def safe_name(name: str, fallback: str) -> str:
                value = (name or fallback).replace("/", "_").replace("\\", "_").replace("\x00", "_")
                return value if value not in (".", "..") else fallback

            def add_file(file: FileItem, parent: str = "") -> None:
                source = operations.stored_path(file)
                if not source.is_file():
                    raise FileNotFoundError(source)
                name = parent + safe_name(file.name, f"file-{file.id}")
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

            for file_id in requested_ids:
                add_file(by_id[file_id])
            selected_set = set(requested_folders)
            for folder_id in requested_folders:
                folder = folder_by_id[folder_id]
                ancestor = folder.parent
                selected_ancestor = False
                while ancestor is not None:
                    if ancestor.id in selected_set:
                        selected_ancestor = True
                        break
                    ancestor = ancestor.parent
                if selected_ancestor:
                    continue
                pending = [(folder, "")]
                for current, parent in pending:
                    path = parent + safe_name(current.name, f"folder-{current.id}") + "/"
                    archive.writestr(path, "")
                    for file in current.files:
                        if file.id not in requested_ids:
                            add_file(file, path)
                    pending.extend((child, path) for child in current.children)
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
    folder_id = payload.folder_id if "folder_id" in payload.model_fields_set else file.folder_id
    if folder_id is not None and db.get(Folder, folder_id) is None:
        raise HTTPException(404, "Folder not found")
    name = payload.name if payload.name is not None else file.name
    cleaned = name.replace("\\", "/").rsplit("/", 1)[-1].strip()
    if not cleaned:
        raise HTTPException(400, "Invalid name")
    file.name = operations._unique_name(db, cleaned, folder_id, file.id)
    if folder_id != file.folder_id:
        # A moved file no longer belongs to its old legacy group. This also
        # causes WebDAV to pause until its path mapping has been reconciled.
        file.group_id = None
    file.folder_id = folder_id
    db.commit()
    db.refresh(file)
    return to_file_out(file)


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
        etag=operations.text_etag(file),
    )


@router.put("/{file_id}/content", response_model=TextContent)
def update_content(file_id: int, payload: TextUpdate, db: Session = Depends(get_db)):
    file = operations.get_file_or_404(db, file_id)
    file = operations.write_text(db, file, payload.content, payload.etag)
    return TextContent(name=file.name, content=payload.content, updated_at=file.updated_at, etag=operations.text_etag(file))


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
