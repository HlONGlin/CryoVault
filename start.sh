#!/usr/bin/env bash
set -euo pipefail

# CryoVault launcher.
#   ./start.sh             build the frontend and serve everything from one port
#   ./start.sh --dev       run Vite dev server + backend (no random panel path)
#   ./start.sh --print-url print the admin URL and exit
#
# In production mode the admin console lives under a random path such as
# /panel/9f3c...; "/" returns 404.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ENV_FILE="$BACKEND_DIR/.env"
MODE="prod"
PORT="${CRYOVAULT_BACKEND_PORT:-8000}"

for arg in "$@"; do
  case "$arg" in
    --dev) MODE="dev" ;;
    --print-url) MODE="print" ;;
    -h|--help)
      sed -n '3,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      if [[ "$arg" =~ ^[0-9]+$ ]]; then
        PORT="$arg"
      else
        printf 'Unknown argument: %s\n' "$arg" >&2
        exit 1
      fi
      ;;
  esac
done

log() { printf '\n\033[1;36m%s\033[0m\n' "$1"; }

random_hex() {
  if command -v od >/dev/null 2>&1; then
    od -An -N16 -tx1 /dev/urandom | tr -d ' \n'
  elif command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  else
    printf '%s%s' "$(date +%s%N)" "$$" | sha256sum | cut -c1-32
  fi
}

read_env() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1
}

write_env() {
  local key="$1" value="$2" tmp
  touch "$ENV_FILE"
  if grep -q "^${key}=" "$ENV_FILE"; then
    tmp="$(mktemp "$BACKEND_DIR/.env.XXXXXX")"
    awk -v k="$key" -v v="$value" '
      $0 ~ "^" k "=" { print k "=" v; next } { print }
    ' "$ENV_FILE" > "$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

ensure_env() {
  local token panel
  token="$(read_env CRYOVAULT_ADMIN_TOKEN)"
  panel="$(read_env CRYOVAULT_PANEL_PATH)"

  if [[ -z "$token" ]]; then
    write_env CRYOVAULT_ADMIN_TOKEN "$(random_hex)"
  fi
  # Reuse an existing value only when it looks like a real secret path.
  if [[ ${#panel} -lt 10 || ! "$panel" =~ ^/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ ]]; then
    panel="/panel/$(random_hex)"
    write_env CRYOVAULT_PANEL_PATH "$panel"
  fi
  [[ -n "$(read_env CRYOVAULT_DOCS_ENABLED)" ]] || write_env CRYOVAULT_DOCS_ENABLED false

  printf '%s' "$(read_env CRYOVAULT_PANEL_PATH)"
}

detect_host() {
  local host=""
  host="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  if [[ -z "$host" ]] && command -v ip >/dev/null 2>&1; then
    host="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}' || true)"
  fi
  [[ -n "$host" ]] || host="127.0.0.1"
  printf '%s' "$host"
}

PANEL_PATH="$(ensure_env)"

if [[ "$MODE" == "print" ]]; then
  printf 'http://%s:%s%s\n' "$(detect_host)" "$PORT" "$PANEL_PATH"
  printf 'token: %s\n' "$(read_env CRYOVAULT_ADMIN_TOKEN)"
  exit 0
fi

if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
  python3 -m venv "$BACKEND_DIR/.venv"
fi

"$BACKEND_DIR/.venv/bin/python" -m pip install --disable-pip-version-check -r "$BACKEND_DIR/requirements.txt"

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  (cd "$FRONTEND_DIR" && npm install)
fi

if [[ "$MODE" == "dev" ]]; then
  log "开发模式：管理端 http://$(detect_host):${CRYOVAULT_FRONTEND_PORT:-5173}"
  trap 'kill 0' EXIT
  (
    cd "$BACKEND_DIR"
    "$BACKEND_DIR/.venv/bin/python" -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
  ) &
  (
    cd "$FRONTEND_DIR"
    npm run dev -- --host 0.0.0.0 --port "${CRYOVAULT_FRONTEND_PORT:-5173}"
  ) &
  wait
fi

log "构建前端..."
(cd "$FRONTEND_DIR" && npm run build)

log "启动 CryoVault..."
printf '管理地址：http://%s:%s%s\n' "$(detect_host)" "$PORT" "$PANEL_PATH"
printf '管理员令牌：%s\n' "$(read_env CRYOVAULT_ADMIN_TOKEN)"
printf '配置文件：%s\n\n' "$ENV_FILE"

cd "$BACKEND_DIR"
exec "$BACKEND_DIR/.venv/bin/python" -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
