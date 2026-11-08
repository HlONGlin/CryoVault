import hashlib
import hmac
import secrets
import time
from collections import deque
from threading import Lock

from .config import settings

_sessions: dict[str, tuple[float, str]] = {}
_session_lock = Lock()


def session_value() -> str:
    """Issue a random, revocable server-side session."""
    value = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(settings.admin_token.encode()).hexdigest()
    now = time.time()
    with _session_lock:
        expired = [key for key, (expiry, _) in _sessions.items() if expiry <= now]
        for key in expired:
            _sessions.pop(key, None)
        _sessions[hashlib.sha256(value.encode()).hexdigest()] = (
            now + settings.session_max_age, token_hash
        )
    return value


def token_matches(candidate: str | None) -> bool:
    if not settings.admin_token or not candidate:
        return False
    return hmac.compare_digest(candidate, settings.admin_token)


def session_matches(candidate: str | None) -> bool:
    if not settings.admin_token or not candidate:
        return False
    key = hashlib.sha256(candidate.encode()).hexdigest()
    current_hash = hashlib.sha256(settings.admin_token.encode()).hexdigest()
    with _session_lock:
        record = _sessions.get(key)
        if record is None:
            return False
        if record[0] <= time.time() or not hmac.compare_digest(record[1], current_hash):
            _sessions.pop(key, None)
            return False
        return True


def revoke_session(candidate: str | None) -> None:
    if candidate:
        with _session_lock:
            _sessions.pop(hashlib.sha256(candidate.encode()).hexdigest(), None)


class AttemptLimiter:
    """Sliding-window failure counter used to slow down token brute force."""

    MAX_KEYS = 4096

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        hits = self._hits.setdefault(key, deque())
        cutoff = now - settings.login_window_seconds
        while hits and hits[0] < cutoff:
            hits.popleft()
        if len(self._hits) > self.MAX_KEYS:
            for stale in [k for k, v in self._hits.items() if not v][: self.MAX_KEYS // 2]:
                self._hits.pop(stale, None)
        return hits

    def blocked(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            return len(self._prune(key, now)) >= settings.login_max_attempts

    def retry_after(self, key: str) -> int:
        now = time.monotonic()
        with self._lock:
            hits = self._prune(key, now)
            if not hits:
                return 0
            return max(1, int(hits[0] + settings.login_window_seconds - now) + 1)

    def record_failure(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            self._prune(key, now).append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)


login_limiter = AttemptLimiter()
