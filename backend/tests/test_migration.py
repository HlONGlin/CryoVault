import sqlite3
import os
from pathlib import Path
import subprocess
import sys

import pytest
from sqlalchemy import create_engine, text

from app.database import _migrate_v1


def test_v1_migration_preserves_tokens_files_and_sync_paths(tmp_path):
    db_path = tmp_path / "legacy.db"
    connection = sqlite3.connect(db_path)
    connection.executescript("""
        PRAGMA foreign_keys=ON;
        CREATE TABLE groups (
            id INTEGER PRIMARY KEY, name VARCHAR(200), description TEXT,
            share_token VARCHAR(32), allow_edit BOOLEAN, is_system BOOLEAN,
            created_at DATETIME
        );
        CREATE TABLE files (
            id INTEGER PRIMARY KEY, group_id INTEGER, name VARCHAR(512),
            stored_name VARCHAR(64), size INTEGER, mime_type VARCHAR(200),
            created_at DATETIME, updated_at DATETIME
        );
        CREATE TABLE file_shares (
            id INTEGER PRIMARY KEY, file_id INTEGER, share_token VARCHAR(32),
            allow_edit BOOLEAN, created_at DATETIME
        );
        CREATE TABLE sync_states (
            id INTEGER PRIMARY KEY, remote_path VARCHAR(1024), local_file_id INTEGER,
            local_hash VARCHAR(64), local_size INTEGER, remote_etag VARCHAR(512),
            remote_size INTEGER, remote_modified DATETIME, last_synced_at DATETIME
        );
        INSERT INTO groups VALUES (1, 'Docs', 'desc', 'group-token', 1, 0, '2024-01-01');
        INSERT INTO groups VALUES (2, 'Direct', '', 'root-token', 0, 1, '2024-01-02');
        INSERT INTO groups VALUES (3, 'Docs', 'another', 'other-token', 0, 0, '2024-01-03');
        INSERT INTO files VALUES (10, 1, 'a.txt', 'uuid-a', 3, 'text/plain', '2024-01-01', '2024-01-01');
        INSERT INTO files VALUES (11, 2, 'b.txt', 'uuid-b', 4, 'text/plain', '2024-01-02', '2024-01-02');
        INSERT INTO file_shares VALUES (5, 10, 'file-token', 1, '2024-01-03');
        INSERT INTO sync_states VALUES (8, 'groups/1/10-a.txt', 10, 'hash', 3, 'etag', 3, NULL, '2024-01-03');
    """)
    connection.commit()
    connection.close()

    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as migrated:
        _migrate_v1(migrated)
        _migrate_v1(migrated)
    with engine.connect() as migrated:
        shares = dict(migrated.execute(text("SELECT token, target_type FROM shares")).all())
        folders = migrated.execute(text("SELECT id, name FROM folders")).all()
        rows = migrated.execute(text("SELECT id, group_id, folder_id, stored_name FROM files ORDER BY id")).all()
        state = migrated.execute(text("SELECT remote_path, local_file_id FROM sync_states")).one()

    assert shares == {"group-token": "folder", "root-token": "folder", "other-token": "folder", "file-token": "file"}
    assert folders == [(1, "Docs"), (2, "Docs (2)")]
    assert rows == [(10, 1, 1, "uuid-a"), (11, 2, None, "uuid-b")]
    assert state == ("groups/1/10-a.txt", 10)
    engine.dispose()


def test_conflicting_legacy_tokens_abort_transaction(tmp_path):
    db_path = tmp_path / "conflict.db"
    connection = sqlite3.connect(db_path)
    connection.executescript("""
        CREATE TABLE groups (id INTEGER PRIMARY KEY, name TEXT, description TEXT,
            share_token TEXT, allow_edit BOOLEAN, is_system BOOLEAN, created_at DATETIME);
        CREATE TABLE files (id INTEGER PRIMARY KEY, group_id INTEGER);
        CREATE TABLE file_shares (id INTEGER PRIMARY KEY, file_id INTEGER,
            share_token TEXT, allow_edit BOOLEAN, created_at DATETIME);
        INSERT INTO groups VALUES (1, 'a', '', 'collision', 0, 0, '2024-01-01');
        INSERT INTO file_shares VALUES (1, 1, 'collision', 0, '2024-01-01');
    """)
    connection.close()
    engine = create_engine(f"sqlite:///{db_path}")
    with pytest.raises(RuntimeError, match="tokens conflict"):
        with engine.begin() as migrated:
            migrated.exec_driver_sql("BEGIN IMMEDIATE")
            _migrate_v1(migrated)
    with engine.connect() as migrated:
        assert migrated.execute(text("SELECT share_token FROM groups")).scalar() == "collision"
        assert migrated.execute(text("SELECT share_token FROM file_shares")).scalar() == "collision"
        assert not migrated.execute(text(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='folders'"
        )).first()
        assert "folder_id" not in [row[1] for row in migrated.exec_driver_sql("PRAGMA table_info(files)")]
    engine.dispose()


def test_startup_creates_restorable_backup_before_migration(tmp_path):
    db_path = tmp_path / "cryovault.db"
    connection = sqlite3.connect(db_path)
    connection.executescript("""
        CREATE TABLE groups (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
            description TEXT NOT NULL, share_token TEXT NOT NULL,
            allow_edit BOOLEAN NOT NULL, is_system BOOLEAN NOT NULL, created_at DATETIME NOT NULL);
        CREATE TABLE files (id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL,
            name TEXT NOT NULL, stored_name TEXT NOT NULL, size INTEGER NOT NULL,
            mime_type TEXT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL);
        CREATE TABLE file_shares (id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            share_token TEXT NOT NULL, allow_edit BOOLEAN NOT NULL, created_at DATETIME NOT NULL);
        CREATE TABLE sync_states (id INTEGER PRIMARY KEY, remote_path TEXT UNIQUE,
            local_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL, local_hash TEXT,
            local_size INTEGER, remote_etag TEXT, remote_size INTEGER, remote_modified DATETIME,
            last_synced_at DATETIME);
        INSERT INTO groups VALUES (7, 'docs', 'notes', 'old-group-token', 1, 0, '2024-01-01');
        INSERT INTO files VALUES (11, 7, 'a.txt', 'stored-id', 3, 'text/plain',
            '2024-01-01', '2024-01-01');
        INSERT INTO file_shares VALUES (3, 11, 'old-file-token', 0, '2024-01-01');
        INSERT INTO sync_states VALUES (2, 'groups/7/11-a.txt', 11, 'hash', 3, 'etag', 3, NULL, '2024-01-01');
    """)
    connection.commit()
    connection.close()
    storage = tmp_path / "storage"
    storage.mkdir()
    (storage / "stored-id").write_bytes(b"abc")
    env = os.environ.copy()
    env["CRYOVAULT_DATA_DIR"] = str(tmp_path)
    backend = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, "-c", "from app.database import init_db; init_db(); init_db()"],
        cwd=backend, env=env, capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    backups = list(tmp_path.glob("cryovault.db.pre-v0.3.0-*.bak"))
    assert len(backups) == 1
    with sqlite3.connect(backups[0]) as backup:
        assert backup.execute("SELECT share_token FROM groups").fetchone() == ("old-group-token",)
        assert backup.execute("SELECT stored_name FROM files").fetchone() == ("stored-id",)
        assert not backup.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='folders'"
        ).fetchone()
    with sqlite3.connect(db_path) as migrated:
        assert set(migrated.execute("SELECT token FROM shares").fetchall()) == {
            ("old-group-token",), ("old-file-token",)
        }
        assert migrated.execute("SELECT remote_path, local_file_id FROM sync_states").fetchone() == (
            "groups/7/11-a.txt", 11
        )
        assert migrated.execute("PRAGMA foreign_key_check").fetchall() == []
        assert next(row for row in migrated.execute("PRAGMA table_info(files)") if row[1] == "group_id")[3] == 0
    assert (storage / "stored-id").read_bytes() == b"abc"
