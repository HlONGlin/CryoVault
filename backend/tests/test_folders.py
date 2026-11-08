from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.deps import require_admin
from app.models import FileItem, Folder
from app.routers.folders import router
from app.routers.folders import delete_folder
from app.routers.files import router as files_router
from app.routers.groups import router as groups_router
from io import BytesIO
from zipfile import ZipFile
import pytest


def test_folder_pagination_moves_and_recursive_delete(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    app = FastAPI()
    app.include_router(router)
    app.include_router(files_router)

    def test_db():
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[require_admin] = lambda: None
    client = TestClient(app)
    root = client.post("/api/folders", json={"name": "docs"}).json()
    duplicate = client.post("/api/folders", json={"name": "docs"}).json()
    assert duplicate["name"] == "docs (2)"
    child = client.post("/api/folders", json={"name": "child", "parent_id": root["id"]}).json()
    assert client.patch(f"/api/folders/{root['id']}", json={"parent_id": child["id"]}).status_code == 400
    with sessions.begin() as session:
        session.add(FileItem(folder_id=child["id"], name="a.txt", stored_name="stored-a",
                             size=3, mime_type="text/plain"))
    (settings.storage_dir / "stored-a").write_bytes(b"abc")
    page = client.get("/api/folders", params={"page_size": 1}).json()
    assert page["total"] == 2
    assert len(page["items"]) == 1
    response = client.post("/api/files/archive", json={"folder_ids": [root["id"]]})
    assert response.status_code == 200
    with ZipFile(BytesIO(response.content)) as archive:
        assert archive.read("docs/child/a.txt") == b"abc"
    assert client.delete(f"/api/folders/{root['id']}").status_code == 204
    assert not (settings.storage_dir / "stored-a").exists()
    with sessions() as session:
        assert session.query(FileItem).count() == 0
        assert session.query(Folder).count() == 1
    engine.dispose()


def test_folder_delete_commit_failure_preserves_disk(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions.begin() as session:
        folder = Folder(name="docs", description="")
        session.add(folder)
        session.flush()
        folder_id = folder.id
        session.add(FileItem(folder_id=folder_id, name="a.txt", stored_name="stored-a",
                             size=3, mime_type="text/plain"))
    path = settings.storage_dir / "stored-a"
    path.write_bytes(b"abc")
    with sessions() as session:
        def fail_commit():
            raise RuntimeError("commit failed")
        monkeypatch.setattr(session, "commit", fail_commit)
        with pytest.raises(RuntimeError, match="commit failed"):
            delete_folder(folder_id, session)
        session.rollback()
    assert path.read_bytes() == b"abc"
    with sessions() as session:
        assert session.query(FileItem).count() == 1
        assert session.query(Folder).count() == 1
    engine.dispose()


def test_legacy_group_delete_rejects_files_moved_outside(tmp_path, monkeypatch):
    from sqlalchemy import text
    from app.models import Group
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE legacy_group_folders (group_id INTEGER PRIMARY KEY, folder_id INTEGER NOT NULL)")
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions.begin() as session:
        root, outside = Folder(name="root", description=""), Folder(name="outside", description="")
        group = Group(name="root", description="")
        session.add_all([root, outside, group])
        session.flush()
        session.execute(text("INSERT INTO legacy_group_folders VALUES (:g,:f)"), {"g": group.id, "f": root.id})
        session.add(FileItem(group_id=group.id, folder_id=outside.id, name="a", stored_name="a", size=1))
        group_id = group.id
    path = settings.storage_dir / "a"
    path.write_bytes(b"a")
    app = FastAPI()
    app.include_router(groups_router)
    def test_db():
        with sessions() as session:
            yield session
    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[require_admin] = lambda: None
    assert TestClient(app).delete(f"/api/groups/{group_id}").status_code == 409
    assert path.read_bytes() == b"a"
    with sessions() as session:
        assert session.query(FileItem).count() == 1
    engine.dispose()
