from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, literal, select, union_all
from sqlalchemy.orm import Session

from .. import operations
from ..database import get_db
from ..deps import require_admin
from ..models import FileItem, Folder
from ..schemas import to_file_out

router = APIRouter(prefix="/api/folders", tags=["folders"], dependencies=[Depends(require_admin)])


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_id: int | None = None
    description: str = ""


class FolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    parent_id: int | None = None


def _unique_folder_name(db: Session, name: str, parent_id: int | None, exclude: int | None = None) -> str:
    candidate, index = name, 2
    while True:
        query = db.query(Folder.id).filter(Folder.parent_id == parent_id, Folder.name == candidate)
        if exclude is not None:
            query = query.filter(Folder.id != exclude)
        file_query = db.query(FileItem.id).filter(FileItem.folder_id == parent_id, FileItem.name == candidate)
        if query.first() is None and file_query.first() is None:
            return candidate
        candidate = f"{name} ({index})"
        index += 1


def _clean_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned or cleaned in (".", "..") or "/" in cleaned or "\\" in cleaned or "\x00" in cleaned:
        raise HTTPException(400, "Invalid folder name")
    return cleaned


def _folder_stats(db: Session, folder_ids: list[int]) -> dict[int, tuple[int, int]]:
    if not folder_ids:
        return {}
    tree = select(
        Folder.id.label("root_id"), Folder.id.label("descendant_id")
    ).where(Folder.id.in_(folder_ids)).cte("folder_tree", recursive=True)
    tree = tree.union_all(
        select(tree.c.root_id, Folder.id).join(
            tree, Folder.parent_id == tree.c.descendant_id
        )
    )
    rows = db.execute(
        select(
            tree.c.root_id,
            func.count(FileItem.id),
            func.coalesce(func.sum(FileItem.size), 0),
        )
        .outerjoin(FileItem, FileItem.folder_id == tree.c.descendant_id)
        .group_by(tree.c.root_id)
    ).all()
    return {root_id: (count, size) for root_id, count, size in rows}


def _folder_out(
    db: Session,
    folder: Folder,
    stats: dict[int, tuple[int, int]] | None = None,
):
    count, size = (stats or _folder_stats(db, [folder.id])).get(folder.id, (0, 0))
    return {"id": folder.id, "parent_id": folder.parent_id, "name": folder.name, "description": folder.description,
            "created_at": folder.created_at, "updated_at": folder.updated_at, "file_count": count, "total_size": size}


@router.get("")
def list_contents(parent_id: int | None = None, page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=500),
                  sort: str = "name", order: str = "asc", q: str = "", db: Session = Depends(get_db)):
    if parent_id is not None and db.get(Folder, parent_id) is None:
        raise HTTPException(404, "Folder not found")
    folder_query = select(
        Folder.id.label("id"), literal("folder").label("type"),
        Folder.name.label("name"), literal(0).label("size"),
        Folder.created_at.label("created_at"), Folder.updated_at.label("updated_at"),
    ).where(Folder.parent_id == parent_id)
    file_query = select(
        FileItem.id.label("id"), literal("file").label("type"),
        FileItem.name.label("name"), FileItem.size.label("size"),
        FileItem.created_at.label("created_at"), FileItem.updated_at.label("updated_at"),
    ).where(FileItem.folder_id == parent_id)
    if q:
        folder_query = folder_query.where(Folder.name.contains(q, autoescape=True))
        file_query = file_query.where(FileItem.name.contains(q, autoescape=True))
    entries = union_all(folder_query, file_query).subquery()
    if sort not in {"name", "size", "created_at", "updated_at"} or order not in {"asc", "desc"}:
        raise HTTPException(400, "Unsupported sort field")
    total = db.scalar(select(func.count()).select_from(entries))
    sort_column = entries.c[sort]
    rows = db.execute(select(entries).order_by(
        sort_column.desc() if order == "desc" else sort_column.asc(), entries.c.type, entries.c.id
    ).offset((page - 1) * page_size).limit(page_size)).mappings().all()
    folder_ids = [row["id"] for row in rows if row["type"] == "folder"]
    file_ids = [row["id"] for row in rows if row["type"] == "file"]
    folders = {folder.id: folder for folder in db.query(Folder).filter(Folder.id.in_(folder_ids)).all()}
    files = {file.id: file for file in db.query(FileItem).filter(FileItem.id.in_(file_ids)).all()}
    stats = _folder_stats(db, folder_ids)
    items = [
        {"type": "folder", **_folder_out(db, folders[row["id"]], stats)}
        if row["type"] == "folder" else
        {"type": "file", **to_file_out(files[row["id"]]).model_dump()}
        for row in rows
    ]
    return {"items": items, "page": page, "page_size": page_size, "total": total}


@router.post("", status_code=201)
def create_folder(payload: FolderCreate, db: Session = Depends(get_db)):
    if payload.parent_id is not None and db.get(Folder, payload.parent_id) is None:
        raise HTTPException(404, "Parent folder not found")
    with operations.TREE_WRITE_LOCK:
        folder = Folder(
            parent_id=payload.parent_id,
            name=_unique_folder_name(
                db, _clean_name(payload.name), payload.parent_id
            ),
            description=payload.description,
        )
        db.add(folder)
        db.commit()
        db.refresh(folder)
    return _folder_out(db, folder)


@router.get("/{folder_id}")
def get_folder(folder_id: int, db: Session = Depends(get_db)):
    folder = db.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(404, "Folder not found")
    return _folder_out(db, folder)


@router.patch("/{folder_id}")
def update_folder(folder_id: int, payload: FolderUpdate, db: Session = Depends(get_db)):
    folder = db.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(404, "Folder not found")
    parent_id = payload.parent_id if "parent_id" in payload.model_fields_set else folder.parent_id
    if parent_id == folder.id:
        raise HTTPException(400, "A folder cannot contain itself")
    cursor = db.get(Folder, parent_id) if parent_id is not None else None
    if parent_id is not None and cursor is None:
        raise HTTPException(404, "Parent folder not found")
    while cursor:
        if cursor.id == folder.id:
            raise HTTPException(400, "Folder move would create a cycle")
        cursor = cursor.parent
    with operations.TREE_WRITE_LOCK:
        folder.name = _unique_folder_name(
            db,
            _clean_name(payload.name) if payload.name is not None else folder.name,
            parent_id,
            folder.id,
        )
        folder.parent_id = parent_id
        db.commit()
        db.refresh(folder)
    return _folder_out(db, folder)


@router.delete("/{folder_id}", status_code=204)
def delete_folder(folder_id: int, db: Session = Depends(get_db)):
    folder = db.get(Folder, folder_id)
    if folder is None:
        raise HTTPException(404, "Folder not found")
    descendants = [folder]
    for current in descendants:
        descendants.extend(current.children)
    paths = [operations.stored_path(file) for current in descendants for file in current.files]
    db.delete(folder)
    db.commit()
    for path in paths:
        path.unlink(missing_ok=True)
