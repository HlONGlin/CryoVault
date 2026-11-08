import base64
import hashlib
import hmac
import os
import time
from datetime import datetime, timezone

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from .models import FileItem, Folder, Group, Share


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return "pbkdf2_sha256$310000$" + base64.urlsafe_b64encode(salt).decode() + "$" + base64.urlsafe_b64encode(digest).decode()


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations, salt, expected = encoded.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), base64.urlsafe_b64decode(salt), int(iterations)
        )
        return hmac.compare_digest(actual, base64.urlsafe_b64decode(expected))
    except (ValueError, TypeError):
        return False


def cookie_name(share: Share) -> str:
    return "cv_share_" + hashlib.sha256(share.token.encode()).hexdigest()[:20]


def cookie_value(share: Share) -> str:
    expires = str(int(time.time()) + 3600)
    signature = hmac.new(
        share.password_hash.encode(), f"{share.token}:{expires}".encode(), hashlib.sha256
    ).hexdigest()
    return f"{expires}.{signature}"


def cookie_valid(share: Share, value: str) -> bool:
    try:
        expires, signature = value.split(".", 1)
        if int(expires) <= int(time.time()):
            return False
        expected = hmac.new(
            share.password_hash.encode(), f"{share.token}:{expires}".encode(), hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(signature, expected)
    except (ValueError, AttributeError):
        return False


def resolve_share(db: Session, token: str, request: Request, *, allow_locked: bool = False) -> Share:
    share = db.query(Share).filter(Share.token == token).first()
    if share is None:
        raise HTTPException(404, "Share link not found")
    if share.expires_at is not None:
        expires = share.expires_at
        if expires.tzinfo is not None:
            expires = expires.astimezone(timezone.utc).replace(tzinfo=None)
        if expires <= datetime.now(timezone.utc).replace(tzinfo=None):
            raise HTTPException(404, "Share link not found")
    if share.password_hash and not allow_locked:
        candidate = request.cookies.get(cookie_name(share), "")
        if not cookie_valid(share, candidate):
            raise HTTPException(403, "Share password required")
    return share


def contains_folder(db: Session, root_id: int | None, folder_id: int | None) -> bool:
    if root_id is None:
        return True
    seen = set()
    while folder_id is not None and folder_id not in seen:
        if folder_id == root_id:
            return True
        seen.add(folder_id)
        folder = db.get(Folder, folder_id)
        if folder is None:
            return False
        folder_id = folder.parent_id
    return False


def shared_file(db: Session, share: Share, file_id: int) -> FileItem:
    file = db.get(FileItem, file_id)
    if file is None:
        raise HTTPException(404, "File not found")
    if share.target_type == "file":
        allowed = file.id == share.file_id
    elif share.folder_id is None:
        legacy = db.query(Group).filter(Group.share_token == share.token, Group.is_system.is_(True)).first()
        allowed = legacy is not None and file.group_id == legacy.id and file.folder_id is None
    else:
        allowed = contains_folder(db, share.folder_id, file.folder_id)
    if not allowed:
        raise HTTPException(404, "File not found")
    return file
