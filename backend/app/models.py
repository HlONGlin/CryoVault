import secrets
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def gen_token() -> str:
    return secrets.token_urlsafe(16)


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    share_token: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, default=gen_token
    )
    allow_edit: Mapped[bool] = mapped_column(Boolean, default=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    files: Mapped[list["FileItem"]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="FileItem.created_at.desc()",
    )


class FileItem(Base):
    __tablename__ = "files"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(512))
    stored_name: Mapped[str] = mapped_column(String(64), unique=True)
    size: Mapped[int] = mapped_column(default=0)
    mime_type: Mapped[str] = mapped_column(String(200), default="application/octet-stream")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    group: Mapped[Group] = relationship(back_populates="files")
    share: Mapped["FileShare"] = relationship(
        back_populates="file",
        uselist=False,
        cascade="all, delete-orphan",
    )


class FileShare(Base):
    __tablename__ = "file_shares"

    id: Mapped[int] = mapped_column(primary_key=True)
    file_id: Mapped[int] = mapped_column(
        ForeignKey("files.id", ondelete="CASCADE"), unique=True, index=True
    )
    share_token: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, default=gen_token
    )
    allow_edit: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    file: Mapped[FileItem] = relationship(back_populates="share")


class SyncState(Base):
    """The last known local and WebDAV versions of one remote path.

    ``local_file_id`` is nullable so a local deletion can be detected and
    propagated to the remote side on the next run.
    """

    __tablename__ = "sync_states"

    id: Mapped[int] = mapped_column(primary_key=True)
    remote_path: Mapped[str] = mapped_column(String(1024), unique=True, index=True)
    local_file_id: Mapped[int] = mapped_column(
        ForeignKey("files.id", ondelete="SET NULL"), nullable=True, index=True
    )
    local_hash: Mapped[str] = mapped_column(String(64), default="")
    local_size: Mapped[int] = mapped_column(Integer, default=0)
    remote_etag: Mapped[str] = mapped_column(String(512), default="")
    remote_size: Mapped[int] = mapped_column(Integer, default=0)
    remote_modified: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
