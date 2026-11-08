import sqlite3

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

    assert shares == {"group-token": "folder", "root-token": "folder", "file-token": "file"}
    assert folders == [(1, "Docs")]
    assert rows == [(10, 1, 1, "uuid-a"), (11, 2, None, "uuid-b")]
    assert state == ("groups/1/10-a.txt", 10)
    engine.dispose()
