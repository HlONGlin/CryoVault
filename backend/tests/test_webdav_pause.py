import pytest

from app.webdav import SyncEngine


def test_sync_is_paused_before_legacy_engine_touches_data(monkeypatch):
    engine = SyncEngine()
    def unexpected():
        pytest.fail("legacy synchronization must not run")
    monkeypatch.setattr(engine, "_run_locked", unexpected)
    with pytest.raises(RuntimeError, match="WebDAV"):
        engine.run()
