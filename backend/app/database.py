from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
import shutil
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
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
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
        system_expr = "is_system" if "is_system" in columns else "0 AS is_system"
        groups = connection.execute(
            text(f"SELECT id, name, description, share_token, allow_edit, {system_expr}, created_at FROM groups")
        ).mappings().all()
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
            text("SELECT id FROM folders WHERE name = :name AND parent_id IS NULL"),
            {"name": group["name"]},
        ).scalar()
        if existing is None:
            existing = connection.execute(
                text("INSERT INTO folders(name, description, created_at, updated_at) VALUES (:name, :description, :created_at, :created_at)"),
                {"name": group["name"], "description": group["description"], "created_at": group["created_at"]},
            ).lastrowid
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


def migrate() -> None:
    from . import models  # noqa: F401

    with engine.connect() as connection:
        if not _table_exists(connection, "schema_version"):
            current = 0
        else:
            current = connection.execute(
                text("SELECT version FROM schema_version WHERE id = 1")
            ).scalar() or 0
        if current >= 1:
            return
    with engine.begin() as connection:
        _ensure_schema_version(connection)
        _migrate_v1(connection)
        connection.execute(text("UPDATE schema_version SET version = 1 WHERE id = 1"))


def init_db() -> None:
    from . import models  # noqa: F401

    with engine.connect() as connection:
        legacy = _table_exists(connection, "groups") and not _table_exists(connection, "schema_version")
        pending = _table_exists(connection, "schema_version") and (
            connection.execute(text("SELECT version FROM schema_version WHERE id = 1")).scalar() or 0
        ) < 1
    if legacy or pending:
        backup_database()
    Base.metadata.create_all(bind=engine)
    migrate()
