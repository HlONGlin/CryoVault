import socket
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import operations
from app.config import settings
from app.database import Base, _install_name_guards
from app.errors import install_exception_handlers
from app.models import FileItem, Folder
from app.routers.direct import (
    _PinnedSyncBackend,
    _download_link,
    _resolve_public_url,
)


def test_import_rejects_private_address_without_connecting():
    with pytest.raises(HTTPException) as error:
        _resolve_public_url("http://127.0.0.1/private")
    assert error.value.status_code == 400


def test_import_rejects_redirect_to_private_address(tmp_path, monkeypatch):
    calls = []

    def resolve(url):
        calls.append(url)
        if len(calls) == 1:
            return "example.com", "93.184.216.34"
        raise HTTPException(400, "Links to private or local network addresses are not allowed")

    def transport(_host, _address):
        return httpx.MockTransport(
            lambda request: httpx.Response(
                302,
                headers={"location": "http://127.0.0.1/private"},
                request=request,
            )
        )

    monkeypatch.setattr("app.routers.direct._resolve_public_url", resolve)
    monkeypatch.setattr("app.routers.direct._PinnedTransport", transport)
    with pytest.raises(HTTPException) as error:
        _download_link("https://example.com/file", tmp_path / "download")
    assert error.value.status_code == 400
    assert calls == [
        "https://example.com/file",
        "http://127.0.0.1/private",
    ]


def test_import_connects_to_pinned_ip_and_keeps_hostname(monkeypatch):
    connected = []

    def fake_connect(self, host, port, **kwargs):
        connected.append((host, port, kwargs))
        return object()

    monkeypatch.setattr("httpcore.SyncBackend.connect_tcp", fake_connect)
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: pytest.fail("DNS must not be resolved during connection"),
    )
    backend = _PinnedSyncBackend("example.com", "93.184.216.34")
    backend.connect_tcp("EXAMPLE.com.", 443)
    assert connected[0][0:2] == ("93.184.216.34", 443)
    with pytest.raises(OSError, match="unexpected host"):
        backend.connect_tcp("attacker.example", 443)


def test_api_errors_have_one_json_shape():
    app = FastAPI()
    install_exception_handlers(app)

    @app.get("/missing")
    def missing():
        raise HTTPException(404, detail={"message": "File not found", "code": "file_missing"})

    @app.get("/plain")
    def plain():
        raise HTTPException(429)

    client = TestClient(app)
    missing_response = client.get("/missing")
    assert missing_response.status_code == 404
    assert missing_response.json() == {
        "error": {"code": "file_missing", "message": "File not found", "status": 404}
    }
    assert client.get("/plain").json()["error"] == {
        "code": "rate_limited",
        "message": "Too Many Requests",
        "status": 429,
    }


def test_mime_type_is_derived_from_name_and_rejects_active_fallbacks():
    assert operations.safe_mime_type("report.pdf", "text/html") == "application/pdf"
    assert operations.safe_mime_type("payload.unknown", "text/html") == "application/octet-stream"
    assert operations.safe_mime_type("payload.unknown", "image/svg+xml") == "application/octet-stream"
    assert operations.safe_mime_type("payload.unknown", "image/png") == "image/png"
    assert operations.safe_mime_type("payload.unknown", "bad" + chr(13) + "mime") == "application/octet-stream"


def test_save_path_cleans_storage_when_database_commit_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    source = tmp_path / "import.tmp"
    source.write_bytes(b"payload")
    try:
        with sessions() as session:
            def fail_commit():
                raise RuntimeError("commit failed")

            monkeypatch.setattr(session, "commit", fail_commit)
            with pytest.raises(RuntimeError, match="commit failed"):
                operations.save_path(session, None, source, "payload.bin", "application/octet-stream")
        assert not source.exists()
        assert list(settings.storage_dir.iterdir()) == []
    finally:
        engine.dispose()


def test_folder_response_contains_recursive_aggregate(tmp_path, monkeypatch):
    from app.database import get_db
    from app.deps import require_admin
    from app.routers.folders import router

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions.begin() as session:
        root = Folder(name="root", description="")
        child = Folder(name="child", description="", parent=root)
        session.add_all([root, child])
        session.flush()
        root_id = root.id
        session.add_all([
            FileItem(folder_id=root.id, name="one", stored_name="one", size=2),
            FileItem(folder_id=child.id, name="two", stored_name="two", size=5),
        ])
    app = FastAPI()
    app.include_router(router)

    def test_db():
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[require_admin] = lambda: None
    result = TestClient(app).get(f"/api/folders/{root_id}").json()
    assert result["file_count"] == 2
    assert result["total_size"] == 7
    engine.dispose()


def test_database_guards_reject_sibling_name_conflicts():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        _install_name_guards(connection)
        connection.execute(text("INSERT INTO folders(id, name, description) VALUES (1, 'folder', '')"))
        connection.execute(text("INSERT INTO files(id, name, stored_name, size, mime_type) VALUES (1, 'unique', 'one', 1, 'application/octet-stream')"))
        with pytest.raises(Exception, match="sibling name conflict"):
            connection.execute(text("INSERT INTO files(id, name, stored_name, size, mime_type) VALUES (2, 'unique', 'two', 1, 'application/octet-stream')"))
        with pytest.raises(Exception, match="sibling name conflict"):
            connection.execute(text("INSERT INTO folders(id, name, description) VALUES (2, 'unique', '')"))
    with engine.begin() as connection:
        with pytest.raises(Exception, match="sibling name conflict"):
            connection.execute(text("UPDATE files SET name = 'folder' WHERE id = 1"))
    engine.dispose()
