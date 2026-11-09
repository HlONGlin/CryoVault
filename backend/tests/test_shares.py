from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.deps import require_admin
from app.models import FileItem, FileShare, Folder, Group, Share
from app.routers.file_share import router as legacy_file_router
from app.routers.files import router as files_router
from app.routers.direct import router as direct_router
from app.routers.share import router as legacy_folder_router
from app.routers.shares import admin_router, public_router


def test_password_expiry_subtree_and_revocation(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions.begin() as session:
        first = Folder(name="first", description="")
        second = Folder(name="second", description="")
        session.add_all([first, second])
        session.flush()
        child = Folder(name="child", parent_id=first.id, description="")
        session.add(child)
        session.flush()
        inside = FileItem(folder_id=child.id, name="inside.txt", stored_name="one", size=3, mime_type="text/plain")
        outside = FileItem(folder_id=second.id, name="outside.txt", stored_name="two", size=3, mime_type="text/plain")
        session.add_all([inside, outside])
        session.flush()
        root_id, child_id, other_id, inside_id, outside_id = first.id, child.id, second.id, inside.id, outside.id
    (settings.storage_dir / "one").write_bytes(b"one")
    (settings.storage_dir / "two").write_bytes(b"two")
    app = FastAPI()
    app.include_router(admin_router)
    app.include_router(public_router)

    def test_db():
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[require_admin] = lambda: None
    client = TestClient(app)
    share = client.post("/api/shares", json={
        "target_type": "folder", "folder_id": root_id, "password": "secret"
    }).json()
    base = "/api/public/shares/" + share["token"]
    assert client.get(base).json() == {"password_required": True}
    assert client.get(base + "/folders").status_code == 403
    assert client.post(base + "/unlock", json={"password": "bad"}).status_code == 403
    assert client.post(base + "/unlock", json={"password": "secret"}).status_code == 200
    assert client.get(base + "/folders", params={"folder_id": child_id}).status_code == 200
    assert client.get(base + "/folders", params={"folder_id": other_id}).status_code == 404
    assert client.get(base + f"/files/{inside_id}/download").content == b"one"
    assert client.get(base + f"/files/{outside_id}/download").status_code == 404
    content = client.get(base + f"/files/{inside_id}/content")
    assert content.status_code == 200
    assert client.put(base + f"/files/{inside_id}/content", json={
        "content": "changed", "etag": content.json()["etag"]
    }).status_code == 403
    assert client.patch(f"/api/shares/{share['id']}", json={"allow_edit": True}).status_code == 200
    assert client.put(base + f"/files/{inside_id}/content", json={
        "content": "changed", "etag": content.json()["etag"]
    }).status_code == 200
    assert client.put(base + f"/files/{inside_id}/content", json={
        "content": "stale", "etag": content.json()["etag"]
    }).status_code == 409
    assert client.patch("/api/shares/" + str(share["id"]), json={"password": "new"}).status_code == 200
    assert client.get(base + "/folders").status_code == 403
    assert client.post(base + "/unlock", json={"password": "new"}).status_code == 200
    expired = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    assert client.patch("/api/shares/" + str(share["id"]), json={"expires_at": expired}).status_code == 200
    assert client.get(base).status_code == 404
    assert client.delete("/api/shares/" + str(share["id"])).status_code == 204
    assert client.get(base).status_code == 404
    engine.dispose()


def test_legacy_share_routes_honor_new_password_and_revocation(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE legacy_group_folders (group_id INTEGER PRIMARY KEY, folder_id INTEGER NOT NULL UNIQUE)"
        )
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions.begin() as session:
        folder = Folder(name="docs", description="")
        group = Group(name="docs", description="", share_token="old-group", allow_edit=False)
        session.add_all([folder, group])
        session.flush()
        session.execute(__import__("sqlalchemy").text(
            "INSERT INTO legacy_group_folders(group_id, folder_id) VALUES (:g, :f)"
        ), {"g": group.id, "f": folder.id})
        file = FileItem(group_id=group.id, folder_id=folder.id, name="a.txt",
                        stored_name="a", size=1, mime_type="text/plain")
        session.add(file)
        session.flush()
        session.add(FileShare(file_id=file.id, share_token="old-file", allow_edit=False))
        session.add_all([
            Share(token="old-group", target_type="folder", folder_id=folder.id, allow_edit=False),
            Share(token="old-file", target_type="file", file_id=file.id, allow_edit=False),
        ])
    (settings.storage_dir / "a").write_bytes(b"a")
    app = FastAPI()
    for router in (admin_router, public_router, legacy_folder_router, legacy_file_router):
        app.include_router(router)
    def test_db():
        with sessions() as session:
            yield session
    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[require_admin] = lambda: None
    client = TestClient(app)
    shares = {share["token"]: share for share in client.get("/api/shares").json()}
    for token, legacy_url in (("old-group", "/api/share/old-group"),
                              ("old-file", "/api/file-share/old-file")):
        share_id = shares[token]["id"]
        assert client.patch(f"/api/shares/{share_id}", json={"password": "secret"}).status_code == 200
        assert client.get(legacy_url).status_code == 403
        assert client.post(f"/api/public/shares/{token}/unlock", json={"password": "secret"}).status_code == 200
        assert client.get(legacy_url).status_code == 200
        assert client.delete(f"/api/shares/{share_id}").status_code == 204
        assert client.get(legacy_url).status_code == 404
    engine.dispose()


def test_legacy_system_share_does_not_expose_other_root_files(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions.begin() as session:
        group = Group(name="direct", description="", share_token="system-token", is_system=True)
        session.add(group)
        session.flush()
        original = FileItem(group_id=group.id, name="original", stored_name="original", size=1)
        added = FileItem(name="new", stored_name="new", size=1)
        session.add_all([original, added, Share(token="system-token", target_type="folder")])
        session.flush()
        original_id, added_id = original.id, added.id
    (settings.storage_dir / "original").write_bytes(b"a")
    (settings.storage_dir / "new").write_bytes(b"b")
    app = FastAPI()
    app.include_router(public_router)
    def test_db():
        with sessions() as session:
            yield session
    app.dependency_overrides[get_db] = test_db
    client = TestClient(app)
    base = "/api/public/shares/system-token"
    assert [item["id"] for item in client.get(base + "/folders").json()["items"]] == [original_id]
    assert client.get(base + f"/files/{original_id}/download").content == b"a"
    assert client.get(base + f"/files/{added_id}/download").status_code == 404
    engine.dispose()


def test_legacy_file_share_alias_uses_unified_share(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions.begin() as session:
        file = FileItem(name="a.txt", stored_name="a", size=1, mime_type="text/plain")
        session.add(file)
        session.flush()
        file_id = file.id
    (settings.storage_dir / "a").write_bytes(b"a")

    app = FastAPI()
    app.include_router(files_router)
    app.include_router(legacy_file_router)

    def test_db():
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[require_admin] = lambda: None
    client = TestClient(app)
    created = client.post(f"/api/files/{file_id}/share", json={"allow_edit": True})
    assert created.status_code == 200
    token = created.json()["share_token"]
    assert client.get(f"/api/file-share/{token}").status_code == 200
    with sessions() as session:
        assert session.query(Share).count() == 1
        assert session.query(FileShare).count() == 0
    assert client.delete(f"/api/files/{file_id}/share").status_code == 204
    assert client.get(f"/api/file-share/{token}").status_code == 404
    engine.dispose()


def test_direct_compatibility_uses_root_without_system_group(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    app = FastAPI()
    app.include_router(direct_router)

    def test_db():
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[require_admin] = lambda: None
    client = TestClient(app)
    uploaded = client.post(
        "/api/direct/files",
        files=[("files", ("root.txt", b"root", "text/plain"))],
    )
    assert uploaded.status_code == 201
    assert uploaded.json()[0]["folder_id"] is None
    listing = client.get("/api/direct")
    assert listing.status_code == 200
    assert listing.json()["group_id"] is None
    assert [item["name"] for item in listing.json()["files"]] == ["root.txt"]
    with sessions() as session:
        assert session.query(Group).count() == 0
        assert session.query(Share).count() == 0
    engine.dispose()


def test_legacy_group_share_excludes_moved_subtree(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE legacy_group_folders (group_id INTEGER PRIMARY KEY, folder_id INTEGER NOT NULL UNIQUE)")
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions.begin() as session:
        root = Folder(name="root", description="")
        moved = Folder(name="moved", description="")
        group = Group(name="root", description="", share_token="group-token")
        session.add_all([root, moved, group])
        session.flush()
        session.execute(__import__("sqlalchemy").text("INSERT INTO legacy_group_folders VALUES (:g, :f)"),
                        {"g": group.id, "f": root.id})
        file = FileItem(group_id=group.id, folder_id=moved.id, name="secret", stored_name="secret", size=1)
        session.add_all([file, Share(token="group-token", target_type="folder", folder_id=root.id)])
        session.flush()
        file_id = file.id
    (settings.storage_dir / "secret").write_bytes(b"x")
    app = FastAPI()
    app.include_router(legacy_folder_router)
    def test_db():
        with sessions() as session:
            yield session
    app.dependency_overrides[get_db] = test_db
    client = TestClient(app)
    assert client.get("/api/share/group-token/files").json() == []
    assert client.get(f"/api/share/group-token/files/{file_id}/download").status_code == 404
    engine.dispose()
