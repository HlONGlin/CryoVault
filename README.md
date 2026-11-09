<div align="center">

# CryoVault v0.3.0

**单管理员、自托管、低维护成本的文件分享工具。**

文件保存在自有服务器的磁盘上；管理端使用统一的文件夹树、文件预览与分享管理，公开访客通过 `/s/<token>` 浏览或下载被分享的内容。

</div>

## 目录

- [功能](#功能)
- [快速启动](#快速启动)
- [一键部署](#一键部署)
- [从 v0.2.2 升级](#从-v022-升级)
- [回滚](#回滚)
- [路由与 API](#路由与-api)
- [配置](#配置)
- [WebDAV](#webdav)
- [开发与测试](#开发与测试)
- [项目结构](#项目结构)
- [安全边界](#安全边界)
- [已知限制](#已知限制)

## 功能

- 统一的嵌套文件夹树；文件和文件夹都在同一个浏览器中上传、搜索、排序、移动、重命名、删除和分享。
- 同一父目录下名称唯一；上传或重名时自动生成 `name (2)` 一类名称。
- 支持拖拽上传、分页、搜索、名称/大小/时间排序、列表/网格视图、多选和 ZIP 打包下载。
- 支持从外部链接导入文件到指定目录；下载端使用已解析并校验过的 IP，禁止代理环境绕过地址校验。
- 图片、音视频和文本预览；常见文本和代码文件可在浏览器内编辑。
- 文件与文件夹使用统一的分享模型，可设置编辑权限、可选密码和可选过期时间。
- 分享管理页可查看全部链接、修改权限/有效期/密码、复制链接、显示二维码并撤销。
- `/s/<token>` 同时处理文件和文件夹分享；旧 `/f/<token>` 会重定向到同一页面。
- 桌面侧栏、面包屑、工具栏和移动端抽屉导航；保留中文界面、深浅色主题。
- 可选 WebDAV 双向同步，远端路径以文件 ID 为稳定标识。

## 快速启动

要求 Python 3.10+、Node.js 18+ 和 npm。

### 本地脚本

```bash
./start.sh
```

脚本会创建 `backend/.venv`、安装依赖、构建前端，然后由 Uvicorn 在 8000 端口同时提供 API 和前端。开发时使用：

```bash
./start.sh --dev
```

### 手动启动

```bash
cd frontend
npm ci
npm run build

cd ../backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

首次启动会创建 `backend/data/cryovault.db` 和 `backend/data/storage/`。新建安装不需要迁移旧数据。

`CRYOVAULT_PANEL_PATH` 为空时，管理端可从 `/login` 和 `/files` 访问；设置随机面板路径后，管理端位于 `<panel-path>/files`，根路径返回 404。分享页始终使用公开的 `/s/` 地址。

## 一键部署

一键脚本适用于支持 `systemd` 的 Linux：

```bash
bash <(curl -fsSL https://github.com/HlONGlin/CryoVault/raw/main/one-click.sh)
```

脚本进入交互菜单，支持安装/更新、启停、卸载、重置管理员令牌和重新生成面板路径。默认位置如下：

| 内容 | 路径 |
| --- | --- |
| 程序 | `/opt/cryovault` |
| 数据、SQLite 数据库、文件存储和配置 | `/var/lib/cryovault` |
| systemd 单元 | `/etc/systemd/system/cryovault.service` |

脚本会创建 `cryovault` 系统账号并用于数据文件所有权，但**当前生成的 systemd 单元没有 `User=`，因此服务进程实际以 root 运行**。这是为了让网页内更新能够执行安装、写入 `/opt/cryovault` 并重启系统服务。网页更新会以 root 执行从配置的 GitHub 仓库拉取的安装脚本，只应在信任该更新来源时启用 `CRYOVAULT_UPDATE_ENABLED`。

`start.sh` 的用法保持不变；本次重构没有删除或重命名现有环境变量。

## 从 v0.2.2 升级

升级会修改 SQLite 元数据，但不会移动或重命名 `storage_dir` 中的已存文件。应用在首次执行 v0.3.0 迁移前，会用 SQLite backup API 创建与数据库同目录的备份：

```text
cryovault.db.pre-v0.3.0-YYYYMMDDTHHMMSSZ.bak
```

仍建议在升级前对整个数据目录做独立备份，并先在副本上演练。systemd 安装可以执行：

```bash
sudo systemctl stop cryovault
sudo cp -a /var/lib/cryovault "/var/lib/cryovault.pre-v0.3.0-$(date +%Y%m%d-%H%M%S)"
sudo systemctl start cryovault
```

然后通过一键脚本选择“安装或更新”，或在已校验的源码目录执行部署流程。升级后应检查：

1. `/api/health` 返回 `0.3.0`。
2. 管理端文件树可以浏览原有文件；原系统分组中的文件位于根目录。
3. 旧 `/s/<token>`、`/f/<token>`、`/api/share/<token>` 和 `/api/file-share/<token>` 链接仍有效。
4. 分享管理页能显示旧分组和旧文件分享，权限与 token 没有变化。
5. 启用了 WebDAV 时，先检查同步设置和日志，再执行一次手动同步。

迁移规则：

- 每个旧非系统 `Group` 转为根目录下同名 `Folder`；重名会自动编号。
- 原系统分组中的文件转为根目录文件。
- 旧 `Group.share_token` 和 `FileShare.share_token` 原样写入统一 `Share`，不会重新生成 token。
- 旧分组 `description` 保存在 `Folder.description`。
- 旧 `Group`、`FileShare` 和映射表只为兼容旧 API 保留；新界面和公开页只通过统一树与分享模型工作。

## 回滚

不要只恢复数据库而忽略升级后新增的文件。安全回滚方式如下：

```bash
sudo systemctl stop cryovault
sudo cp -a /var/lib/cryovault "/var/lib/cryovault.after-v0.3.0-$(date +%Y%m%d-%H%M%S)"
sudo rm -rf /var/lib/cryovault
sudo cp -a /var/lib/cryovault.pre-v0.3.0-YYYYMMDD-HHMMSS /var/lib/cryovault
# 将 /opt/cryovault 恢复到 v0.2.2 程序
sudo systemctl start cryovault
```

`after-v0.3.0-*` 目录保留升级后的数据库与文件，必须先保留它再恢复旧快照。也可以只替换迁移前数据库备份，但升级后新增或修改的文件不会出现在 v0.2.2 数据库中；需要从升级后的完整备份单独取回。

## 路由与 API

前端路由：

| 路由 | 用途 |
| --- | --- |
| `/files/:folderId?` | 统一文件树 |
| `/shares` | 分享管理 |
| `/settings` | WebDAV、更新与设置 |
| `/login` | 管理登录 |
| `/s/:token` | 文件/文件夹公开分享 |
| `/f/:token` | 旧文件分享兼容重定向 |

管理 API 统一使用当前登录会话。核心接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/admin/session` | 用 `X-Admin-Token` 换取短期 HttpOnly 会话 |
| `DELETE` | `/api/admin/session` | 服务端吊销当前会话 |
| `GET` | `/api/folders?parent_id=&page=&page_size=&sort=&order=&q=` | 列出目录内容 |
| `POST` | `/api/folders` | 新建文件夹 |
| `GET` | `/api/folders/{id}` | 文件夹、面包屑与子树统计 |
| `PATCH` | `/api/folders/{id}` | 重命名或移动文件夹 |
| `DELETE` | `/api/folders/{id}` | 递归删除文件夹 |
| `POST` | `/api/files` | 上传一个或多个文件到 `folder_id` |
| `POST` | `/api/files/import` | 从 URL 导入到指定目录 |
| `POST` | `/api/files/archive` | 将选中的文件/文件夹打包为 ZIP |
| `PATCH` | `/api/files/{id}` | 重命名或移动文件 |
| `DELETE` | `/api/files/{id}` | 删除文件 |
| `GET` | `/api/files/{id}/download` | 下载；支持 Range |
| `GET` | `/api/files/{id}/raw` | 内联读取；支持 Range |
| `GET` | `/api/files/{id}/content` | 读取可编辑文本和 ETag |
| `PUT` | `/api/files/{id}/content` | 用 ETag 乐观锁保存文本 |
| `GET` | `/api/shares` | 列出全部分享 |
| `POST` | `/api/shares` | 为文件或文件夹创建分享 |
| `PATCH` | `/api/shares/{id}` | 修改编辑权限、过期时间和密码 |
| `DELETE` | `/api/shares/{id}` | 立即撤销分享 |
| `GET` | `/api/public/shares/{token}` | 获取公开分享信息 |
| `POST` | `/api/public/shares/{token}/unlock` | 校验分享密码 |
| `GET` | `/api/public/shares/{token}/folders` | 浏览分享文件夹子树 |
| `GET` | `/api/public/shares/{token}/files/{id}/download` | 下载分享文件 |
| `GET` | `/api/stats` | 全局文件数与占用空间 |
| `GET` | `/api/health` | 运行版本与健康检查 |

创建分享的请求示例：

```json
{
  "target_type": "folder",
  "folder_id": 12,
  "allow_edit": false,
  "expires_at": "2026-12-31T23:59:59Z",
  "password": "optional-password"
}
```

公开文件夹 API 的每个请求都重新验证分享状态、密码 cookie、过期时间以及目标文件夹是否仍在分享根目录子树内。共享 token 本身不等于任意节点访问权限。

兼容接口 `/api/share/...`、`/api/file-share/...`、`/api/groups/...` 和 `/api/direct/...` 保留用于旧客户端；新前端不再调用这些入口。

## 配置

配置文件示例见 `backend/.env.example`。常用变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CRYOVAULT_DATA_DIR` | `./data` | SQLite、共享文件和迁移备份所在目录 |
| `CRYOVAULT_BASE_URL` | `http://localhost:5173` | 生成公开链接时使用的外部地址 |
| `CRYOVAULT_ADMIN_TOKEN` | 空 | 管理令牌；留空时管理 API 不要求认证 |
| `CRYOVAULT_MAX_UPLOAD_SIZE` | `0` | 单文件上限，0 表示不限制 |
| `CRYOVAULT_MAX_TEXT_EDIT_SIZE` | `5242880` | 浏览器文本编辑器的最大字节数 |
| `CRYOVAULT_SESSION_MAX_AGE` | `2592000` | 管理会话有效期，单位秒 |
| `CRYOVAULT_COOKIE_SECURE` | `false` | HTTPS 部署应设为 `true` |
| `CRYOVAULT_PANEL_PATH` | 空 | 管理端随机路径，例如 `/panel/随机值` |
| `CRYOVAULT_DOCS_ENABLED` | `false` | 是否公开 `/docs` 与 `/openapi.json` |
| `CRYOVAULT_TRUST_PROXY_HEADERS` | `false` | 仅在可信反向代理后开启 |
| `CRYOVAULT_CORS_ORIGINS` | `[]` | 额外允许的前端来源 |
| `CRYOVAULT_UPDATE_ENABLED` | `false` | 是否允许网页执行安装脚本 |
| `CRYOVAULT_UPDATE_COMMAND` | 空 | 仅允许安装目录内的一键脚本 |
| `CRYOVAULT_WEBDAV_ENABLED` | `false` | 是否启动定时双向同步 |

生产环境至少设置长随机管理员令牌、随机面板路径和 `CRYOVAULT_COOKIE_SECURE=true`，并通过 HTTPS 暴露服务。若管理员令牌为空，应用仍会启动，但会输出明显安全警告，且管理 API 对能访问服务的人开放；不要以这种状态监听公网。

依赖说明：固定 `httpcore==1.0.9`，是因为外链导入需要让 TLS 连接真正使用已经完成公网地址校验的解析结果，避免校验与实际连接之间的 DNS 重绑定窗口。项目没有引入 ORM 或迁移框架等重型新依赖；版本化迁移使用现有 SQLAlchemy 与 SQLite `schema_version` 表。

## WebDAV

WebDAV 设置保存在数据库中，密码由服务端加密保存且不会通过 API 返回。现有 v0.2.2 `SyncState` 行会保留，旧 `groups/<group-id>/<file-id>-<name>` 路径继续映射原文件，不会因升级自动重复上传或删除。

- 新文件使用 `files/<file-id>-<name>`；文件 ID 在目录移动后保持不变，因此文件夹移动不会触发远端搬家。
- 文件重命名会安全 MOVE 旧远端对象到稳定新路径，并立即保存新路径。
- 无法由本地文件 ID 认领的远端未知文件会保留并记为跳过，不会被静默删除。
- 远端删除、冲突和本地提交失败都有测试覆盖；本地文件替换采用暂存文件，数据库提交成功后才删除旧文件。
- 升级前仍应备份整个数据目录。升级后先执行手动同步并检查报告；若有异常，停止服务、保存升级后数据，再按上面的回滚步骤处理。

WebDAV 继续支持设置页中的连接测试、状态与手动运行。服务只应由单个进程运行，避免两个调度器同时修改同一数据。

## 开发与测试

后端：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest -q
```

Windows PowerShell：

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
python -m pytest -q
```

前端：

```bash
cd frontend
npm ci
npm run typecheck
npm run build
```

GitHub Actions 会在推送和拉取请求上分别执行 pytest、TypeScript 检查和前端生产构建。

## 项目结构

```text
CryoVault/
├─ backend/
│  ├─ app/
│  │  ├─ routers/       # 管理会话、文件夹、文件、分享、同步和更新 API
│  │  ├─ models.py      # Folder/FileItem/Share 及兼容旧 token 的数据表
│  │  ├─ database.py    # schema_version、幂等迁移与迁移前备份
│  │  ├─ operations.py  # 原子保存、唯一命名、文本编辑和树操作
│  │  ├─ webdav.py      # WebDAV 客户端、映射和同步调度
│  │  └─ main.py        # FastAPI 应用与按需加载的 SPA 静态托管
│  ├─ tests/            # pytest 回归测试
│  ├─ requirements.txt
│  └─ requirements-dev.txt
├─ frontend/
│  └─ src/
│     ├─ api/           # 唯一 API 客户端和类型
│     ├─ components/files/ # 统一文件浏览器视图与对话框
│     ├─ hooks/         # 目录、上传和选择状态
│     ├─ pages/         # Files、Shares、Settings、登录和公开分享页
│     └─ components/Layout.tsx
├─ docs/
│  ├─ ARCHITECTURE.md
│  └─ REFACTOR_PLAN.md
├─ .github/workflows/ci.yml
├─ scripts/sync_version.py
├─ start.sh
└─ one-click.sh
```

## 安全边界

- 管理员令牌只在登录请求的 `X-Admin-Token` 头中发送一次；成功后签发随机、服务端可吊销的 HttpOnly 会话。每次登录生成新值，锁定与更换令牌会使旧会话失效。
- 会话保存在进程内，因此服务重启会注销所有管理员，当前部署只支持单进程。
- 文件以明文保存在 `storage/`；CryoVault 不宣称本地加密或端到端加密。WebDAV 凭据会加密保存，但文件本身仍由远程存储服务管理。
- 分享密码使用 PBKDF2 哈希。修改密码、撤销分享或到期会阻止后续访问；文件编辑同时受分享权限和 ETag 校验保护。
- API、上传、会话与错误处理都有回归测试。不要在容器中禁用提权后仍开启网页更新；这种情况下请由宿主机管理员运行更新脚本。

## 已知限制

- 回收站、断点续传、多用户/角色、对象存储和存储配额不在本版本范围内。
- 在线编辑的进程内锁不覆盖多进程部署；请保持单 Uvicorn worker。ETag 可防止正常并发覆盖，但进程崩溃期间的文件与数据库一致性没有事务级保证。
- 管理员会话和登录限流状态在进程内，重启会失效或清空。
- 一键部署的更新链路需要服务以 root 运行，存在 GitHub/分支内容受信任边界；本次只如实记录，未扩大更新权限。
- 当前仓库没有声明许可证；公开发布或二次分发前应补充许可证文件。