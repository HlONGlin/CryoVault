from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False, "timeout": 15},
)


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=15000")
    finally:
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _database_path() -> Path:
    return settings.data_dir / "cryovault.db"


def backup_database() -> Path | None:
    source = _database_path()
    if not source.exists():
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    target = source.with_name(f"{source.name}.pre-v0.3.0-{stamp}.bak")
    source_conn = sqlite3.connect(source)
    target_conn = sqlite3.connect(target)
    try:
        source_conn.backup(target_conn)
    finally:
        target_conn.close()
        source_conn.close()
    return target


def _table_exists(connection, table: str) -> bool:
    return inspect(connection).has_table(table)


def _ensure_schema_version(connection) -> int:
    connection.execute(
        text(
            "CREATE TABLE IF NOT EXISTS schema_version "
            "(id INTEGER PRIMARY KEY, version INTEGER NOT NULL)"
        )
    )
    value = connection.execute(
        text("SELECT version FROM schema_version WHERE id = 1")
    ).scalar()
    if value is None:
        connection.execute(text("INSERT INTO schema_version(id, version) VALUES (1, 0)"))
        return 0
    return int(value)


def _migrate_v1(connection) -> None:
    inspector = inspect(connection)
    connection.execute(text(
        "CREATE TABLE IF NOT EXISTS legacy_group_folders "
        "(group_id INTEGER PRIMARY KEY, folder_id INTEGER NOT NULL UNIQUE)"
    ))
    if _table_exists(connection, "files"):
        file_columns = {column["name"] for column in inspector.get_columns("files")}
        if "folder_id" not in file_columns:
            connection.execute(text("ALTER TABLE files ADD COLUMN folder_id INTEGER"))

    if not _table_exists(connection, "folders"):
        connection.execute(text("""
            CREATE TABLE folders (
                id INTEGER PRIMARY KEY,
                parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
                name VARCHAR(200) NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        connection.execute(text("CREATE INDEX ix_folders_parent_id ON folders(parent_id)"))

    if not _table_exists(connection, "shares"):
        connection.execute(text("""
            CREATE TABLE shares (
                id INTEGER PRIMARY KEY,
                token VARCHAR(64) NOT NULL UNIQUE,
                target_type VARCHAR(16) NOT NULL,
                file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
                folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
                allow_edit BOOLEAN NOT NULL DEFAULT 0,
                expires_at DATETIME,
                password_hash TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        connection.execute(text("CREATE UNIQUE INDEX ix_shares_token ON shares(token)"))
        connection.execute(text("CREATE INDEX ix_shares_file_id ON shares(file_id)"))
        connection.execute(text("CREATE INDEX ix_shares_folder_id ON shares(folder_id)"))

    groups = []
    if _table_exists(connection, "groups"):
        columns = {column["name"] for column in inspect(connection).get_columns("groups")}
        if "is_system" not in columns:
            connection.execute(text("ALTER TABLE groups ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT 0"))
            columns.add("is_system")
        system_expr = "is_system" if "is_system" in columns else "0 AS is_system"
        groups = connection.execute(
            text(f"SELECT id, name, description, share_token, allow_edit, {system_expr}, created_at FROM groups")
        ).mappings().all()
    tokens = [group["share_token"] for group in groups]
    if _table_exists(connection, "file_shares"):
        tokens.extend(connection.execute(text("SELECT share_token FROM file_shares")).scalars())
    if len(tokens) != len(set(tokens)):
        raise RuntimeError("Legacy share tokens conflict; migration stopped without changing data")
    folder_by_group: dict[int, int | None] = {}
    for group in groups:
        if group["is_system"]:
            folder_by_group[group["id"]] = None
            connection.execute(
                text("INSERT OR IGNORE INTO shares(token, target_type, folder_id, allow_edit, created_at) "
                     "VALUES (:token, 'folder', NULL, :allow_edit, :created_at)"),
                {"token": group["share_token"], "allow_edit": group["allow_edit"], "created_at": group["created_at"]},
            )
            continue
        existing = connection.execute(
            text("SELECT folder_id FROM legacy_group_folders WHERE group_id = :id"),
            {"id": group["id"]},
        ).scalar()
        if existing is None:
            name = group["name"]
            suffix = 2
            while connection.execute(
                text("SELECT 1 FROM folders WHERE name = :name AND parent_id IS NULL"),
                {"name": name},
            ).first():
                name = f'{group["name"]} ({suffix})'
                suffix += 1
            existing = connection.execute(
                text("INSERT INTO folders(name, description, created_at, updated_at) VALUES (:name, :description, :created_at, :created_at)"),
                {"name": name, "description": group["description"], "created_at": group["created_at"]},
            ).lastrowid
            connection.execute(
                text("INSERT INTO legacy_group_folders(group_id, folder_id) VALUES (:group_id, :folder_id)"),
                {"group_id": group["id"], "folder_id": existing},
            )
        folder_by_group[group["id"]] = int(existing)
        connection.execute(
            text("INSERT OR IGNORE INTO shares(token, target_type, folder_id, allow_edit, created_at) "
                 "VALUES (:token, 'folder', :folder_id, :allow_edit, :created_at)"),
            {"token": group["share_token"], "folder_id": existing, "allow_edit": group["allow_edit"], "created_at": group["created_at"]},
        )

    for group_id, folder_id in folder_by_group.items():
        connection.execute(
            text("UPDATE files SET folder_id = :folder_id WHERE group_id = :group_id AND folder_id IS NULL"),
            {"folder_id": folder_id, "group_id": group_id},
        )

    if _table_exists(connection, "file_shares"):
        connection.execute(text("""
            INSERT OR IGNORE INTO shares(token, target_type, file_id, allow_edit, created_at)
            SELECT share_token, 'file', file_id, allow_edit, created_at FROM file_shares
        """))


def _migrate_v2(connection) -> None:
    if not _table_exists(connection, "files"):
        return
    columns = inspect(connection).get_columns("files")
    group_column = next(column for column in columns if column["name"] == "group_id")
    if group_column["nullable"]:
        return
    expected = {"id", "group_id", "folder_id", "name", "stored_name", "size",
                "mime_type", "created_at", "updated_at"}
    if {column["name"] for column in columns} != expected:
        raise RuntimeError("Unexpected files schema; migration stopped")
    custom_objects = connection.execute(text(
        "SELECT name FROM sqlite_master WHERE tbl_name='files' AND "
        "(type='trigger' OR (type='index' AND sql IS NOT NULL AND "
        "name NOT IN ('ix_files_group_id', 'ix_files_folder_id')))"
    )).all()
    if custom_objects:
        raise RuntimeError("Custom files indexes or triggers require manual migration")
    connection.execute(text("""
        CREATE TABLE files_v2 (
            id INTEGER PRIMARY KEY,
            group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
            folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
            name VARCHAR(512) NOT NULL,
            stored_name VARCHAR(64) NOT NULL UNIQUE,
            size INTEGER NOT NULL,
            mime_type VARCHAR(200) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """))
    connection.execute(text("""
        INSERT INTO files_v2
        SELECT id, group_id, folder_id, name, stored_name, size, mime_type, created_at, updated_at
        FROM files
    """))
    connection.execute(text("DROP TABLE files"))
    connection.execute(text("ALTER TABLE files_v2 RENAME TO files"))
    connection.execute(text("CREATE INDEX ix_files_group_id ON files(group_id)"))
    connection.execute(text("CREATE INDEX ix_files_folder_id ON files(folder_id)"))


def _migrate_v3(connection) -> None:
    if not _table_exists(connection, "files") or not _table_exists(connection, "folders"):
        return
    occupied: dict[int | None, set[str]] = {}
    folders = connection.execute(text("SELECT id, parent_id, name FROM folders ORDER BY id")).all()
    for folder_id, parent_id, name in folders:
        names = occupied.setdefault(parent_id, set())
        candidate, suffix = name, 2
        while candidate in names:
            candidate = f"{name} ({suffix})"
            suffix += 1
        if candidate != name:
            connection.execute(text("UPDATE folders SET name=:name WHERE id=:id"), {"name": candidate, "id": folder_id})
        names.add(candidate)
    files = connection.execute(text("SELECT id, folder_id, name FROM files ORDER BY id")).all()
    for file_id, folder_id, name in files:
        names = occupied.setdefault(folder_id, set())
        stem, dot, extension = name.rpartition(".")
        stem = stem if dot else name
        suffix = f".{extension}" if dot else ""
        candidate, index = name, 2
        while candidate in names:
            candidate = f"{stem} ({index}){suffix}"
            index += 1
        if candidate != name:
            connection.execute(text("UPDATE files SET name=:name WHERE id=:id"), {"name": candidate, "id": file_id})
        names.add(candidate)


def migrate() -> None:
    from . import models  # noqa: F401

    with engine.connect() as connection:
        if not _table_exists(connection, "schema_version"):
            current = 0
        else:
            current = connection.execute(
                text("SELECT version FROM schema_version WHERE id = 1")
            ).scalar() or 0
        if current >= 3:
            return
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
            current = _ensure_schema_version(connection)
            if current < 1:
                _migrate_v1(connection)
            elif current == 1 and not _table_exists(connection, "legacy_group_folders"):
                raise RuntimeError(
                    "Incomplete v1 migration detected; restore the pre-migration backup before upgrading"
                )
            if current < 2:
                _migrate_v2(connection)
            if current < 3:
                _migrate_v3(connection)
            if connection.exec_driver_sql("PRAGMA foreign_key_check").first():
                raise RuntimeError("Foreign key validation failed; migration rolled back")
            connection.execute(text("UPDATE schema_version SET version = 3 WHERE id = 1"))
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")


def init_db() -> None:
    from . import models  # noqa: F401

    with engine.connect() as connection:
        legacy = _table_exists(connection, "groups") and not _table_exists(connection, "schema_version")
        pending = _table_exists(connection, "schema_version") and (
            connection.execute(text("SELECT version FROM schema_version WHERE id = 1")).scalar() or 0
        ) < 3
    if legacy or pending:
        backup_database()
    migrate()
    Base.metadata.create_all(bind=engine)
