# CryoVault

CryoVault 是一个面向 Linux 自托管场景的轻量网盘，支持本地文件存储、分组管理、二维码分享，以及常见文件的在线预览。

## 功能

- 本地文件系统保存上传数据，SQLite 保存分组和文件元数据
- 管理员令牌独立登录页，解锁后才能管理分组和上传文件
- 白天 / 夜间双主题，顶部一键切换，选择会保存在浏览器本地
- 分组上传、搜索、重命名、删除和批量上传
- 每个分组拥有独立分享链接，可生成二维码 PNG
- 单文件分享：任意文件可单独生成下载链接和二维码，无需创建分组
- 分享页无需登录，可浏览并下载分组内文件
- TXT、YAML、JSON、Markdown、代码等 UTF-8 文本在线查看和编辑
- 图片预览与缩放，视频支持浏览器原生播放和 Range 拖动，音频支持播放
- 管理 API token 由后端校验；分享链接不需要管理 token
- 开发模式支持手机通过局域网访问前端，适合扫码测试

## 技术栈

- Backend: Python 3.10+、FastAPI、SQLAlchemy、SQLite
- Frontend: React、TypeScript、Vite、Tailwind CSS、CodeMirror
- Storage: `CRYOVAULT_DATA_DIR/storage`

## Linux 快速启动

```bash
chmod +x start.sh
./start.sh
```

首次运行会自动生成管理员令牌和随机访问路径，写入 `backend/.env`，构建前端后启动服务。终端会打印完整管理地址，形如：

```text
管理地址：http://192.168.1.20:8000/panel/8d9cf22f5a339f989e3fac6d5bca4f67
管理员令牌：c4b8c77dbe95a7e4950db620602fa15c
```

直接访问根路径 `/` 会返回 404，必须使用带随机后缀的完整地址。

其他用法：

```bash
./start.sh 9000          # 指定端口
./start.sh --print-url   # 只打印当前管理地址和令牌
./start.sh --dev         # 前端开发模式（Vite 5173，不使用随机路径）
```

API 文档默认关闭；如需临时开启，在 `backend/.env` 中设置 `CRYOVAULT_DOCS_ENABLED=true`。

## 一键安装与管理

在支持 systemd 的 Linux 服务器上，使用 root 执行下面的命令，直接进入 CryoVault 数字管理菜单：

```bash
bash <(curl -fsSL https://github.com/HlONGlin/CryoVault/raw/main/one-click.sh)
```

脚本会检查并安装 Python、Node.js 等依赖，下载项目源码、构建前端、配置 systemd 服务并启动 CryoVault。首次安装时会提示设置管理员令牌，安装完成后会显示带随机后缀的完整管理地址和令牌。

管理地址形如 `http://服务器IP:8000/panel/3f9a...`，其中 `/panel/` 后的随机字符由脚本生成。直接访问根路径 `/` 会返回 404，只有完整地址才能进入管理端。

打开管理地址后会进入独立的管理员解锁页，输入令牌后才能管理分组、上传文件和生成分享链接。令牌与后端 `CRYOVAULT_ADMIN_TOKEN` 一致。

数字菜单提供以下操作：

1. 安装或更新 CryoVault
2. 启动 CryoVault
3. 停止 CryoVault
4. 彻底卸载并清除全部数据
5. 重置管理员令牌（保留文件数据）
6. 重新生成访问路径（保留文件数据）

默认安装位置：

- 程序：`/opt/cryovault`
- 文件、SQLite 数据库和配置：`/var/lib/cryovault`
- systemd 服务：`cryovault.service`

彻底卸载会同时删除上传文件、数据库和管理员令牌，脚本会要求输入 `DELETE` 二次确认。重置管理员令牌只修改访问凭据；重新生成访问路径会让旧地址立即失效，两者都不会删除分组或文件。

## 使用方式

### 管理员解锁

管理端只存在于随机路径下，例如 `http://服务器IP:8000/panel/3f9a...`。访问根路径 `/` 或猜测的普通路径都会返回 404。

打开该地址后会跳转到解锁页。输入 `CRYOVAULT_ADMIN_TOKEN` 对应的令牌后解锁；右上角「锁定」可以立即退出管理状态。分享页面（`/s/...` 和 `/f/...`）始终公开，不需要令牌。

登录失败会触发限流：默认 5 分钟内失败 5 次后暂时拒绝新的解锁请求。

顶部导航右侧的太阳 / 月亮按钮用于切换白天与夜间主题。首次访问默认跟随系统配色，手动切换后会记住选择。

### 分组分享

1. 解锁后进入「冷冻数据舱」。
2. 新建分组并上传文件。
3. 点击分组的二维码按钮，生成分组分享链接和二维码。

### 单文件分享

如果只想分享一个文件，不必先建分组：

1. 在管理首页或顶部导航进入「单文件分享」。
2. 上传文件。
3. 在文件卡片上点击分享图标，生成独立下载链接和二维码。
4. 可选「允许编辑」让文本文件通过链接直接修改；「撤销链接」会立即使旧二维码失效。

手机扫码时，需要使用 Linux 主机在局域网中的地址访问前端，例如 `http://192.168.1.20:5173`。防火墙需要放行前端端口；后端端口通常只需要被本机和前端开发代理访问。

## 生产部署

先构建前端：

```bash
cd frontend
npm install
npm run build
cd ..
```

再启动后端：

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

如果 `frontend/dist` 存在，FastAPI 会自动托管构建后的前端。生产环境建议通过 Nginx 或 Caddy 配置 HTTPS，将 `CRYOVAULT_ADMIN_TOKEN` 设置为随机长 token，并设置随机 `CRYOVAULT_PANEL_PATH`（例如 `/panel/$(openssl rand -hex 16)`）。

## 常见问题

### 管理地址端口后面没有随机后缀

按顺序排查：

1. 确认用的是最新代码。一键脚本安装的服务器请重新运行脚本并选择「1. 安装或更新 CryoVault」；源码部署请 `git pull` 后重新执行 `./start.sh`。
2. 执行 `./start.sh --print-url` 直接查看当前地址和令牌。
3. 检查 `backend/.env`：`CRYOVAULT_PANEL_PATH` 应形如 `/panel/8d9cf22f...`。为空、`/panel/` 或格式非法时，启动脚本会自动重新生成。
4. 如果之前用旧版本构建过前端，旧的 `frontend/dist/index.html` 不含路径占位符，会导致前缀丢失。`./start.sh` 每次启动都会重新构建前端。
5. `./start.sh --dev` 是前端开发模式，不启用随机路径，这是正常行为。

访问 `http://服务器IP:8000/` 返回 404 也是预期行为，必须使用带随机后缀的完整地址。

## 配置

开发模式配置使用 `backend/.env`；一键脚本安装后的配置位于 `/var/lib/cryovault/cryovault.env`。变量前缀均为 `CRYOVAULT_`：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CRYOVAULT_DATA_DIR` | `data` | SQLite 数据库和上传文件目录 |
| `CRYOVAULT_ADMIN_TOKEN` | 空 | 管理接口 token，空值表示不启用管理鉴权 |
| `CRYOVAULT_PANEL_PATH` | 空 | 管理端随机访问路径，如 `/panel/3f9a…`；设置后根路径返回 404 |
| `CRYOVAULT_DOCS_ENABLED` | `true` | 是否暴露 `/docs` 与 `/openapi.json`；一键脚本默认关闭 |
| `CRYOVAULT_MAX_UPLOAD_SIZE` | `0` | 单文件上传上限，单位字节，0 表示不限 |
| `CRYOVAULT_MAX_TEXT_EDIT_SIZE` | `5242880` | 在线编辑器允许的最大文本大小，单位字节 |
| `CRYOVAULT_COOKIE_SECURE` | `false` | 通过 HTTPS 访问时设为 `true` |
| `CRYOVAULT_LOGIN_MAX_ATTEMPTS` | `5` | 登录窗口内允许的失败次数 |
| `CRYOVAULT_LOGIN_WINDOW_SECONDS` | `300` | 登录限流窗口，单位秒 |
| `CRYOVAULT_TRUST_PROXY_HEADERS` | `false` | 仅当部署在反向代理后时启用，按 `X-Forwarded-For` 识别客户端 |
| `CRYOVAULT_CORS_ORIGINS` | `[]` | 额外允许的跨域来源；默认仅同源 |
| `CRYOVAULT_BASE_URL` | `http://localhost:5173` | 外部集成使用的前端地址 |

管理员解锁后，后端会签发 HttpOnly 会话 Cookie；令牌只通过请求头提交一次，不会出现在 URL、访问日志或浏览器历史中。

## 验证

后端冒烟测试需要额外的测试依赖：

```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt
python smoke_test.py
```

前端构建：

```bash
cd frontend
npm run build
```
