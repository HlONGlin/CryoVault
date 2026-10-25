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
UPDATE_HELPER="$INSTALL_DIR/one-click.sh"
UPDATE_REPO="HlONGlin/CryoVault"
UPDATE_ONLY=0
UPDATE_PORT_ARG=""
UPDATE_PANEL_ARG=""
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
                ca-certificates curl tar python3 python3-venv python3-pip
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

    python_version="$($PYTHON_BIN -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    python_ok="$($PYTHON_BIN -c 'import sys; print(int(sys.version_info >= (3, 10)))')"
    [ "$python_ok" = "1" ] || die "CryoVault 需要 Python 3.10 或更高版本，当前为 $python_version。"

    ensure_node
}

ensure_node() {
    node_major=0
    if command -v node >/dev/null 2>&1; then
        node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf '0')"
    fi
    if [ "$node_major" -ge 18 ] 2>/dev/null && command -v npm >/dev/null 2>&1; then
        return
    fi

    package_manager="$(detect_package_manager)"
    log "安装或升级 Node.js 20..."
    case "$package_manager" in
        apt)
            command -v curl >/dev/null 2>&1 || DEBIAN_FRONTEND=noninteractive apt-get install -y curl
            curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource_setup.sh \
                || die "下载 NodeSource 安装脚本失败。"
            bash /tmp/nodesource_setup.sh
            DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
            ;;
        dnf)
            dnf module enable -y nodejs:20 >/dev/null 2>&1 || true
            dnf install -y nodejs npm || dnf install -y nodejs
            ;;
        yum)
            yum module enable -y nodejs:20 >/dev/null 2>&1 || true
            yum install -y nodejs npm || yum install -y nodejs
            ;;
        apk)
            apk add --no-cache nodejs npm
            ;;
        *)
            die "无法自动安装 Node.js 18+，请手动安装后重试。"
            ;;
    esac

    command -v node >/dev/null 2>&1 || die "Node.js 安装失败。"
    command -v npm >/dev/null 2>&1 || die "npm 安装失败。"
    node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf '0')"
    [ "$node_major" -ge 18 ] 2>/dev/null || die "需要 Node.js 18 或更高版本，当前为 $(node --version)。"
}

prompt_writable() {
    # Non-interactive web-console updates: do not print input prompts.
    if [ "$UPDATE_ONLY" -eq 1 ]; then
        return 0
    fi
    printf "$@"
}

app_group_name() {
    group="$(id -gn "$APP_USER" 2>/dev/null | head -n 1 || true)"
    [ -n "$group" ] || group="$APP_USER"
    printf '%s' "$group"
}

ensure_app_user() {
    if ! id "$APP_USER" >/dev/null 2>&1; then
        nologin_shell="/usr/sbin/nologin"
        [ -x "$nologin_shell" ] || nologin_shell="/sbin/nologin"

        if command -v useradd >/dev/null 2>&1; then
            useradd --system --home-dir "$DATA_DIR" --shell "$nologin_shell" "$APP_USER" 2>/dev/null \
                || useradd -r -d "$DATA_DIR" -s "$nologin_shell" "$APP_USER"
        elif command -v adduser >/dev/null 2>&1; then
            adduser -S -H -h "$DATA_DIR" -s "$nologin_shell" "$APP_USER"
        else
            die "无法创建系统用户：未找到 useradd 或 adduser。"
        fi
    fi

    APP_GROUP="$(app_group_name)"

    mkdir -p "$DATA_DIR"
    chmod 700 "$DATA_DIR"
    chown -R "$APP_USER:$APP_GROUP" "$DATA_DIR"
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

generate_panel_path() {
    random=""
    if command -v od >/dev/null 2>&1; then
        random="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
    elif command -v openssl >/dev/null 2>&1; then
        random="$(openssl rand -hex 16)"
    elif command -v sha256sum >/dev/null 2>&1; then
        random="$(printf '%s%s' "$(date +%s%N)" "$$" | sha256sum | cut -c1-32)"
    fi
    [ -n "$random" ] || die "无法生成随机访问路径：缺少 od、openssl 或 sha256sum。"
    printf '/panel/%s' "$random"
}

ensure_panel_path() {
    panel_path="$(read_env_value CRYOVAULT_PANEL_PATH "$ENV_FILE")"
    # Reuse an existing value only when it looks like a real secret path.
    if [ "${#panel_path}" -ge 10 ] \
        && [[ "$panel_path" =~ ^/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ ]]; then
        printf '%s' "$panel_path"
        return
    fi
    generate_panel_path
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
    panel_path="${3:-}"
    max_upload="$(read_env_value CRYOVAULT_MAX_UPLOAD_SIZE "$ENV_FILE")"
    [ -n "$max_upload" ] || max_upload="0"
    max_text="$(read_env_value CRYOVAULT_MAX_TEXT_EDIT_SIZE "$ENV_FILE")"
    [ -n "$max_text" ] || max_text="5242880"
    cookie_secure="$(read_env_value CRYOVAULT_COOKIE_SECURE "$ENV_FILE")"
    [ -n "$cookie_secure" ] || cookie_secure="false"
    [ -n "$panel_path" ] || panel_path="$(ensure_panel_path)"
    base_url="$(read_env_value CRYOVAULT_BASE_URL "$ENV_FILE")"
    [ -n "$base_url" ] || base_url="http://localhost:$port"

    extra=""
    if [ -f "$ENV_FILE" ]; then
        extra="$(grep -E '^CRYOVAULT_[A-Z0-9_]+=' "$ENV_FILE" \
            | grep -vE '^CRYOVAULT_(DATA_DIR|BASE_URL|ADMIN_TOKEN|MAX_UPLOAD_SIZE|MAX_TEXT_EDIT_SIZE|COOKIE_SECURE|PANEL_PATH|DOCS_ENABLED|UPDATE_[A-Z]+|INSTALL_DIR|GITHUB_TOKEN)=' \
            || true)"
    fi

    env_tmp="$(mktemp "$DATA_DIR/.cryovault-env.XXXXXX")"
    cat > "$env_tmp" <<EOF
CRYOVAULT_DATA_DIR=$DATA_DIR
CRYOVAULT_BASE_URL=$base_url
CRYOVAULT_ADMIN_TOKEN=$token
CRYOVAULT_MAX_UPLOAD_SIZE=$max_upload
CRYOVAULT_MAX_TEXT_EDIT_SIZE=$max_text
CRYOVAULT_COOKIE_SECURE=$cookie_secure
CRYOVAULT_PANEL_PATH=$panel_path
CRYOVAULT_DOCS_ENABLED=false
CRYOVAULT_UPDATE_ENABLED=true
CRYOVAULT_INSTALL_DIR=$INSTALL_DIR
CRYOVAULT_UPDATE_COMMAND=$UPDATE_HELPER
CRYOVAULT_UPDATE_REPO=$UPDATE_REPO
EOF
    if [ -n "$extra" ]; then
        printf '%s\n' "$extra" >> "$env_tmp"
    fi
    chown "$APP_USER:$(app_group_name)" "$env_tmp"
    chmod 600 "$env_tmp"
    mv -f "$env_tmp" "$ENV_FILE"
}

write_service() {
    port="$1"
    app_group="$(app_group_name)"
    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=CryoVault self-hosted file vault
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$app_group
WorkingDirectory=$INSTALL_DIR/backend
EnvironmentFile=$ENV_FILE
ExecStart=$INSTALL_DIR/backend/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port $port
Restart=on-failure
RestartSec=5
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
    chmod 644 "$SERVICE_FILE"
}

detect_host() {
    host="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    if [ -z "$host" ] && command -v ip >/dev/null 2>&1; then
        host="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}' || true)"
    fi
    if [ -z "$host" ]; then
        host="$(hostname -i 2>/dev/null | awk '{print $1}' || true)"
    fi
    [ -n "$host" ] || host="127.0.0.1"
    printf '%s' "$host"
}

install_manager() {
    require_root
    require_systemd
    ensure_runtime
    ensure_app_user

    current_port="$(read_current_port)"
    if [ "$UPDATE_ONLY" -eq 1 ] && [ -n "${CRYOVAULT_UPDATE_PORT:-}" ]; then
        current_port="$CRYOVAULT_UPDATE_PORT"
    fi
    if [ "$UPDATE_ONLY" -eq 1 ]; then
        # Non-interactive: reuse the deployed port and panel path as-is.
        port="$current_port"
        input_port=""
        panel_path="$(read_env_value CRYOVAULT_PANEL_PATH "$ENV_FILE")"
        [ -n "$panel_path" ] || panel_path="$(ensure_panel_path)"
    else
        prompt_writable 'CryoVault 服务端口 [%s]: ' "$current_port"
        read -r input_port
        port="$current_port"
        [ -n "$input_port" ] && port="$input_port"
        panel_path="$(ensure_panel_path)"
    fi
    validate_port "$port" || die "端口必须是 1-65535 之间的数字。"

    token="$(prompt_for_token)"
    validate_token "$token" || die "管理员令牌无效。"

    build_root="$(mktemp -d /tmp/cryovault-install.XXXXXX)"
    trap 'rm -rf "${build_root:-}"' EXIT
    archive="$build_root/cryovault.tar.gz"
    source_dir="$build_root/source"
    mkdir -p "$source_dir"

    if [ "$UPDATE_ONLY" -eq 1 ]; then
        # Only reload the unit file when the deployed template changed.
        service_before="$(cat "$SERVICE_FILE" 2>/dev/null || true)"
    fi

    log "下载 CryoVault 源码..."
    download "$REPO_TARBALL" "$archive" || die "源码下载失败。"
    tar -xzf "$archive" -C "$source_dir" --strip-components=1
    [ -f "$source_dir/backend/requirements.txt" ] || die "下载的源码不完整。"
    [ -f "$source_dir/frontend/package.json" ] || die "下载的源码不完整。"

    log "创建 Python 环境并安装后端依赖..."
    if ! "$PYTHON_BIN" -m venv "$source_dir/backend/.venv" 2>/dev/null; then
        command -v virtualenv >/dev/null 2>&1 \
            || die "无法创建 Python 虚拟环境，请安装 python3-venv 或 py3-virtualenv。"
        virtualenv -p "$PYTHON_BIN" "$source_dir/backend/.venv"
    fi
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
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "$old_env"
    fi

    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    if [ -d "$INSTALL_DIR" ]; then
        mv "$INSTALL_DIR" "$old_install"
    fi
    mv "$source_dir" "$INSTALL_DIR"
    chown -R root:root "$INSTALL_DIR"
    write_env "$token" "$port" "$panel_path"
    write_service "$port"

    if [ "$UPDATE_ONLY" -eq 1 ] && [ "$service_before" = "$(cat "$SERVICE_FILE")" ]; then
        :
    else
        systemctl daemon-reload
    fi
    systemctl enable "$SERVICE_NAME" >/dev/null
    if ! systemctl restart "$SERVICE_NAME"; then
        warn "新版本启动失败，正在恢复上一版本..."
        systemctl stop "$SERVICE_NAME" 2>/dev/null || true
        rm -rf "$INSTALL_DIR"
        [ -d "$old_install" ] && mv "$old_install" "$INSTALL_DIR"
        [ -f "$old_env" ] && cp "$old_env" "$ENV_FILE"
        chown "$APP_USER:$(app_group_name)" "$ENV_FILE" 2>/dev/null || true
        systemctl daemon-reload
        systemctl restart "$SERVICE_NAME" 2>/dev/null || true
        die "CryoVault 启动失败，请查看：journalctl -u $SERVICE_NAME -n 100 --no-pager"
    fi
    systemctl is-active --quiet "$SERVICE_NAME" || die "CryoVault 未正常运行。"

    if command -v curl >/dev/null 2>&1; then
        code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port$panel_path/" || true)"
        if [ "$code" != "200" ]; then
            warn "管理地址自检返回 $code。请确认安装的是最新版本，或执行 journalctl -u $SERVICE_NAME -n 50 --no-pager 查看日志。"
        fi
    fi

    rm -rf "$old_install"
    rm -rf "$build_root"
    host="$(detect_host)"
    log "CryoVault 安装/更新完成。"
    printf '管理地址：http://%s:%s%s\n' "$host" "$port" "$panel_path"
    printf '管理员令牌：%s\n' "$token"
    printf '\n访问路径包含随机后缀，请妥善保存完整地址；分享链接仍为 /s/ 和 /f/ 开头。\n'
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
    panel_path="$(ensure_panel_path)"
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    write_env "$token" "$port" "$panel_path"
    systemctl start "$SERVICE_NAME"
    systemctl is-active --quiet "$SERVICE_NAME" || die "令牌已写入，但服务启动失败，请查看 systemctl status $SERVICE_NAME。"
    log "管理员令牌已重置，全部文件数据已保留。"
    printf '新的管理员令牌：%s\n' "$token"
    printf '管理地址：http://%s:%s%s\n' "$(detect_host)" "$port" "$panel_path"
}

regenerate_panel_path() {
    require_root
    require_systemd
    [ -f "$SERVICE_FILE" ] || die "CryoVault 尚未安装。"

    token="$(read_env_value CRYOVAULT_ADMIN_TOKEN "$ENV_FILE")"
    [ -n "$token" ] || die "未找到现有管理员令牌，请先重置管理员令牌。"
    port="$(read_current_port)"
    new_path="$(generate_panel_path)"

    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    write_env "$token" "$port" "$new_path"
    systemctl start "$SERVICE_NAME"
    systemctl is-active --quiet "$SERVICE_NAME" || die "服务启动失败，请查看 systemctl status $SERVICE_NAME。"
    log "访问路径已重新生成，旧地址立即失效。"
    printf '新的管理地址：http://%s:%s%s\n' "$(detect_host)" "$port" "$new_path"
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
6. 重新生成访问路径（保留文件数据）
0. 退出
========================================
EOF
    printf '请选择 [0-6]: '
}

strip_panel_prefix() {
    value="$1"
    if [[ "$value" == /panel/* ]]; then
        value="${value#/panel/}"
    fi
    printf '%s' "$value"
}

# --update-only is called by the web console updater (app/updater.py). It is
# deliberately non-interactive: every prompt is skipped and every failure
# exits non-zero so the API can report it.
# __CRYOVAULT_UPDATE__
parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --update-only)
                UPDATE_ONLY=1
                ;;
            --port)
                shift
                UPDATE_PORT_ARG="${1:-}"
                ;;
            --panel-path)
                shift
                UPDATE_PANEL_ARG="$(strip_panel_prefix "${1:-}")"
                ;;
            *)
                die "未知参数：$1"
                ;;
        esac
        shift || true
    done
}

parse_args "$@"

require_root
require_systemd

if [ "$UPDATE_ONLY" -eq 1 ]; then
    [ -f "$SERVICE_FILE" ] || die "CryoVault 尚未安装，无法在线更新。"
    [ -n "$(read_env_value CRYOVAULT_ADMIN_TOKEN "$ENV_FILE")" ] || die "配置文件中缺少管理员令牌。"
    if [ -n "$UPDATE_PORT_ARG" ]; then
        validate_port "$UPDATE_PORT_ARG" || die "端口参数无效。"
    fi
    export CRYOVAULT_UPDATE_PORT="$UPDATE_PORT_ARG"
    export CRYOVAULT_UPDATE_PANEL_PATH="$UPDATE_PANEL_ARG"
    # Admins cannot answer console prompts (vault owned by the service user,
    # minimal host): skip the port question and keep the existing account.
    export CRYOVAULT_ADMIN_TOKEN="$(read_env_value CRYOVAULT_ADMIN_TOKEN "$ENV_FILE")"
    exec < /dev/null
    install_manager
    exit 0
fi

while true; do
    show_menu
    read -r choice
    case "$choice" in
        1) install_manager ;;
        2) start_manager ;;
        3) stop_manager ;;
        4) uninstall_manager ;;
        5) reset_admin ;;
        6) regenerate_panel_path ;;
        0) exit 0 ;;
        *) warn "无效选择。" ;;
    esac
    printf '\n按回车键继续...'
    read -r _
done
