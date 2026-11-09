import hashlib
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import webdav
from app.config import settings
from app.database import Base
from app.models import FileItem, Folder, SyncState
from app.webdav import RemoteEntry, SyncEngine, SyncReport, SyncScheduler


def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class FakeDav:
    def __init__(self, contents: dict[str, bytes] | None = None):
        self.contents = dict(contents or {})
        self.calls: list[tuple] = []
        self.closed = False

    def entries(self) -> dict[str, RemoteEntry]:
        return {
            path: RemoteEntry(
                path=path,
                is_collection=False,
                etag=_hash(content),
                size=len(content),
                modified=datetime(2025, 1, 1),
                content_type="text/html",
            )
            for path, content in self.contents.items()
        }

    def ensure_root(self):
        self.calls.append(("ensure_root",))

    def walk(self):
        return self.entries()

    def put_file(self, path, source):
        content = Path(source).read_bytes()
        self.contents[path] = content
        self.calls.append(("put", path, content))
        return self.entries()[path]

    def download_file(self, path, destination):
        destination.write_bytes(self.contents[path])
        self.calls.append(("get", path))

    def delete(self, path):
        self.contents.pop(path, None)
        self.calls.append(("delete", path))

    def move(self, source, destination):
        if destination in self.contents:
            raise FileExistsError(destination)
        self.contents[destination] = self.contents.pop(source)
        self.calls.append(("move", source, destination))

    def close(self):
        self.closed = True


@pytest.fixture
def sync_env(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.storage_dir.mkdir()
    monkeypatch.setattr(settings, "webdav_url", "https://dav.example.test")
    monkeypatch.setattr(settings, "webdav_username", "user")
    monkeypatch.setattr(settings, "webdav_password", "secret")
    monkeypatch.setattr(settings, "webdav_conflict_policy", "keep_both")
    monkeypatch.setattr(settings, "max_upload_size", 0)

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(webdav, "SessionLocal", sessions)
    yield tmp_path, engine, sessions
    engine.dispose()


def _add_file(sessions, name="a.txt", data=b"abc", folder_id=None):
    stored_name = uuid.uuid4().hex
    with sessions.begin() as db:
        file = FileItem(
            folder_id=folder_id,
            name=name,
            stored_name=stored_name,
            size=len(data),
            mime_type="text/plain",
        )
        db.add(file)
        db.flush()
        file_id = file.id
    (settings.storage_dir / stored_name).write_bytes(data)
    return file_id, stored_name


def _run(monkeypatch, client):
    monkeypatch.setattr(webdav, "WebDavClient", lambda: client)
    return SyncEngine().run()


def test_existing_legacy_sync_path_is_preserved(sync_env, monkeypatch):
    _, _, sessions = sync_env
    file_id, stored_name = _add_file(sessions)
    data = b"abc"
    with sessions.begin() as db:
        db.add(
            SyncState(
                remote_path=f"groups/9/{file_id}-a.txt",
                local_file_id=file_id,
                local_hash=_hash(data),
                local_size=len(data),
                remote_etag=_hash(data),
                remote_size=len(data),
                remote_modified=datetime(2025, 1, 1),
            )
        )
    client = FakeDav({f"groups/9/{file_id}-a.txt": data})

    report = _run(monkeypatch, client)

    assert report.uploaded == 0
    assert report.renamed == 0
    assert not [call for call in client.calls if call[0] == "put"]
    with sessions() as db:
        state = db.query(SyncState).one()
        file = db.get(FileItem, file_id)
        assert state.remote_path == f"groups/9/{file_id}-a.txt"
        assert file.stored_name == stored_name


def test_new_file_uses_stable_flat_path_and_sanitizes_mime(sync_env, monkeypatch):
    _, _, sessions = sync_env
    file_id, _ = _add_file(sessions, name="报告.txt", data="你好".encode())
    client = FakeDav()

    report = _run(monkeypatch, client)

    assert report.uploaded == 1
    assert client.contents[f"files/{file_id}-报告.txt"] == "你好".encode()
    with sessions() as db:
        state = db.query(SyncState).one()
        assert state.remote_path == f"files/{file_id}-报告.txt"
        assert db.get(FileItem, file_id).mime_type == "text/plain"


def test_local_rename_moves_remote_without_overwriting(sync_env, monkeypatch):
    _, _, sessions = sync_env
    file_id, _ = _add_file(sessions, name="old.txt", data=b"abc")
    old_path = f"groups/2/{file_id}-old.txt"
    with sessions.begin() as db:
        db.add(
            SyncState(
                remote_path=old_path,
                local_file_id=file_id,
                local_hash=_hash(b"abc"),
                local_size=3,
                remote_etag=_hash(b"abc"),
                remote_size=3,
            )
        )
        db.get(FileItem, file_id).name = "new.txt"
    target = f"files/{file_id}-new.txt"
    client = FakeDav({old_path: b"abc"})

    report = _run(monkeypatch, client)

    assert report.renamed == 1
    assert old_path not in client.contents
    assert client.contents[target] == b"abc"
    assert ("move", old_path, target) in client.calls
    with sessions() as db:
        assert db.query(SyncState).one().remote_path == target


def test_rename_collision_gets_unique_target_and_preserves_other_file(sync_env, monkeypatch):
    _, _, sessions = sync_env
    file_id, _ = _add_file(sessions, name="new.txt", data=b"local")
    old_path = f"groups/2/{file_id}-old.txt"
    target = f"files/{file_id}-new.txt"
    with sessions.begin() as db:
        db.add(
            SyncState(
                remote_path=old_path,
                local_file_id=file_id,
                local_hash=_hash(b"local"),
                local_size=5,
                remote_etag=_hash(b"local"),
                remote_size=5,
            )
        )
    client = FakeDav({old_path: b"local", target: b"must-not-change"})

    report = _run(monkeypatch, client)

    assert report.renamed == 1
    assert client.contents[target] == b"must-not-change"
    moved = [call for call in client.calls if call[0] == "move"]
    assert len(moved) == 1
    assert moved[0][2].startswith(f"files/{file_id}-new-")


def test_moving_folder_does_not_rewrite_remote_path(sync_env, monkeypatch):
    _, _, sessions = sync_env
    with sessions.begin() as db:
        first = Folder(name="first", description="")
        second = Folder(name="second", description="")
        db.add_all([first, second])
        db.flush()
        first_id, second_id = first.id, second.id
    file_id, _ = _add_file(sessions, folder_id=first_id)
    with sessions.begin() as db:
        db.add(
            SyncState(
                remote_path=f"files/{file_id}-a.txt",
                local_file_id=file_id,
                local_hash=_hash(b"abc"),
                local_size=3,
                remote_etag=_hash(b"abc"),
                remote_size=3,
            )
        )
        db.get(FileItem, file_id).folder_id = second_id
    client = FakeDav({f"files/{file_id}-a.txt": b"abc"})

    report = _run(monkeypatch, client)

    assert report.renamed == 0
    assert not [call for call in client.calls if call[0] == "move"]


def test_remote_unknown_file_is_skipped_and_kept(sync_env, monkeypatch):
    _, _, sessions = sync_env
    _add_file(sessions)
    client = FakeDav({"other/unknown.txt": b"keep"})

    report = _run(monkeypatch, client)

    assert report.skipped == 1
    assert client.contents["other/unknown.txt"] == b"keep"


def test_changed_remote_for_deleted_file_restores_unique_root_copy(sync_env, monkeypatch):
    _, _, sessions = sync_env
    with sessions.begin() as db:
        root = Folder(name="archive", description="")
        db.add(root)
        db.flush()
        folder_id = root.id
    file_id, _ = _add_file(sessions, name="same.txt", folder_id=folder_id)
    _add_file(sessions, name="same.txt")
    path = f"groups/3/{file_id}-same.txt"
    with sessions.begin() as db:
        state = SyncState(
            remote_path=path,
            local_file_id=file_id,
            local_hash=_hash(b"old"),
            local_size=3,
            remote_etag="old-etag",
            remote_size=3,
        )
        db.add(state)
        db.delete(db.get(FileItem, file_id))
        db.flush()
        state.local_file_id = None
    client = FakeDav({path: b"new remote text"})

    report = _run(monkeypatch, client)

    assert report.downloaded == 1
    with sessions() as db:
        restored = db.query(FileItem).filter(FileItem.name.like("same (2)%")).one()
        assert restored.folder_id is None
        assert restored.mime_type == "text/plain"
        assert (settings.storage_dir / restored.stored_name).read_bytes() == b"new remote text"
        assert db.query(SyncState).filter_by(remote_path=path).one().local_file_id == restored.id


def test_commit_failure_does_not_replace_original_file(sync_env, monkeypatch):
    _, _, sessions = sync_env
    file_id, stored_name = _add_file(sessions, data=b"old")
    path = f"files/{file_id}-a.txt"
    with sessions.begin() as db:
        db.add(
            SyncState(
                remote_path=path,
                local_file_id=file_id,
                local_hash=_hash(b"old"),
                local_size=3,
                remote_etag="old-etag",
                remote_size=3,
            )
        )
    db = sessions()
    original_commit = db.commit

    def fail_commit():
        raise RuntimeError("commit failed")

    db.commit = fail_commit
    monkeypatch.setattr(webdav, "SessionLocal", lambda: db)
    client = FakeDav({path: b"new content"})
    monkeypatch.setattr(webdav, "WebDavClient", lambda: client)

    with pytest.raises(RuntimeError, match="commit failed"):
        SyncEngine().run()

    assert (settings.storage_dir / stored_name).read_bytes() == b"old"
    assert db.get(FileItem, file_id) is not None
    db.commit = original_commit
    db.close()


def test_scheduler_run_once_returns_report_and_keeps_error_state():
    scheduler = SyncScheduler(SyncEngine())
    scheduler.engine.run = lambda: SyncReport(uploaded=2)
    assert scheduler.run_once() == {
        "uploaded": 2,
        "downloaded": 0,
        "deleted_local": 0,
        "deleted_remote": 0,
        "renamed": 0,
        "conflicts": 0,
        "skipped": 0,
        "errors": [],
    }
    assert scheduler.last_error is None
    assert scheduler.last_started_at
    assert scheduler.last_finished_at


def test_real_client_move_uses_no_overwrite(monkeypatch):
    client = object.__new__(webdav.WebDavClient)
    client.root = ""
    calls = []

    def list_path(path):
        return [RemoteEntry(path="files/2.txt", is_collection=False)]

    monkeypatch.setattr(client, "list", list_path)
    monkeypatch.setattr(client, "ensure_collection", lambda path: None)
    client._url = lambda path="": f"https://dav.example/{path}"  # type: ignore[method-assign]

    with pytest.raises(FileExistsError):
        client.move("files/1.txt", "files/2.txt")
    assert calls == []
