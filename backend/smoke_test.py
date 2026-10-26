"""End-to-end smoke test. Run with: python smoke_test.py"""
import os
import tempfile
from pathlib import Path

os.environ.setdefault("CRYOVAULT_DATA_DIR", tempfile.mkdtemp(prefix="cryovault-test-"))

from fastapi.testclient import TestClient  # noqa: E402

from app.database import init_db  # noqa: E402
from app.main import app  # noqa: E402

init_db()
client = TestClient(app)


def check(label: str, condition: bool) -> None:
    print(f"[{'OK ' if condition else 'FAIL'}] {label}")
    assert condition, label


def main() -> None:
    check("health", client.get("/api/health").json()["status"] == "ok")
    check(
        "auth status",
        client.get("/api/admin/status").json()["auth_required"] is False,
    )
    check("verify token", client.get("/api/admin/verify").status_code == 200)
    sync_status = client.get("/api/admin/sync/status").json()
    check("sync status", sync_status["configured"] is False and sync_status["running"] is False)

    group = client.post(
        "/api/groups", json={"name": "demo", "description": "smoke", "allow_edit": True}
    ).json()
    check("create group", group["name"] == "demo" and len(group["share_token"]) > 6)

    files = [
        ("files", ("config.yaml", b"server:\n  port: 8080\n", "application/yaml")),
        ("files", ("notes.txt", b"hello world", "text/plain")),
        ("files", ("pic.png", b"\x89PNG\r\n\x1a\n" + b"0" * 100, "image/png")),
        ("files", ("clip.mp4", b"\x00\x00\x00\x18ftypmp42" + b"1" * 5000, "video/mp4")),
    ]
    uploaded = client.post(f"/api/groups/{group['id']}/files", files=files).json()
    kinds = {f["name"]: f["kind"] for f in uploaded}
    check("upload kinds", kinds == {
        "config.yaml": "text", "notes.txt": "text",
        "pic.png": "image", "clip.mp4": "video",
    })

    listing = client.get(f"/api/groups/{group['id']}/files").json()
    check("list files", len(listing) == 4)

    yaml_file = next(f for f in uploaded if f["name"] == "config.yaml")
    content = client.get(f"/api/files/{yaml_file['id']}/content").json()
    check("read text", "port: 8080" in content["content"])

    updated = client.put(
        f"/api/files/{yaml_file['id']}/content", json={"content": "port: 9090\n"}
    ).json()
    check("write text", "9090" in updated["content"])

    file_share = client.post(
        f"/api/files/{yaml_file['id']}/share", json={"allow_edit": True}
    ).json()
    check("create file share", len(file_share["share_token"]) > 6)
    check("file share is editable", file_share["allow_edit"] is True)

    public_file = client.get(f"/api/file-share/{file_share['share_token']}").json()
    check("public file share", public_file["file"]["name"] == "config.yaml")
    check(
        "public file content",
        "9090" in client.get(
            f"/api/file-share/{file_share['share_token']}/content"
        ).json()["content"],
    )
    saved = client.put(
        f"/api/file-share/{file_share['share_token']}/content",
        json={"content": "port: 7070\n"},
    )
    check("public edit", saved.status_code == 200 and "7070" in saved.json()["content"])

    direct = client.get("/api/direct").json()
    check("direct group", isinstance(direct["group_id"], int))
    direct_upload = client.post(
        "/api/direct/files",
        files=[("files", ("direct.txt", b"direct upload", "text/plain"))],
    ).json()
    check("direct upload", direct_upload[0]["name"] == "direct.txt")
    check("direct list", len(client.get("/api/direct").json()["files"]) == 1)
    check(
        "system group hidden",
        all(g["name"] != "单文件分享" for g in client.get("/api/groups").json()),
    )

    client.delete(f"/api/files/{yaml_file['id']}/share")
    check(
        "revoke file share",
        client.get(f"/api/file-share/{file_share['share_token']}").status_code == 404,
    )

    share = client.get(f"/api/share/{group['share_token']}").json()
    check("share info", share["name"] == "demo" and share["allow_edit"] is True)

    share_files = client.get(f"/api/share/{group['share_token']}/files").json()
    check("share files", len(share_files) == 4)

    video = next(f for f in uploaded if f["name"] == "clip.mp4")
    r = client.get(
        f"/api/files/{video['id']}/raw", headers={"Range": "bytes=0-99"}
    )
    check("range 206", r.status_code == 206 and r.headers["content-range"].startswith("bytes 0-99/"))
    check("range length", len(r.content) == 100)
    check("raw nosniff", r.headers.get("x-content-type-options") == "nosniff")
    check("raw csp sandbox", "sandbox" in r.headers.get("content-security-policy", ""))

    html_file = client.post(
        f"/api/groups/{group['id']}/files",
        files=[("files", ("x.html", b"<script>alert(1)</script>", "text/html"))],
    ).json()[0]
    html_raw = client.get(f"/api/files/{html_file['id']}/raw")
    check("html raw sandboxed", "sandbox" in html_raw.headers.get("content-security-policy", ""))
    check("html raw nosniff", html_raw.headers.get("x-content-type-options") == "nosniff")

    ts_video = client.post(
        f"/api/groups/{group['id']}/files",
        files=[("files", ("segment.ts", b"0" * 32, "video/mp2t"))],
    ).json()[0]
    check("ts video by mime", ts_video["kind"] == "video")

    check(
        "unknown api 404",
        client.get("/api/does-not-exist").status_code == 404,
    )

    dl = client.get(f"/api/files/{video['id']}/download")
    check("download attachment", "attachment" in dl.headers["content-disposition"])

    client.delete(f"/api/files/{html_file['id']}")
    client.delete(f"/api/files/{ts_video['id']}")
    client.delete(f"/api/files/{video['id']}")
    check("delete file", len(client.get(f"/api/groups/{group['id']}/files").json()) == 3)

    client.delete(f"/api/groups/{group['id']}")
    check("delete group", client.get("/api/groups").json() == [])

    check_text_limits()
    check_session_auth()
    check_panel_path()
    check_login_rate_limit()

    print("\nAll smoke checks passed.")


def check_panel_path() -> None:
    from app.config import settings
    from app.main import _dist

    if not _dist.is_dir():
        print("[SKIP] panel path checks (frontend/dist not built)")
        return

    previous = settings.panel_path
    settings.panel_path = "/panel/testsecret"
    try:
        check("root hidden", client.get("/").status_code == 404)
        check("unknown path hidden", client.get("/groups/1").status_code == 404)
        check("panel index", client.get("/panel/testsecret/").status_code == 200)
        check("panel login", client.get("/panel/testsecret/login").status_code == 200)
        check(
            "panel injects base",
            "/panel/testsecret" in client.get("/panel/testsecret/").text,
        )
        check("public share page", client.get("/s/whatever").status_code == 200)
        check(
            "public page hides base",
            "/panel/testsecret" not in client.get("/s/whatever").text,
        )
        check("api unaffected", client.get("/api/health").status_code == 200)

        traversal = [
            "/panel/testsecret/..%2F..%2Fbackend%2Fapp%2Fconfig.py",
            "/panel/testsecret/%2E%2E%2F%2E%2E%2Fbackend%2Fapp%2Fconfig.py",
            "/..%2F..%2Fbackend%2Fapp%2Fconfig.py",
            "/s/..%2F..%2Fbackend%2Fapp%2Fconfig.py",
        ]
        blocked = all(
            client.get(path).status_code == 404
            or b"pydantic_settings" not in client.get(path).content
            for path in traversal
        )
        check("path traversal blocked", blocked)
    finally:
        settings.panel_path = previous


def check_login_rate_limit() -> None:
    from app.config import settings
    from app.security import login_limiter

    previous_token = settings.admin_token
    settings.admin_token = "rate-limit-token-1234"
    key = "testclient"
    login_limiter.reset(key)
    try:
        codes = [
            client.post(
                "/api/admin/session", headers={"X-Admin-Token": "wrong"}
            ).status_code
            for _ in range(settings.login_max_attempts)
        ]
        check("failed attempts rejected", all(code == 401 for code in codes))
        blocked = client.post(
            "/api/admin/session", headers={"X-Admin-Token": "wrong"}
        )
        check("login rate limited", blocked.status_code == 429)
        check("retry-after header", "retry-after" in blocked.headers)
    finally:
        login_limiter.reset(key)
        settings.admin_token = previous_token
        client.cookies.clear()


def check_text_limits() -> None:
    from sqlalchemy import text

    from app.config import settings
    from app.database import engine

    with engine.connect() as connection:
        mode = connection.execute(text("PRAGMA journal_mode")).scalar()
    check("sqlite wal", str(mode).lower() == "wal")

    previous = settings.max_text_edit_size
    settings.max_text_edit_size = 4
    try:
        group = client.post("/api/groups", json={"name": "limits"}).json()
        file = client.post(
            f"/api/groups/{group['id']}/files",
            files=[("files", ("big.txt", b"123456789", "text/plain"))],
        ).json()[0]
        check(
            "text read limit",
            client.get(f"/api/files/{file['id']}/content").status_code == 413,
        )
        check(
            "text write limit",
            client.put(
                f"/api/files/{file['id']}/content", json={"content": "123456789"}
            ).status_code
            == 413,
        )
        client.delete(f"/api/groups/{group['id']}")
    finally:
        settings.max_text_edit_size = previous


def check_session_auth() -> None:
    from app.config import settings

    previous = settings.admin_token
    settings.admin_token = "smoke-token-123456"
    try:
        client.cookies.clear()
        check("locked without token", client.get("/api/groups").status_code == 401)
        check(
            "reject bad token",
            client.post(
                "/api/admin/session", headers={"X-Admin-Token": "wrong"}
            ).status_code
            == 401,
        )
        check(
            "reject token in query",
            client.get("/api/groups?token=smoke-token-123456").status_code == 401,
        )
        check(
            "token header alone rejected",
            client.get(
                "/api/groups", headers={"X-Admin-Token": "smoke-token-123456"}
            ).status_code
            == 401,
        )
        check(
            "verify header alone rejected",
            client.get(
                "/api/admin/verify",
                headers={"X-Admin-Token": "smoke-token-123456"},
            ).status_code
            == 401,
        )
        check(
            "create session",
            client.post(
                "/api/admin/session",
                headers={"X-Admin-Token": "smoke-token-123456"},
            ).status_code
            == 200,
        )
        check("cookie authorizes", client.get("/api/groups").status_code == 200)
        client.delete("/api/admin/session")
        client.cookies.clear()
        check("logout locks", client.get("/api/groups").status_code == 401)
    finally:
        settings.admin_token = previous
        client.cookies.clear()


if __name__ == "__main__":
    main()
