from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app import security


def test_random_session_revocation_expiry_and_token_change(monkeypatch):
    monkeypatch.setattr(settings, "admin_token", "original-token")
    client = TestClient(app)
    assert client.post("/api/admin/session", headers={"X-Admin-Token": "original-token"}).status_code == 200
    first = client.cookies.get(settings.session_cookie)
    assert client.post("/api/admin/session", headers={"X-Admin-Token": "original-token"}).status_code == 200
    second = client.cookies.get(settings.session_cookie)
    assert first != second
    assert security.session_matches(first)
    assert client.delete("/api/admin/session").status_code == 200
    assert not security.session_matches(second)
    monkeypatch.setattr(settings, "admin_token", "changed-token")
    assert not security.session_matches(first)
    monkeypatch.setattr(settings, "session_max_age", -1)
    expired = security.session_value()
    assert not security.session_matches(expired)
