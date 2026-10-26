"""Small WebDAV client and bidirectional CryoVault synchronizer.

The application stores files in a flat private directory and keeps their
names in SQLite.  The synchronizer presents a stable remote namespace of
``groups/<group id>/<file name>`` and records both sides' last known version
in ``sync_states``.  This lets us detect changes and deletions without
overwriting a newer copy silently.
"""

from __future__ import annotations

import hashlib
import mimetypes
import posixpath
import shutil
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
from xml.etree import ElementTree

import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal
from .models import FileItem, Group, SyncState
from .operations import stored_path


DAV_PROPFIND = """<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype />
    <d:getetag />
    <d:getcontentlength />
    <d:getlastmodified />
    <d:getcontenttype />
  </d:prop>
</d:propfind>"""


@dataclass
class RemoteEntry:
    path: str
    is_collection: bool
    etag: str = ""
    size: int = 0
    modified: datetime | None = None
    content_type: str = "application/octet-stream"


@dataclass
class SyncReport:
    uploaded: int = 0
    downloaded: int = 0
    deleted_local: int = 0
    deleted_remote: int = 0
    renamed: int = 0
    conflicts: int = 0
    skipped: int = 0
    errors: list[str] | None = None

    def __post_init__(self) -> None:
        if self.errors is None:
            self.errors = []

    def as_dict(self) -> dict:
        return {
            "uploaded": self.uploaded,
            "downloaded": self.downloaded,
            "deleted_local": self.deleted_local,
            "deleted_remote": self.deleted_remote,
            "renamed": self.renamed,
            "conflicts": self.conflicts,
            "skipped": self.skipped,
            "errors": self.errors,
        }


def _clean_relative(path: str) -> str:
    path = unquote(path).replace("\\", "/").strip("/")
    parts = [part for part in path.split("/") if part not in ("", ".")]
    if any(part == ".." for part in parts):
        raise ValueError("unsafe WebDAV path")
    return "/".join(parts)


def _utc_naive(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _parse_modified(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return _utc_naive(parsedate_to_datetime(value))
    except (TypeError, ValueError, OverflowError):
        return None


class WebDavClient:
    def __init__(self) -> None:
        raw_url = (settings.webdav_url or "").strip()
        if not raw_url:
            raise ValueError("CRYOVAULT_WEBDAV_URL is not configured")
        self.base_url = raw_url.rstrip("/")
        self.root = _clean_relative(settings.webdav_root or "")
        self.client = httpx.Client(
            auth=(settings.webdav_username, settings.webdav_password),
            timeout=float(settings.webdav_timeout),
            verify=settings.webdav_verify_tls,
            follow_redirects=True,
        )

    def close(self) -> None:
        self.client.close()

    def _url(self, path: str = "") -> str:
        relative = _clean_relative(path)
        pieces = [part for part in (self.root, relative) if part]
        suffix = "/".join(quote(part, safe="") for part in "/".join(pieces).split("/"))
        return f"{self.base_url}/{suffix}" if suffix else f"{self.base_url}/"

    def _relative_from_href(self, href: str) -> str:
        parsed = urlparse(href)
        value = parsed.path if parsed.path else href
        value = _clean_relative(value)
        root = self.root
        if value == root:
            return ""
        prefix = root + "/" if root else ""
        if prefix and value.startswith(prefix):
            return value[len(prefix) :].strip("/")
        # Some servers return a relative path without the configured root.
        return value.strip("/")

    def list(self, path: str = "") -> list[RemoteEntry]:
        response = self.client.request(
            "PROPFIND",
            self._url(path),
            headers={"Depth": "1", "Content-Type": "application/xml; charset=utf-8"},
            content=DAV_PROPFIND.encode("utf-8"),
        )
        response.raise_for_status()
        try:
            root = ElementTree.fromstring(response.content)
        except ElementTree.ParseError as exc:
            raise RuntimeError("WebDAV returned invalid XML") from exc

        entries: list[RemoteEntry] = []
        for item in root.iter():
            if item.tag.rsplit("}", 1)[-1] != "response":
                continue
            href = next(
                (child.text for child in item if child.tag.rsplit("}", 1)[-1] == "href"),
                None,
            )
            if not href:
                continue
            relative = self._relative_from_href(href)
            if relative == _clean_relative(path):
                continue
            prop = None
            for child in item:
                if child.tag.rsplit("}", 1)[-1] == "propstat":
                    prop = next(
                        (p for p in child if p.tag.rsplit("}", 1)[-1] == "prop"),
                        None,
                    )
                    if prop is not None:
                        break
            if prop is None:
                continue
            values = {
                child.tag.rsplit("}", 1)[-1]: child for child in prop
            }
            resource_type = values.get("resourcetype")
            is_collection = resource_type is not None and any(
                c.tag.rsplit("}", 1)[-1] == "collection" for c in resource_type
            )
            size_text = (values.get("getcontentlength").text if values.get("getcontentlength") is not None else "")
            try:
                size = int(size_text or 0)
            except ValueError:
                size = 0
            entries.append(
                RemoteEntry(
                    path=relative,
                    is_collection=is_collection,
                    etag=(values.get("getetag").text or "").strip()
                    if values.get("getetag") is not None
                    else "",
                    size=size,
                    modified=_parse_modified(
                        values.get("getlastmodified").text
                        if values.get("getlastmodified") is not None
                        else None
                    ),
                    content_type=(values.get("getcontenttype").text or "").strip()
                    if values.get("getcontenttype") is not None
                    else "application/octet-stream",
                )
            )
        return entries

    def walk(self) -> dict[str, RemoteEntry]:
        result: dict[str, RemoteEntry] = {}
        for entry in self.list(""):
            if not entry.is_collection:
                result[entry.path] = entry
                continue
            for child in self.list(entry.path):
                if not child.is_collection:
                    result[child.path] = child
        return result

    def ensure_collection(self, path: str) -> None:
        parts = _clean_relative(path).split("/")
        current: list[str] = []
        for part in parts:
            current.append(part)
            response = self.client.request("MKCOL", self._url("/".join(current)))
            if response.status_code not in (201, 405, 301, 302):
                response.raise_for_status()

    def ensure_root(self) -> None:
        """Create the configured root path when the provider supports MKCOL."""
        current: list[str] = []
        for part in self.root.split("/") if self.root else []:
            current.append(part)
            suffix = "/".join(quote(item, safe="") for item in current)
            response = self.client.request("MKCOL", f"{self.base_url}/{suffix}")
            if response.status_code not in (201, 405, 301, 302):
                response.raise_for_status()

    def put_file(self, path: str, source: Path) -> RemoteEntry | None:
        parent = posixpath.dirname(_clean_relative(path))
        if parent:
            self.ensure_collection(parent)
        with source.open("rb") as stream:
            response = self.client.put(self._url(path), content=stream)
        response.raise_for_status()
        # The next PROPFIND gives us a reliable ETag on servers that generate it.
        parent_entries = self.list(parent)
        return next((entry for entry in parent_entries if entry.path == _clean_relative(path)), None)

    def download_file(self, path: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.part")
        try:
            with self.client.stream("GET", self._url(path)) as response:
                response.raise_for_status()
                with temp.open("wb") as output:
                    for chunk in response.iter_bytes(1024 * 1024):
                        output.write(chunk)
            temp.replace(destination)
        except Exception:
            temp.unlink(missing_ok=True)
            raise

    def delete(self, path: str) -> None:
        response = self.client.delete(self._url(path))
        if response.status_code != 404:
            response.raise_for_status()

    def move(self, source: str, destination: str) -> None:
        parent = posixpath.dirname(_clean_relative(destination))
        if parent:
            self.ensure_collection(parent)
        response = self.client.request(
            "MOVE",
            self._url(source),
            headers={"Destination": self._url(destination), "Overwrite": "T"},
        )
        response.raise_for_status()

    def test(self) -> None:
        response = self.client.request(
            "PROPFIND",
            self._url(""),
            headers={"Depth": "0", "Content-Type": "application/xml; charset=utf-8"},
            content=DAV_PROPFIND.encode("utf-8"),
        )
        response.raise_for_status()


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _remote_path(group: Group, file: FileItem) -> str:
    # Group and file IDs make names unique even when the UI contains duplicate
    # filenames. The original filename remains readable after the ID prefix.
    safe_name = (file.name or "untitled").replace("\\", "/").rsplit("/", 1)[-1]
    return f"groups/{group.id}/{file.id}-{safe_name}"


def _split_remote_path(path: str) -> tuple[int, str] | None:
    parts = _clean_relative(path).split("/")
    if len(parts) != 3 or parts[0] != "groups":
        return None
    try:
        group_id = int(parts[1])
    except ValueError:
        return None
    return group_id, parts[2]


def _conflict_name(name: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    stem, dot, suffix = name.rpartition(".")
    return f"{stem or name} (conflict {stamp}){dot}{suffix}" if dot else f"{name} (conflict {stamp})"


def _create_local_from_path(
    db: Session,
    group: Group,
    name: str,
    source: Path,
    content_type: str,
) -> FileItem:
    size = source.stat().st_size
    if settings.max_upload_size and size > settings.max_upload_size:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "Remote file exceeds the configured upload limit",
        )
    stored_name = uuid.uuid4().hex
    destination = settings.storage_dir / stored_name
    shutil.move(str(source), str(destination))
    file = FileItem(
        group_id=group.id,
        name=name,
        stored_name=stored_name,
        size=size,
        mime_type=content_type or mimetypes.guess_type(name)[0] or "application/octet-stream",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class SyncEngine:
    def __init__(self) -> None:
        self.lock = threading.Lock()

    def configured(self) -> bool:
        return bool(
            settings.webdav_enabled
            and settings.webdav_url.strip()
            and settings.webdav_username
            and settings.webdav_password
        )

    def test_connection(self) -> None:
        client = WebDavClient()
        try:
            client.test()
        finally:
            client.close()

    def run(self) -> SyncReport:
        if not self.configured():
            raise RuntimeError(
                "WebDAV is not configured; set CRYOVAULT_WEBDAV_URL, "
                "CRYOVAULT_WEBDAV_USERNAME and CRYOVAULT_WEBDAV_PASSWORD"
            )
        if not self.lock.acquire(blocking=False):
            raise RuntimeError("A WebDAV synchronization is already running")
        try:
            return self._run_locked()
        finally:
            self.lock.release()

    def _run_locked(self) -> SyncReport:
        report = SyncReport()
        db = SessionLocal()
        client = WebDavClient()
        temp_dir = settings.data_dir / ".webdav-sync"
        temp_dir.mkdir(parents=True, exist_ok=True)
        try:
            client.ensure_root()
            client.ensure_collection("groups")
            remote = client.walk()
            groups = {group.id: group for group in db.query(Group).all()}
            files = db.query(FileItem).all()
            states = db.query(SyncState).all()
            by_path = {state.remote_path: state for state in states}
            by_file = {state.local_file_id: state for state in states if state.local_file_id is not None}

            # A local rename keeps the same FileItem ID, so move the remote copy
            # before processing content changes.
            for file in files:
                state = by_file.get(file.id)
                if state is None:
                    continue
                current_path = _remote_path(file.group, file)
                if state.remote_path == current_path:
                    continue
                old_remote = remote.get(state.remote_path)
                if old_remote and current_path not in remote:
                    client.move(state.remote_path, current_path)
                    remote[current_path] = RemoteEntry(
                        path=current_path,
                        is_collection=False,
                        etag=old_remote.etag,
                        size=old_remote.size,
                        modified=old_remote.modified,
                        content_type=old_remote.content_type,
                    )
                    remote.pop(state.remote_path, None)
                    by_path.pop(state.remote_path, None)
                    state.remote_path = current_path
                    by_path[current_path] = state
                    report.renamed += 1

            # Process every current local file.
            for file in files:
                state = by_file.get(file.id)
                path = _remote_path(file.group, file)
                entry = remote.get(path)
                local_hash = _hash_file(stored_path(file))
                if state is None:
                    state = SyncState(remote_path=path, local_file_id=file.id)
                    db.add(state)
                    db.flush()
                    by_file[file.id] = state
                    by_path[path] = state
                    if entry is None:
                        client.put_file(path, stored_path(file))
                        report.uploaded += 1
                        entry = client.walk().get(path) or RemoteEntry(path=path, is_collection=False)
                    else:
                        # On first contact the newer side wins.  Equal timestamps
                        # favor the local copy, which is the safer backup default.
                        remote_newer = bool(
                            entry.modified
                            and file.updated_at
                            and entry.modified > _utc_naive(file.updated_at)
                        )
                        if remote_newer:
                            self._download_into(db, client, entry, file.name, temp_dir, file)
                            report.downloaded += 1
                            local_hash = _hash_file(stored_path(file))
                        else:
                            client.put_file(path, stored_path(file))
                            report.uploaded += 1
                            entry = client.walk().get(path) or entry
                    self._save_state(state, file, local_hash, entry)
                    continue

                local_changed = local_hash != (state.local_hash or "")
                remote_changed = self._remote_changed(state, entry)
                if entry is None:
                    if local_changed:
                        client.put_file(path, stored_path(file))
                        report.uploaded += 1
                        entry = client.walk().get(path) or RemoteEntry(path=path, is_collection=False)
                    else:
                        db.delete(file)
                        db.delete(state)
                        db.flush()
                        by_path.pop(path, None)
                        report.deleted_local += 1
                        continue
                elif local_changed and remote_changed:
                    self._resolve_conflict(db, client, state, file, entry, temp_dir, report)
                    local_hash = _hash_file(stored_path(file))
                    entry = client.walk().get(path) or entry
                elif local_changed:
                    client.put_file(path, stored_path(file))
                    report.uploaded += 1
                    entry = client.walk().get(path) or entry
                elif remote_changed:
                    self._download_into(db, client, entry, file.name, temp_dir, file)
                    report.downloaded += 1
                    local_hash = _hash_file(stored_path(file))
                self._save_state(state, file, local_hash, entry)

            # A foreign-key SET NULL marks a locally deleted file while
            # retaining its sync state. Propagate that deletion unless the
            # remote side changed since the last successful sync.
            for state in list(states):
                if state.local_file_id is not None or state.remote_path not in by_path:
                    continue
                entry = remote.get(state.remote_path)
                if entry is None:
                    db.delete(state)
                    by_path.pop(state.remote_path, None)
                    continue
                if self._remote_changed(state, entry):
                    parsed = _split_remote_path(state.remote_path)
                    if parsed is None or parsed[0] not in groups:
                        report.skipped += 1
                        continue
                    group_id, name = parsed
                    destination = temp_dir / uuid.uuid4().hex
                    client.download_file(entry.path, destination)
                    try:
                        file = _create_local_from_path(
                            db, groups[group_id], name, destination, entry.content_type
                        )
                    finally:
                        destination.unlink(missing_ok=True)
                    state.local_file_id = file.id
                    self._save_state(state, file, _hash_file(stored_path(file)), entry)
                    by_file[file.id] = state
                    report.downloaded += 1
                else:
                    client.delete(state.remote_path)
                    db.delete(state)
                    by_path.pop(state.remote_path, None)
                    remote.pop(state.remote_path, None)
                    report.deleted_remote += 1

            # Process remote-only files.
            for path, entry in list(remote.items()):
                if path in by_path:
                    continue
                parsed = _split_remote_path(path)
                if parsed is None or parsed[0] not in groups:
                    report.skipped += 1
                    continue
                group_id, name = parsed
                group = groups[group_id]
                destination = temp_dir / uuid.uuid4().hex
                client.download_file(path, destination)
                try:
                    file = _create_local_from_path(
                        db, group, name, destination, entry.content_type
                    )
                finally:
                    destination.unlink(missing_ok=True)
                state = SyncState(remote_path=path, local_file_id=file.id)
                db.add(state)
                db.flush()
                self._save_state(state, file, _hash_file(stored_path(file)), entry)
                by_path[path] = state
                report.downloaded += 1

            db.commit()
            return report
        finally:
            db.close()
            client.close()

    @staticmethod
    def _remote_changed(state: SyncState, entry: RemoteEntry | None) -> bool:
        if entry is None:
            return True
        if state.remote_etag and entry.etag:
            return state.remote_etag != entry.etag
        return state.remote_size != entry.size or _utc_naive(state.remote_modified) != _utc_naive(entry.modified)

    def _download_into(
        self,
        db: Session,
        client: WebDavClient,
        entry: RemoteEntry,
        name: str,
        temp_dir: Path,
        file: FileItem,
    ) -> None:
        destination = temp_dir / uuid.uuid4().hex
        client.download_file(entry.path, destination)
        try:
            size = destination.stat().st_size
            if settings.max_upload_size and size > settings.max_upload_size:
                raise HTTPException(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    "Remote file exceeds the configured upload limit",
                )
            destination.replace(stored_path(file))
            file.name = name
            file.size = size
            file.mime_type = entry.content_type or mimetypes.guess_type(name)[0] or file.mime_type
            file.updated_at = datetime.now(timezone.utc)
            db.flush()
        finally:
            destination.unlink(missing_ok=True)

    def _resolve_conflict(
        self,
        db: Session,
        client: WebDavClient,
        state: SyncState,
        file: FileItem,
        entry: RemoteEntry,
        temp_dir: Path,
        report: SyncReport,
    ) -> None:
        policy = (settings.webdav_conflict_policy or "keep_both").strip().lower()
        if policy == "remote_wins":
            self._download_into(db, client, entry, file.name, temp_dir, file)
            report.downloaded += 1
        elif policy == "local_wins":
            client.put_file(state.remote_path, stored_path(file))
            report.uploaded += 1
        else:
            # Preserve the remote revision as a second local file, then keep
            # the current local revision at the canonical path.
            conflict_name = _conflict_name(file.name)
            destination = temp_dir / uuid.uuid4().hex
            client.download_file(entry.path, destination)
            try:
                conflict = _create_local_from_path(
                    db,
                    file.group,
                    conflict_name,
                    destination,
                    entry.content_type,
                )
                conflict_state = SyncState(
                    remote_path=f"{state.remote_path}.conflict-{uuid.uuid4().hex[:8]}",
                    local_file_id=conflict.id,
                )
                db.add(conflict_state)
                db.flush()
                # The conflict copy is intentionally a local-only snapshot;
                # its state is removed so it will upload under its own path on
                # the next pass rather than overwriting the original remote.
                db.delete(conflict_state)
                db.flush()
            finally:
                destination.unlink(missing_ok=True)
            client.put_file(state.remote_path, stored_path(file))
            report.uploaded += 1
        report.conflicts += 1

    @staticmethod
    def _save_state(
        state: SyncState,
        file: FileItem,
        local_hash: str,
        entry: RemoteEntry,
    ) -> None:
        state.local_file_id = file.id
        state.local_hash = local_hash
        state.local_size = file.size
        state.remote_etag = entry.etag
        state.remote_size = entry.size or file.size
        state.remote_modified = _utc_naive(entry.modified)
        state.last_synced_at = datetime.now(timezone.utc)


sync_engine = SyncEngine()


class SyncScheduler:
    def __init__(self, engine: SyncEngine) -> None:
        self.engine = engine
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.last_report: dict | None = None
        self.last_error: str | None = None
        self.last_started_at: str | None = None
        self.last_finished_at: str | None = None

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        if not settings.webdav_enabled or settings.webdav_interval_seconds <= 0:
            return
        self.stop_event.clear()
        self.thread = threading.Thread(target=self._loop, name="cryovault-webdav", daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=5)

    def _loop(self) -> None:
        while not self.stop_event.wait(max(10, settings.webdav_interval_seconds)):
            self.run_once()

    def run_once(self) -> dict | None:
        self.last_started_at = datetime.now(timezone.utc).isoformat()
        try:
            report = self.engine.run()
            self.last_report = report.as_dict()
            self.last_error = None
            return self.last_report
        except Exception as exc:  # scheduler must remain alive after a failed run
            self.last_error = str(exc)
            return None
        finally:
            self.last_finished_at = datetime.now(timezone.utc).isoformat()

    def status(self) -> dict:
        return {
            "configured": self.engine.configured(),
            "enabled": bool(settings.webdav_enabled),
            "running": self.engine.lock.locked(),
            "interval_seconds": settings.webdav_interval_seconds,
            "conflict_policy": settings.webdav_conflict_policy,
            "last_started_at": self.last_started_at,
            "last_finished_at": self.last_finished_at,
            "last_report": self.last_report,
            "last_error": self.last_error,
        }


sync_scheduler = SyncScheduler(sync_engine)
