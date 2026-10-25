"""Running-version discovery and upstream release detection.

The running version comes from the ``CRYOVAULT_VERSION`` file written by the
installer (the git checkout is replaced on every update, so the file is the
authoritative source). Upstream releases are read from the GitHub API with the
raw ``main`` version file as a fallback.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .config import settings

_VERSION_RE = re.compile(r"^v?(\d+(?:\.\d+)*)(?:[-+](.+))?$")
_USER_AGENT = "CryoVault-Updater"


def parse_version(raw: str) -> tuple[tuple[int, ...], str] | None:
    """Parse ``1.2.3`` / ``v1.2.3`` / ``0.1.0-beta`` into a comparable tuple."""
    match = _VERSION_RE.match(raw.strip())
    if not match:
        return None
    numbers = tuple(int(part) for part in match.group(1).split("."))
    return numbers, match.group(2) or ""


def is_newer(candidate: str, current: str) -> bool:
    """True when ``candidate`` is a strictly newer release than ``current``."""
    new = parse_version(candidate)
    old = parse_version(current)
    if new is None or old is None:
        return False
    width = max(len(new[0]), len(old[0]))
    new_numbers = new[0] + (0,) * (width - len(new[0]))
    old_numbers = old[0] + (0,) * (width - len(old[0]))
    if new_numbers != old_numbers:
        return new_numbers > old_numbers
    if new[1] == old[1]:
        return False
    # A release (no suffix) beats a prerelease with the same numbers.
    if not new[1]:
        return True
    if not old[1]:
        return False
    return new[1] > old[1]


def version_file() -> Path:
    """Allow ``CRYOVAULT_VERSION_FILE`` without registering a public setting."""
    override = getattr(settings, "version_file", "")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[2] / "VERSION"


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def running_version() -> str:
    from . import __version__

    return _read_text(version_file()) or __version__ or "0.0.0"


def repository() -> str:
    repo = (settings.update_repo or "").strip() or "HlONGlin/CryoVault"
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        return "HlONGlin/CryoVault"
    return repo


def install_dir() -> Path:
    override = (settings.install_dir or "").strip()
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[2]


@dataclass
class ReleaseInfo:
    version: str
    tag: str
    url: str
    notes: str
    published_at: str


def _github_headers() -> dict[str, str]:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": _USER_AGENT}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def _get(url: str, headers: dict[str, str], timeout: float) -> bytes:
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        return response.read()


def _fetch_latest_release(timeout: float) -> ReleaseInfo | None:
    repo = repository()
    try:
        payload = _get(
            f"https://api.github.com/repos/{repo}/releases/latest",
            _github_headers(),
            timeout,
        )
        data = json.loads(payload.decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError):
        return None
    tag = str(data.get("tag_name") or "").lstrip("v")
    if not parse_version(tag):
        return None
    return ReleaseInfo(
        version=tag,
        tag=str(data.get("tag_name") or tag),
        url=str(data.get("html_url") or f"https://github.com/{repo}/releases"),
        notes=str(data.get("body") or "").strip(),
        published_at=str(data.get("published_at") or ""),
    )


def _fetch_branch_version(timeout: float) -> ReleaseInfo | None:
    """Fallback for repositories that do not publish GitHub releases."""
    repo = repository()
    branch = (settings.update_branch or "main").strip() or "main"
    quoted = urllib.parse.quote(branch, safe="")
    try:
        raw = _get(
            f"https://raw.githubusercontent.com/{repo}/{quoted}/VERSION",
            {"User-Agent": _USER_AGENT},
            timeout,
        )
        version = raw.decode("utf-8").strip().lstrip("v")
    except (urllib.error.URLError, OSError, ValueError):
        # File missing on the branch: fall back to parsing __init__.__version__.
        try:
            source = _get(
                f"https://raw.githubusercontent.com/{repo}/{quoted}/backend/app/__init__.py",
                {"User-Agent": _USER_AGENT},
                timeout,
            ).decode("utf-8")
        except (urllib.error.URLError, OSError, ValueError):
            return None
        match = re.search(r'__version__\s*=\s*"([^"]+)"', source)
        version = match.group(1) if match else ""
    if not parse_version(version):
        return None
    return ReleaseInfo(
        version=version,
        tag=f"v{version}",
        url=f"https://github.com/{repo}/commits/{quoted}",
        notes="",
        published_at="",
    )


@dataclass
class LatestLookup:
    release: ReleaseInfo | None
    error: str | None


_CACHE_TTL = 300.0
_cache: tuple[float, LatestLookup] | None = None


def latest_release(force: bool = False) -> LatestLookup:
    """Look up the newest upstream version, cached for a few minutes."""
    global _cache
    now = time.monotonic()
    if not force and _cache is not None and now - _cache[0] < _CACHE_TTL:
        return _cache[1]

    timeout = float(settings.update_check_timeout or 6)
    release = _fetch_latest_release(timeout)
    if release is None:
        release = _fetch_branch_version(timeout)
    if release is None:
        result = LatestLookup(release=None, error="无法连接更新服务器")
        # Do not cache failures for long so a retry can succeed.
        _cache = (now - _CACHE_TTL + 30.0, result)
        return result

    result = LatestLookup(release=release, error=None)
    _cache = (now, result)
    return result
