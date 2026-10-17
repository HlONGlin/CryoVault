from datetime import datetime

from pydantic import BaseModel, Field

from .storage import file_kind


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    allow_edit: bool = False


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    allow_edit: bool | None = None
    regenerate_token: bool = False


class FileDetail(BaseModel):
    id: int
    group_id: int
    name: str
    size: int
    mime_type: str
    kind: str
    created_at: datetime
    updated_at: datetime


class GroupOut(BaseModel):
    id: int
    name: str
    description: str
    share_token: str
    allow_edit: bool
    created_at: datetime
    file_count: int
    total_size: int


class ShareInfo(BaseModel):
    name: str
    description: str
    share_token: str
    allow_edit: bool


class TextContent(BaseModel):
    name: str
    content: str
    updated_at: datetime


class TextUpdate(BaseModel):
    content: str


class FileShareCreate(BaseModel):
    allow_edit: bool = False


class FileShareOut(BaseModel):
    share_token: str
    allow_edit: bool
    created_at: datetime
    file: FileDetail


class PublicFileShare(BaseModel):
    share_token: str
    allow_edit: bool
    file: FileDetail


class DirectInfo(BaseModel):
    group_id: int
    files: list[FileDetail]


def to_file_out(f) -> FileDetail:
    return FileDetail(
        id=f.id,
        group_id=f.group_id,
        name=f.name,
        size=f.size,
        mime_type=f.mime_type,
        kind=file_kind(f.name, f.mime_type),
        created_at=f.created_at,
        updated_at=f.updated_at,
    )


def to_file_share_out(share) -> FileShareOut:
    return FileShareOut(
        share_token=share.share_token,
        allow_edit=share.allow_edit,
        created_at=share.created_at,
        file=to_file_out(share.file),
    )


def to_public_file_share(share) -> PublicFileShare:
    return PublicFileShare(
        share_token=share.share_token,
        allow_edit=share.allow_edit,
        file=to_file_out(share.file),
    )


def to_group_out(g) -> GroupOut:
    return GroupOut(
        id=g.id,
        name=g.name,
        description=g.description,
        share_token=g.share_token,
        allow_edit=g.allow_edit,
        created_at=g.created_at,
        file_count=len(g.files),
        total_size=sum(f.size for f in g.files),
    )
