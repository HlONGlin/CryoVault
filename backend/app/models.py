import secrets
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def gen_token() -> str:
    return secrets.token_urlsafe(9)


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    share_token: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, default=gen_token
    )
    allow_edit: Mapped[bool] = mapped_column(Boolean, default=False)
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
