#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -d "$ROOT_DIR/backend/.venv" ]]; then
  python3 -m venv "$ROOT_DIR/backend/.venv"
fi

"$ROOT_DIR/backend/.venv/bin/python" -m pip install -r "$ROOT_DIR/backend/requirements.txt"

if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  (cd "$ROOT_DIR/frontend" && npm install)
fi

trap 'kill 0' EXIT
(
  cd "$ROOT_DIR/backend"
  "$ROOT_DIR/backend/.venv/bin/python" -m uvicorn app.main:app --host 0.0.0.0 --port "${CRYOVAULT_BACKEND_PORT:-8000}"
) &
(
  cd "$ROOT_DIR/frontend"
  npm run dev -- --host 0.0.0.0 --port "${CRYOVAULT_FRONTEND_PORT:-5173}"
) &

wait
