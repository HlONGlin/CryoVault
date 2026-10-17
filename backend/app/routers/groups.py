from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from .. import operations
from ..database import get_db
from ..deps import require_admin
from ..models import Group
from ..schemas import GroupCreate, GroupOut, GroupUpdate, to_file_out, to_group_out

router = APIRouter(
    prefix="/api/groups",
    tags=["groups"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=list[GroupOut])
def list_groups(db: Session = Depends(get_db)):
    groups = (
        db.query(Group)
        .filter(Group.is_system.is_(False))
        .order_by(Group.created_at.desc())
        .all()
    )
    return [to_group_out(g) for g in groups]


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(payload: GroupCreate, db: Session = Depends(get_db)):
    group = Group(
        name=payload.name,
        description=payload.description,
        allow_edit=payload.allow_edit,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return to_group_out(group)


@router.get("/{group_id}", response_model=GroupOut)
def get_group(group_id: int, db: Session = Depends(get_db)):
    return to_group_out(operations.get_group_or_404(db, group_id))


@router.patch("/{group_id}", response_model=GroupOut)
def update_group(group_id: int, payload: GroupUpdate, db: Session = Depends(get_db)):
    group = operations.get_group_or_404(db, group_id)
    if payload.name is not None:
        group.name = payload.name
    if payload.description is not None:
        group.description = payload.description
    if payload.allow_edit is not None:
        group.allow_edit = payload.allow_edit
    if payload.regenerate_token:
        from ..models import gen_token

        group.share_token = gen_token()
    db.commit()
    db.refresh(group)
    return to_group_out(group)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: int, db: Session = Depends(get_db)):
    group = operations.get_group_or_404(db, group_id)
    operations.purge_group_files(group)
    db.delete(group)
    db.commit()


@router.get("/{group_id}/files")
def list_files(group_id: int, db: Session = Depends(get_db)):
    group = operations.get_group_or_404(db, group_id)
    return [to_file_out(f) for f in group.files]


@router.post("/{group_id}/files", status_code=status.HTTP_201_CREATED)
def upload_files(
    group_id: int,
    files: list[UploadFile],
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No files provided")
    group = operations.get_group_or_404(db, group_id)
    created = [operations.save_upload(db, group, upload) for upload in files]
    return [to_file_out(f) for f in created]
