import os
import subprocess
import sys
import tempfile
from pathlib import Path


def test_existing_api_smoke_suite():
    backend = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="cryovault-pytest-") as data_dir:
        env = os.environ.copy()
        env["CRYOVAULT_DATA_DIR"] = data_dir
        result = subprocess.run(
            [sys.executable, str(backend / "smoke_test.py")],
            cwd=backend,
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
        )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "All smoke checks passed." in result.stdout
