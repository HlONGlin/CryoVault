#!/usr/bin/env bash

set -Eeuo pipefail

# CryoVault source distribution installer and systemd manager.
# Usage:
#   bash <(curl -fsSL https://github.com/HlONGlin/CryoVault/raw/main/one-click.sh)

REPO_TARBALL="https://github.com/HlONGlin/CryoVault/archive/refs/heads/main.tar.gz"
INSTALL_DIR="/opt/cryovault"
DATA_DIR="/var/lib/cryovault"
SERVICE_NAME="cryovault.service"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME"
ENV_FILE="$DATA_DIR/cryovault.env"
APP_USER="cryovault"
DEFAULT_PORT="8000"

log() {
    printf '\n\033[1;36m%s\033[0m\n' "$1"
}

warn() {
    printf '\n\033[1;33m%s\033[0m\n' "$1" >&2
}

die() {
    printf '\n\033[1;31mError: %s\033[0m\n' "$1" >&2
    exit 1
}

require_root() {
    [ "$(id -u)" -eq 0 ] || die "请使用 root 运行此脚本。"
}

require_systemd() {
    command -v systemctl >/dev/null 2>&1 || die "当前系统未找到 systemd/systemctl。"
}

download() {
    url="$1"
    output="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fL --retry 3 --connect-timeout 15 "$url" -o "$output"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$output" "$url"
    else
        die "需要 curl 或 wget。"
    fi
}

detect_package_manager() {
    if command -v apt-get >/dev/null 2>&1; then
        printf 'apt'
    elif command -v dnf >/dev/null 2>&1; then
        printf 'dnf'
    elif command -v yum >/dev/null 2>&1; then
        printf 'yum'
    elif command -v apk >/dev/null 2>&1; then
        printf 'apk'
    else
        printf ''
    fi
}

install_system_dependencies() {
    package_manager="$(detect_package_manager)"

    case "$package_manager" in
        apt)
            log "检测到 Debian/Ubuntu，安装运行依赖..."
            apt-get update
            DEBIAN_FRONTEND=noninteractive apt-get install -y \
                ca-certificates curl tar python3 python3-venv python3-pip nodejs npm
            ;;
        dnf)
            log "检测到 Fedora/RHEL，安装运行依赖..."
            dnf install -y ca-certificates curl tar python3 python3-pip nodejs npm
            ;;
        yum)
            log "检测到 CentOS/RHEL，安装运行依赖..."
            yum install -y ca-certificates curl tar python3 python3-pip nodejs npm
            ;;
        apk)
            log "检测到 Alpine，安装运行依赖..."
            apk add --no-cache ca-certificates curl tar python3 py3-pip py3-virtualenv nodejs npm
            ;;
        "")
            die "未识别的 Linux 包管理器，请手动安装 python3、python3-venv、python3-pip、nodejs、npm、curl 和 tar。"
            ;;
        *)
            die "不支持的包管理器：$package_manager"
            ;;
    esac
}

find_python() {
    if command -v python3 >/dev/null 2>&1; then
        command -v python3
    elif command -v python >/dev/null 2>&1; then
        command -v python
    else
        printf ''
    fi
}

ensure_runtime() {
    PYTHON_BIN="$(find_python)"
    if [ -z "$PYTHON_BIN" ] || ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
        install_system_dependencies
        PYTHON_BIN="$(find_python)"
    fi

    [ -n "$PYTHON_BIN" ] || die "未找到 Python 3。"
    command -v node >/dev/null 2>&1 || die "未找到 Node.js。"
    command -v npm >/dev/null 2>&1 || die "未找到 npm。"

    python_version="$($PYTHON_BIN -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    python_ok="$($PYTHON_BIN -c 'import sys; print(int(sys.version_info >= (3, 10)))')"
    [ "$python_ok" = "1" ] || die "CryoVault 需要 Python 3.10 或更高版本，当前为 $python_version。"

    node_major="$(node -p 'process.versions.node.split(".")[0]')"
    [ "$node_major" -ge 18 ] || die "CryoVault 前端构建需要 Node.js 18 或更高版本，当前为 $(node --version)。"
}

ensure_app_user() {
    command -v useradd >/dev/null 2>&1 || die "未找到 useradd。"
    if ! id "$APP_USER" >/dev/null 2>&1; then
        useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
    fi
    mkdir -p "$DATA_DIR"
    chmod 700 "$DATA_DIR"
    chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
}

read_env_value() {
    key="$1"
    file="$2"
    if [ -f "$file" ]; then
        sed -n "s/^${key}=//p" "$file" | tail -n 1
    else
        printf ''
    fi
}

read_current_port() {
    if [ -f "$SERVICE_FILE" ]; then
        port="$(sed -n 's/.*--port \([0-9][0-9]*\).*/\1/p' "$SERVICE_FILE" | tail -n 1)"
        [ -n "$port" ] && { printf '%s' "$port"; return; }
    fi
    printf '%s' "$DEFAULT_PORT"
}

validate_port() {
    port="$1"
    case "$port" in
        ''|*[!0-9]*) return 1 ;;
    esac
    [ "$port" -ge 1 ] && [ "$port" -le 65535 ]
}

validate_token() {
    token="$1"
    [ "${#token}" -ge 12 ] || return 1
    [[ "$token" =~ ^[A-Za-z0-9._-]+$ ]]
}

generate_token() {
    od -An -N24 -tx1 /dev/urandom | tr -d ' \n'
}

prompt_for_token() {
    existing="$(read_env_value CRYOVAULT_ADMIN_TOKEN "$ENV_FILE")"
    if [ -n "${CRYOVAULT_ADMIN_TOKEN:-}" ]; then
        printf '%s' "$CRYOVAULT_ADMIN_TOKEN"
        return
    fi
    if [ -n "$existing" ]; then
        printf '%s' "$existing"
        return
    fi

    printf '\n首次安装，请设置 CryoVault 管理员令牌。\n' >&2
    printf '管理令牌（至少 12 位，留空自动生成）: ' >&2
    read -r -s token
    printf '\n' >&2
    if [ -z "$token" ]; then
        token="$(generate_token)"
        printf '已自动生成管理员令牌：%s\n' "$token" >&2
    else
        validate_token "$token" || die "令牌至少 12 位，且只能包含字母、数字、点、下划线和连字符。"
        printf '确认管理令牌: ' >&2
        read -r -s confirmation
        printf '\n' >&2
        [ "$token" = "$confirmation" ] || die "两次输入的令牌不一致。"
        unset confirmation
    fi
    printf '%s' "$token"
}

write_env() {
    token="$1"
    port="$2"
    max_upload="$(read_env_value CRYOVAULT_MAX_UPLOAD_SIZE "$ENV_FILE")"
    [ -n "$max_upload" ] || max_upload="0"
    base_url="$(read_env_value CRYOVAULT_BASE_URL "$ENV_FILE")"
    [ -n "$base_url" ] || base_url="http://localhost:$port"

    env_tmp="$(mktemp "$DATA_DIR/.cryovault-env.XXXXXX")"
    cat > "$env_tmp" <<EOF
CRYOVAULT_DATA_DIR=$DATA_DIR
CRYOVAULT_BASE_URL=$base_url
CRYOVAULT_ADMIN_TOKEN=$token
CRYOVAULT_MAX_UPLOAD_SIZE=$max_upload
EOF
    chown "$APP_USER:$APP_USER" "$env_tmp"
    chmod 600 "$env_tmp"
    mv -f "$env_tmp" "$ENV_FILE"
}

write_service() {
    port="$1"
    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=CryoVault self-hosted file vault
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$INSTALL_DIR/backend
EnvironmentFile=$ENV_FILE
ExecStart=$INSTALL_DIR/backend/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port $port
Restart=on-failure
RestartSec=5
PrivateTmp=true
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF
    chmod 644 "$SERVICE_FILE"
}

detect_host() {
    host="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [ -n "$host" ] || host="127.0.0.1"
    printf '%s' "$host"
}

install_manager() {
    require_root
    require_systemd
    ensure_runtime
    ensure_app_user

    current_port="$(read_current_port)"
    printf 'CryoVault 服务端口 [%s]: ' "$current_port"
    read -r input_port
    port="$current_port"
    [ -n "$input_port" ] && port="$input_port"
    validate_port "$port" || die "端口必须是 1-65535 之间的数字。"

    token="$(prompt_for_token)"
    validate_token "$token" || die "管理员令牌无效。"

    build_root="$(mktemp -d /tmp/cryovault-install.XXXXXX)"
    archive="$build_root/cryovault.tar.gz"
    source_dir="$build_root/source"
    mkdir -p "$source_dir"

    log "下载 CryoVault 源码..."
    download "$REPO_TARBALL" "$archive" || die "源码下载失败。"
    tar -xzf "$archive" -C "$source_dir" --strip-components=1
    [ -f "$source_dir/backend/requirements.txt" ] || die "下载的源码不完整。"
    [ -f "$source_dir/frontend/package.json" ] || die "下载的源码不完整。"

    log "创建 Python 环境并安装后端依赖..."
    "$PYTHON_BIN" -m venv "$source_dir/backend/.venv"
    "$source_dir/backend/.venv/bin/python" -m pip install --disable-pip-version-check -r "$source_dir/backend/requirements.txt"

    log "安装前端依赖并构建生产版本..."
    (
        cd "$source_dir/frontend"
        npm install --no-audit --no-fund
        npm run build
        rm -rf node_modules
    )

    old_install="$build_root/previous-install"
    old_env="$build_root/previous.env"
    if [ -d "$INSTALL_DIR" ]; then
        mv "$INSTALL_DIR" "$old_install"
    fi
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "$old_env"
    fi

    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    mv "$source_dir" "$INSTALL_DIR"
    chown -R root:root "$INSTALL_DIR"
    write_env "$token" "$port"
    write_service "$port"

    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME" >/dev/null
    if ! systemctl restart "$SERVICE_NAME"; then
        warn "新版本启动失败，正在恢复上一版本..."
        systemctl stop "$SERVICE_NAME" 2>/dev/null || true
        rm -rf "$INSTALL_DIR"
        [ -d "$old_install" ] && mv "$old_install" "$INSTALL_DIR"
        [ -f "$old_env" ] && cp "$old_env" "$ENV_FILE"
        chown "$APP_USER:$APP_USER" "$ENV_FILE" 2>/dev/null || true
        systemctl daemon-reload
        systemctl restart "$SERVICE_NAME" 2>/dev/null || true
        die "CryoVault 启动失败，请查看：journalctl -u $SERVICE_NAME -n 100 --no-pager"
    fi
    systemctl is-active --quiet "$SERVICE_NAME" || die "CryoVault 未正常运行。"

    rm -rf "$old_install"
    rm -rf "$build_root"
    host="$(detect_host)"
    log "CryoVault 安装/更新完成。"
    printf '管理地址：http://%s:%s\n' "$host" "$port"
    printf '管理员令牌：%s\n' "$token"
    printf '\n手机扫码时，请使用服务器局域网 IP 访问上面的地址。\n'
}

start_manager() {
    require_root
    require_systemd
    [ -f "$SERVICE_FILE" ] || die "CryoVault 尚未安装。"
    systemctl start "$SERVICE_NAME"
    systemctl --no-pager --full status "$SERVICE_NAME"
}

stop_manager() {
    require_root
    require_systemd
    [ -f "$SERVICE_FILE" ] || die "CryoVault 尚未安装。"
    systemctl stop "$SERVICE_NAME"
    log "CryoVault 已停止。"
}

reset_admin() {
    require_root
    require_systemd
    [ -f "$SERVICE_FILE" ] || die "CryoVault 尚未安装。"

    printf '新的管理员令牌（至少 12 位，留空自动生成）: '
    read -r -s token
    printf '\n'
    if [ -z "$token" ]; then
        token="$(generate_token)"
    else
        validate_token "$token" || die "令牌至少 12 位，且只能包含字母、数字、点、下划线和连字符。"
        printf '确认新的管理员令牌: '
        read -r -s confirmation
        printf '\n'
        [ "$token" = "$confirmation" ] || die "两次输入的令牌不一致。"
    fi

    port="$(read_current_port)"
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    write_env "$token" "$port"
    systemctl start "$SERVICE_NAME"
    systemctl is-active --quiet "$SERVICE_NAME" || die "令牌已写入，但服务启动失败，请查看 systemctl status $SERVICE_NAME。"
    log "管理员令牌已重置，全部文件数据已保留。"
    printf '新的管理员令牌：%s\n' "$token"
}

uninstall_manager() {
    require_root
    require_systemd
    printf '确认彻底删除 CryoVault、全部文件、数据库和配置？请输入 DELETE 确认：'
    read -r confirmation
    [ "$confirmation" = "DELETE" ] || { log "已取消清除。"; return; }

    systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
    rm -f "$SERVICE_FILE"
    systemctl daemon-reload
    rm -rf "$INSTALL_DIR" "$DATA_DIR"
    if id "$APP_USER" >/dev/null 2>&1; then
        userdel "$APP_USER" 2>/dev/null || true
    fi
    log "CryoVault、文件数据、数据库、管理员令牌和全部配置已彻底清除。"
}

show_menu() {
    clear 2>/dev/null || true
    cat <<'EOF'
========================================
       CryoVault 一键安装与管理工具
========================================
1. 安装或更新 CryoVault
2. 启动 CryoVault
3. 停止 CryoVault
4. 彻底卸载并清除全部数据
5. 重置管理员令牌（保留文件数据）
0. 退出
========================================
EOF
    printf '请选择 [0-5]: '
}

require_root
require_systemd

while true; do
    show_menu
    read -r choice
    case "$choice" in
        1) install_manager ;;
        2) start_manager ;;
        3) stop_manager ;;
        4) uninstall_manager ;;
        5) reset_admin ;;
        0) exit 0 ;;
        *) warn "无效选择。" ;;
    esac
    printf '\n按回车键继续...'
    read -r _
done
