import hashlib
import hmac
import time
from collections import deque
from threading import Lock

from .config import settings

SESSION_CONTEXT = b"cryovault-admin-session-v1"


def session_value() -> str:
    """Deterministic, one-way session marker derived from the admin token."""
    return hmac.new(
        settings.admin_token.encode("utf-8"), SESSION_CONTEXT, hashlib.sha256
    ).hexdigest()


def token_matches(candidate: str | None) -> bool:
    if not settings.admin_token or not candidate:
        return False
    return hmac.compare_digest(candidate, settings.admin_token)


def session_matches(candidate: str | None) -> bool:
    if not settings.admin_token or not candidate:
        return False
    return hmac.compare_digest(candidate, session_value())


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
