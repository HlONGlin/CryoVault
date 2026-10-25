"""In-place update driver used by ``POST /api/admin/update/apply``.

It only exists in installed systemd deployments (``CRYOVAULT_UPDATE_ENABLED``)
because the operation replaces the program directory and restarts the service.

Before touching the installation it validates that:

* the filesystem layout looks like a CryoVault install,
* the upstream target parses as a version,
* the configured ``CRYOVAULT_UPDATE_COMMAND`` is a read-only installer command
  running from the install directory with only allow-listed arguments (so the
  update setting can never be turned into arbitrary command execution),
* the installer script contains the ``--update-only`` marker.

JSON progress lines are printed to stdout for the API to stream.
"""

from __future__ import annotations

import getpass
import json
import os
import re
import shlex
import subprocess
import sys
import time
from collections.abc import Callable

from . import version as versions
from .config import settings

_LOG_LIMIT = 200


class UpdateError(RuntimeError):
    """Raised when the update cannot start or fails."""


def _emit(event: str, **payload: object) -> None:
    sys.stdout.write(json.dumps({"event": event, **payload}, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _log(message: str) -> None:
    _emit("log", message=message)


def _decode(stream) -> str:
    data = stream.read() if stream is not None else b""
    if isinstance(data, bytes):
        return data.decode("utf-8", errors="replace")
    return str(data or "")


def _run(
    command: list[str],
    cwd: str,
    timeout: int,
    on_line: Callable[[str], None],
) -> int:
    try:
        process = subprocess.Popen(
            command,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            env={**os.environ, "DEBIAN_FRONTEND": "noninteractive", "TERM": "dumb"},
        )
    except OSError as exc:
        _log(f"无法执行命令：{exc}")
        return 127

    try:
        assert process.stdout is not None
        for raw in iter(process.stdout.readline, b""):
            line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
            on_line(line)
        return process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        _log("更新命令执行超时，已终止。")
        process.kill()
        return 124
    finally:
        if process.poll() is None:
            process.kill()


def _tail(text: str, lines: int = 40) -> str:
    return "\n".join(text.strip().splitlines()[-lines:])


def _service_active() -> bool | None:
    """None when systemd is unavailable, otherwise the active state."""
    try:
        result = subprocess.run(
            ["systemctl", "is-active", "cryovault.service"],
            capture_output=True,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout.decode("utf-8", "replace").strip() == "active"


def _health(port: int, panel_path: str) -> bool:
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(  # noqa: S310
            f"http://127.0.0.1:{port}/api/health", timeout=4
        ) as response:
            return response.status == 200
    except (urllib.error.URLError, OSError):
        return False


def _wait_for_service() -> bool:
    for _ in range(30):
        if _service_active():
            return True
        time.sleep(1)
    return bool(_service_active())


def _wait_for_previous_pid(previous_pid: int, grace: float = 90.0) -> None:
    """Wait until the server that spawned us has exited.

    The API answers the request and then shuts itself down, which releases the
    listen port; waiting avoids ``address already in use`` when systemd starts
    the new unit before the old worker is gone.
    """
    deadline = time.monotonic() + grace
    while previous_pid > 1 and _pid_alive(previous_pid) and time.monotonic() < deadline:
        time.sleep(0.5)


def _port_open(port: int) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.5)
        return probe.connect_ex(("127.0.0.1", port)) == 0


def _read_version_file(install_root: str) -> str:
    try:
        with open(os.path.join(install_root, "VERSION"), encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def _ensure_inside_install(path: str, install_root: str) -> str:
    candidate = os.path.realpath(path)
    root = os.path.realpath(install_root)
    if candidate != root and not candidate.startswith(root + os.sep):
        raise UpdateError("CRYOVAULT_UPDATE_COMMAND 必须指向安装目录内的脚本。")
    return candidate


def _parse_command(install_root: str) -> tuple[list[str], str]:
    raw = (settings.update_command or "").strip()
    if not raw:
        raise UpdateError(
            "未配置 CRYOVAULT_UPDATE_COMMAND，请使用一键安装脚本重新安装以启用在线更新。"
        )
    parts = shlex.split(raw)
    if not parts:
        raise UpdateError("CRYOVAULT_UPDATE_COMMAND 为空。")

    script = _ensure_inside_install(parts[0], install_root)
    if not os.path.isfile(script):
        raise UpdateError("找不到更新脚本，安装目录可能已被破坏。")

    try:
        with open(script, encoding="utf-8") as handle:
            content = handle.read(200_000)
    except OSError as exc:
        raise UpdateError(f"无法读取更新脚本：{exc}") from exc
    if "__CRYOVAULT_UPDATE__" not in content:
        raise UpdateError("更新脚本缺少 --update-only 入口，请重新安装后再试。")

    args = parts[1:]
    extras: list[str] = []
    index = 0
    while index < len(args):
        arg = args[index]
        if arg not in ("--port", "--panel-path"):
            raise UpdateError(f"CRYOVAULT_UPDATE_COMMAND 包含不允许的参数：{arg}")
        if index + 1 >= len(args):
            raise UpdateError(f"{arg} 缺少取值。")
        extras.extend([arg, args[index + 1]])
        index += 2

    return ["/bin/bash", script, "--update-only", *extras], script


def _installer_port(script: str) -> int | None:
    try:
        with open(script, encoding="utf-8") as handle:
            content = handle.read(200_000)
    except OSError:
        return None
    match = re.search(r'^DEFAULT_PORT="?(\d+)"?', content, re.MULTILINE)
    return int(match.group(1)) if match else None


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def main() -> int:
    lock_path = os.path.join("/tmp", "cryovault-update.lock")
    lock_handle = None
    try:
        if not settings.update_enabled:
            raise UpdateError("当前部署未启用在线更新。")
        if sys.platform != "linux":
            raise UpdateError("在线更新仅在 Linux + systemd 部署下可用。")

        install_root = str(versions.install_dir())
        if not os.path.isfile(os.path.join(install_root, "backend", "app", "main.py")):
            raise UpdateError("未在安装目录中找到 CryoVault 后端。")

        command, script = _parse_command(install_root)

        import fcntl

        lock_handle = open(lock_path, "w")  # noqa: SIM115
        try:
            fcntl.flock(lock_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise UpdateError("已有更新任务正在运行。") from exc

        current = versions.running_version()
        lookup = versions.latest_release(force=True)
        if lookup.release is None:
            raise UpdateError(lookup.error or "无法获取最新版本。")
        target = lookup.release.version
        if not versions.is_newer(target, current):
            _log(f"当前已是最新版本（{current}）。")
            _emit("done", changed=False, version=current, restarted=False)
            return 0

        _log(f"准备从 {current} 更新到 {target}…")
        if os.geteuid() != 0:
            raise UpdateError(
                "在线更新需要服务以 root 身份运行，而以普通用户 "
                f"{getpass.getuser()} 启动时无法安装软件包或写入安装目录。\n"
                "请将 systemd 服务改为 root 运行后重试：\n"
                f"  sudo sed -i '/^User=/d;/^Group=/d' /etc/systemd/system/cryovault.service\n"
                "  sudo systemctl daemon-reload && sudo systemctl restart cryovault\n"
                "若部署在禁止提权的容器内（no_new_privs），请改为在宿主机手动执行 "
                f"{settings.update_command} --update-only，或在 .env 中设置 "
                "CRYOVAULT_UPDATE_ENABLED=false 关闭在线更新。"
            )

        installer = command
        _log("$ " + " ".join(shlex.quote(part) for part in installer))

        log_path = os.path.join("/tmp", f"cryovault-update-{os.getpid()}.log")
        collected: list[str] = []

        def on_line(line: str) -> None:
            collected.append(line)
            del collected[:-_LOG_LIMIT]
            _log(line)

        # Older installers stop the service before copying, which would kill
        # this process halfway through. Background mode lets them run detached.
        previous_pid = int(os.environ.get("CRYOVAULT_UPDATE_PID", "0") or 0)
        _wait_for_previous_pid(previous_pid)

        code = _run(installer, install_root, 1800, on_line)
        try:
            with open(log_path, "w", encoding="utf-8") as handle:
                handle.write("\n".join(collected))
        except OSError:
            pass

        if code != 0:
            raise UpdateError(
                f"安装脚本执行失败（退出码 {code}）。\n{_tail(chr(10).join(collected))}"
            )

        new_version = _read_version_file(install_root) or target
        _log(f"安装完成，版本：{new_version}")

        port = None
        for index, arg in enumerate(command):
            if arg == "--port" and index + 1 < len(command):
                port = int(command[index + 1])
        if port is None:
            port = _installer_port(script)
        port = port or 8000

        restarted = _wait_for_service()
        if restarted:
            healthy = False
            for _ in range(10):
                if _health(port, settings.normalized_panel_path) and _port_open(port):
                    healthy = True
                    break
                time.sleep(1.5)
            if not healthy and not _port_open(port):
                raise UpdateError(
                    "服务已重启，但健康检查未通过，请查看 journalctl -u cryovault.service。"
                )
        else:
            _log("未检测到 systemd 服务状态，请手动确认服务是否已恢复。")

        _emit(
            "done",
            changed=True,
            version=new_version,
            restarted=restarted,
            log=log_path,
        )
        return 0
    except UpdateError as exc:
        _emit("error", message=str(exc))
        return 1
    except Exception as exc:  # noqa: BLE001 - report everything to the caller
        _emit("error", message=f"更新失败：{exc}")
        return 1
    finally:
        if lock_handle is not None:
            lock_handle.close()


if __name__ == "__main__":
    sys.exit(main())
