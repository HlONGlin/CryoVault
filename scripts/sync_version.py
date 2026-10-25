"""Create VERSION from backend/app/__init__.__version__ after release bumps."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "backend" / "app" / "__init__.py"


def main() -> None:
    text = SOURCE.read_text(encoding="utf-8")
    match = re.search(r'__version__\s*=\s*.*?"([0-9][^"]*)"', text)
    if not match:
        raise SystemExit("could not find __version__ in backend/app/__init__.py")
    (ROOT / "VERSION").write_text(match.group(1).strip() + "\n", encoding="utf-8")
    print(f"VERSION -> {match.group(1).strip()}")


if __name__ == "__main__":
    main()
