from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import operations
from ..database import get_db
from ..deps import require_admin
from ..models import Folder, Group, Share
from ..schemas import GroupCreate, GroupOut, GroupUpdate, to_file_out, to_group_out
from .folders import _clean_name, _unique_folder_name

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
    name = _unique_folder_name(db, _clean_name(payload.name), None)
    group = Group(
        name=name,
        description=payload.description,
        allow_edit=payload.allow_edit,
    )
    db.add(group)
    folder = Folder(name=name, description=payload.description)
    db.add(folder)
    db.flush()
    db.add(Share(token=group.share_token, target_type="folder", folder_id=folder.id,
                 allow_edit=group.allow_edit, created_at=group.created_at))
    db.execute(text("INSERT INTO legacy_group_folders(group_id, folder_id) VALUES (:group_id, :folder_id)"),
               {"group_id": group.id, "folder_id": folder.id})
    db.commit()
    db.refresh(group)
    return to_group_out(group)


@router.get("/{group_id}", response_model=GroupOut)
def get_group(group_id: int, db: Session = Depends(get_db)):
    return to_group_out(operations.get_group_or_404(db, group_id))


@router.patch("/{group_id}", response_model=GroupOut)
def update_group(group_id: int, payload: GroupUpdate, db: Session = Depends(get_db)):
    group = operations.get_group_or_404(db, group_id)
    folder_id = db.execute(text("SELECT folder_id FROM legacy_group_folders WHERE group_id = :id"),
                           {"id": group_id}).scalar()
    folder = db.get(Folder, folder_id) if folder_id is not None else None
    unified = db.query(Share).filter(Share.token == group.share_token).first()
    if payload.name is not None:
        group.name = _unique_folder_name(db, _clean_name(payload.name), folder.parent_id if folder else None,
                                         folder.id if folder else None)
        if folder:
            folder.name = group.name
    if payload.description is not None:
        group.description = payload.description
        if folder:
            folder.description = payload.description
    if payload.allow_edit is not None:
        group.allow_edit = payload.allow_edit
        if unified:
            unified.allow_edit = payload.allow_edit
    if payload.regenerate_token:
        from ..models import gen_token

        group.share_token = gen_token()
        if unified:
            unified.token = group.share_token
    db.commit()
    db.refresh(group)
    return to_group_out(group)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: int, db: Session = Depends(get_db)):
    group = operations.get_group_or_404(db, group_id)
    folder_id = db.execute(text("SELECT folder_id FROM legacy_group_folders WHERE group_id = :id"),
                           {"id": group_id}).scalar()
    folder = db.get(Folder, folder_id) if folder_id is not None else None
    descendants = [folder] if folder else []
    for current in descendants:
        descendants.extend(current.children)
    paths = {operations.stored_path(file) for current in descendants for file in current.files}
    paths.update(operations.stored_path(file) for file in group.files)
    db.execute(text("DELETE FROM legacy_group_folders WHERE group_id = :id"), {"id": group_id})
    unified = db.query(Share).filter(Share.token == group.share_token).first()
    if unified:
        db.delete(unified)
    if folder:
        db.delete(folder)
    db.delete(group)
    db.commit()
    for path in paths:
        path.unlink(missing_ok=True)


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
