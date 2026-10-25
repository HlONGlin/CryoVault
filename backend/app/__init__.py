__all__ = ["__version__"]

import sys
from pathlib import Path

_FILE_VERSION = ""
try:
    _VERSION_PATH = Path(__file__).resolve().parents[2] / "VERSION"
    if _VERSION_PATH.is_file():
        _FILE_VERSION = _VERSION_PATH.read_text(encoding="utf-8").strip().lstrip("v")
except OSError:
    _FILE_VERSION = ""

# ``CRYOVAULT_VERSION`` is written by the installer so runtime() reports the
# release that is actually deployed, not the value baked into the checkout.
__version__ = _FILE_VERSION or "0.1.0"

if sys.platform == "win32":
    # PyInstaller's windowed bootloader has no console; stdout/stderr are None
    # and uvicorn's logging setup would crash on them.
    _null = open("nul", "w", encoding="utf-8")
    if sys.stdout is None:
        sys.stdout = _null
    if sys.stderr is None:
        sys.stderr = _null