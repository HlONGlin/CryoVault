from __future__ import annotations

import os
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

from .config import settings
from .models import WebDavSettings


def _cipher() -> Fernet:
    key_path = settings.data_dir / ".webdav-settings.key"
    if not key_path.exists():
        key_path.write_bytes(Fernet.generate_key())
        try:
            os.chmod(key_path, 0o600)
        except OSError:
            pass
    return Fernet(key_path.read_bytes())


def _decrypt(value: str) -> str:
    if not value:
        return ""
    return _cipher().decrypt(value.encode("ascii")).decode("utf-8")


def _encrypt(value: str) -> str:
    return _cipher().encrypt(value.encode("utf-8")).decode("ascii") if value else ""


def get_or_create(db: Session) -> WebDavSettings:
    row = db.get(WebDavSettings, 1)
    if row is None:
        row = WebDavSettings(
            id=1,
            enabled=settings.webdav_enabled,
            url=settings.webdav_url,
            username=settings.webdav_username,
            password_encrypted=_encrypt(settings.webdav_password),
            root=settings.webdav_root,
            interval_seconds=settings.webdav_interval_seconds,
            conflict_policy=settings.webdav_conflict_policy,
            verify_tls=settings.webdav_verify_tls,
            timeout=int(settings.webdav_timeout),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def public_settings(row: WebDavSettings) -> dict:
    return {
        "enabled": row.enabled,
        "url": row.url,
        "username": row.username,
        "password_configured": bool(row.password_encrypted),
        "root": row.root,
        "interval_seconds": row.interval_seconds,
        "conflict_policy": row.conflict_policy,
        "verify_tls": row.verify_tls,
        "timeout": row.timeout,
    }


def apply_to_runtime(row: WebDavSettings) -> None:
    settings.webdav_enabled = row.enabled
    settings.webdav_url = row.url
    settings.webdav_username = row.username
    settings.webdav_password = _decrypt(row.password_encrypted)
    settings.webdav_root = row.root
    settings.webdav_interval_seconds = row.interval_seconds
    settings.webdav_conflict_policy = row.conflict_policy
    settings.webdav_verify_tls = row.verify_tls
    settings.webdav_timeout = float(row.timeout)


def update_settings(db: Session, payload: dict) -> WebDavSettings:
    row = get_or_create(db)
    row.enabled = payload["enabled"]
    row.url = payload["url"].strip().rstrip("/")
    row.username = payload["username"].strip()
    if payload.get("password"):
        row.password_encrypted = _encrypt(payload["password"])
    elif payload.get("clear_password"):
        row.password_encrypted = ""
    row.root = payload["root"].strip() or "/CryoVault"
    row.interval_seconds = payload["interval_seconds"]
    row.conflict_policy = payload["conflict_policy"]
    row.verify_tls = payload["verify_tls"]
    row.timeout = payload["timeout"]
    db.commit()
    db.refresh(row)
    apply_to_runtime(row)
    return row


def load_saved_settings(session_factory) -> None:
    with session_factory() as db:
        row = db.get(WebDavSettings, 1)
        if row is not None:
            apply_to_runtime(row)
