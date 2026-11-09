"""Synchronize release version metadata from the authoritative VERSION file."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION_FILE = ROOT / "VERSION"
FRONTEND = ROOT / "frontend"
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$")


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    version = VERSION_FILE.read_text(encoding="utf-8").strip()
    if not SEMVER.fullmatch(version):
        raise SystemExit(f"VERSION must contain a semantic version, got: {version!r}")

    package_path = FRONTEND / "package.json"
    lock_path = FRONTEND / "package-lock.json"
    package = load_json(package_path)
    lock = load_json(lock_path)

    package["version"] = version
    lock["version"] = version
    lock.setdefault("packages", {}).setdefault("", {})["version"] = version

    write_json(package_path, package)
    write_json(lock_path, lock)
    print(f"{package_path.relative_to(ROOT)} -> {version}")
    print(f"{lock_path.relative_to(ROOT)} -> {version}")


if __name__ == "__main__":
    main()
