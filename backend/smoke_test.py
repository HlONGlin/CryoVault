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

    dl = client.get(f"/api/files/{video['id']}/download")
    check("download attachment", "attachment" in dl.headers["content-disposition"])

    client.delete(f"/api/files/{video['id']}")
    check("delete file", len(client.get(f"/api/groups/{group['id']}/files").json()) == 3)

    client.delete(f"/api/groups/{group['id']}")
    check("delete group", client.get("/api/groups").json() == [])

    print("\nAll smoke checks passed.")


if __name__ == "__main__":
    main()
