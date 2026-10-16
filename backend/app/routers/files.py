from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import operations
from ..database import get_db
from ..deps import require_admin
from ..responses import serve_file
from ..schemas import TextContent, TextUpdate, to_file_out

router = APIRouter(
    prefix="/api/files",
    tags=["files"],
    dependencies=[Depends(require_admin)],
)


class RenamePayload(BaseModel):
    name: str = Field(min_length=1, max_length=512)


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
