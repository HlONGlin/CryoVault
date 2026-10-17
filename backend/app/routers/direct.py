from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .. import operations
from ..database import get_db
from ..deps import require_admin
from ..schemas import DirectInfo, FileDetail, to_file_out

router = APIRouter(
    prefix="/api/direct",
    tags=["direct"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=DirectInfo)
def direct_info(db: Session = Depends(get_db)):
    group = operations.get_system_group(db)
    return DirectInfo(
        group_id=group.id,
        files=[to_file_out(f) for f in group.files],
    )


@router.post(
    "/files",
    response_model=list[FileDetail],
    status_code=status.HTTP_201_CREATED,
)
def upload_direct_files(
    files: list[UploadFile],
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No files provided")
    group = operations.get_system_group(db)
    created = [operations.save_upload(db, group, upload) for upload in files]
    return [to_file_out(f) for f in created]
