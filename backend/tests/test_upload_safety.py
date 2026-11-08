from io import BytesIO

import pytest
from fastapi import UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import operations
from app.config import settings
from app.database import Base
from app.models import FileItem


def test_failed_upload_commit_cleans_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    with sessions() as session:
        def fail_commit():
            raise RuntimeError("commit failed")
        monkeypatch.setattr(session, "commit", fail_commit)
        with pytest.raises(RuntimeError, match="commit failed"):
            operations.save_upload(session, None, UploadFile(filename="a.txt", file=BytesIO(b"abc")))
    assert list(settings.storage_dir.iterdir()) == []
    with sessions() as session:
        assert session.query(FileItem).count() == 0
    engine.dispose()


def test_refresh_failure_after_commit_keeps_file(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    with sessions() as session:
        def fail_refresh(_file):
            raise RuntimeError("refresh failed")
        monkeypatch.setattr(session, "refresh", fail_refresh)
        with pytest.raises(RuntimeError, match="refresh failed"):
            operations.save_upload(session, None, UploadFile(filename="a.txt", file=BytesIO(b"abc")))
    with sessions() as session:
        item = session.query(FileItem).one()
        assert (settings.storage_dir / item.stored_name).read_bytes() == b"abc"
    engine.dispose()


def test_text_edit_rejects_stale_etag(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    with sessions.begin() as session:
        item = FileItem(name="a.txt", stored_name="stored-a", size=3, mime_type="text/plain")
        session.add(item)
        session.flush()
        file_id = item.id
    (settings.storage_dir / "stored-a").write_bytes(b"abc")
    with sessions() as session:
        item = session.get(FileItem, file_id)
        etag = operations.text_etag(item)
        operations.write_text(session, item, "first", etag)
        with pytest.raises(Exception) as error:
            operations.write_text(session, item, "stale", etag)
        assert getattr(error.value, "status_code", None) == 409
    assert (settings.storage_dir / "stored-a").read_bytes() == b"first"
    engine.dispose()
