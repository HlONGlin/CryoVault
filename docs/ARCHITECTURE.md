# CryoVault v0.3.0 架构

CryoVault 是单管理员、单进程、自托管部署。FastAPI 提供管理 API、公开分享 API 和可选的构建产物托管；React 管理端与公开页调用同一个 API 客户端。SQLite 保存元数据，真实文件以 UUID 平铺存放在 `CRYOVAULT_DATA_DIR/storage/`。

## 统一文件树

核心数据模型是：

- `Folder(id, parent_id, name, description, created_at, updated_at)`
- `FileItem(id, folder_id, name, stored_name, size, mime_type, created_at, updated_at)`
- `Share(id, token, target_type, file_id, folder_id, allow_edit, expires_at, password_hash, created_at)`

`parent_id = NULL` 和 `folder_id = NULL` 表示根目录。事件循环外由写锁串行化树修改，数据库事务再确认同一父目录内名称唯一。用户提交重名时，服务端生成 `name (2)` 一类名称。文件夹移动会检查目标不在自身子树中。

文件内容不使用目录层级。`stored_name` 是 UUID 文件，目录移动、重命名和分享都只修改元数据，不会移动磁盘文件。这样 WebDAV 的文件 ID 和已有 `stored_name` 在升级、移动时保持稳定。

`Group`、`FileShare`、`legacy_group_folders` 等旧表只保留给 v0.2.2 token 和旧 API 兼容层使用。新前端与公开页只使用 `Folder`、`FileItem` 和 `Share`。兼容代码校验旧分组分享时只暴露迁移时属于该分组、且仍在受保护范围内的文件，不能借旧 token 查看其他根目录文件。

## API 边界

管理资源：

- `/api/folders`
- `/api/files`
- `/api/shares`
- `/api/admin/session`
- `/api/admin/sync`
- `/api/admin/update`

公开资源使用 `/api/public/shares/{token}`。目录列表支持分页、搜索和排序，返回 `items/total/page/page_size`；文件夹统计由 SQL `COUNT/SUM` 聚合。错误响应统一经过 FastAPI 异常处理器，包含稳定的 `detail` 文案和状态码。

旧接口 `/api/groups`、`/api/direct`、`/api/share`、`/api/file-share` 仍保留。它们把访问解析到迁移后的 `Share` 或受控兼容映射，因此旧 token 在迁移后仍可使用，密码、过期和撤销状态也由统一分享记录控制。

## 分享安全

每次公开请求都按以下顺序重新校验：

1. `Share` 存在且 token 未撤销。
2. `expires_at` 尚未到期。
3. 有密码时，短期密码 cookie 有效且与当前 `password_hash` 匹配。
4. 请求的文件或子目录仍位于分享目标文件夹的子树中。
5. 编辑请求还要求 `allow_edit`，并通过当前文本 ETag。

密码使用 PBKDF2 哈希，服务端不保存明文。密码 cookie 携带分享 ID、版本和到期时间，并受 HttpOnly、SameSite 策略保护。修改密码会使旧授权 cookie 失效；撤销或到期会阻止后续信息的读取、下载和浏览。

## 管理会话

管理员在 `POST /api/admin/session` 中通过 `X-Admin-Token` 提交令牌。服务端比较令牌后签发随机会话 ID，并保存到进程内会话表，设置 HttpOnly cookie。会话有固定过期时间，每次成功登录生成新值；`DELETE /api/admin/session` 会从服务端表删除当前值，因此浏览器复制旧 cookie 后也无法继续使用。

更换 `CRYOVAULT_ADMIN_TOKEN` 或重启进程会使旧会话失效。会话未持久化，项目明确只支持单 worker 单进程部署。管理员令牌为空时，管理 API 不要求认证，启动日志会输出醒目的安全警告；生产环境必须设置随机长令牌并启用 HTTPS。

## 一致性策略

上传先写入数据目录中的临时文件，校验大小和类型后 `fsync`/原子重命名到 UUID 存储路径，再写数据库。数据库失败会删除新文件；多文件上传逐个返回成功或失败，不把整批结果伪装成原子操作。

删除先提交数据库变更，成功后清理磁盘文件。如果提交失败，文件仍保留，宁可留下孤儿文件也不先毁掉可恢复数据。文件夹递归删除沿用同一顺序。

文本编辑带 ETag 乐观锁。客户端提交旧 ETag 时返回 409，前端提示重新加载。正常并发不会静默覆盖；跨进程和多进程场景仍不在支持范围内。

SPA 的 `index.html` 在请求时按修改时间重新读取并缓存，因此可以先启动后端、后构建前端，无需重启后端即可挂载新构建。

## 版本化迁移

`database.py` 使用 `schema_version` 表执行从 0 到当前版本的幂等迁移。迁移事务包括：

- 旧 Group 转为根目录 Folder，保留 description 并按同级唯一规则处理重名。
- 系统分组文件转为根目录文件；旧 FileItem ID 和 stored_name 不变。
- 旧 Group/FileShare token 原样写入 Share；token 冲突时中止整个迁移。
- 增加文件夹外键和目录树约束。
- 增加统一 Share、密码、过期和登录/运行所需结构。
- 保留 SyncState 的旧路径与本地文件 ID。

迁移前若检测到旧 schema 或待升级版本，先调用 SQLite backup API 生成：

```text
cryovault.db.pre-v0.3.0-YYYYMMDDTHHMMSSZ.bak
```

只有在备份成功后，迁移才在 `BEGIN IMMEDIATE` 事务中执行。每一步都可在失败后由同一版本重试；检测到不完整迁移和 token 冲突则停止并保留原数据库。数据库备份与 storage 文件共同构成恢复点。

## WebDAV

`webdav.py` 保留远端布局映射：

- 旧 `groups/<group-id>/<file-id>-<name>` 通过 `SyncState.local_file_id` 认领原文件。
- 新文件使用 `files/<file-id>-<name>`。
- 文件夹移动不改变文件 ID，因此不改变远端路径。
- 文件重命名使用 WebDAV `MOVE`，目标存在时不会覆盖；失败不会先改为错误的本地状态。
- 远端未知文件保留并记录跳过，不会静默删除。
- 本地下载先写暂存文件，数据库提交成功后才替换本地存储或清理旧文件。

同步状态和旧远端内容都不在迁移中删除。升级后仍应先手动同步并检查报告；如配置或映射异常，停止同步并恢复迁移前全量备份。

## 前端结构

管理路由：

- `/files/:folderId?`
- `/shares`
- `/settings`
- `/login`

公开路由：

- `/s/:token`
- `/f/:token` 兼容重定向

`FileBrowser` 通过 `FileBrowseSource` 接收管理或公开数据源，公开页通过 `capabilities` 关闭上传、移动等管理能力。目录加载、上传、选择分别由 `useFolderListing`、`useUpload`、`useSelection` 管理；Toolbar、Breadcrumbs、Grid/List、操作菜单和对话框是独立组件。分享管理与公开页复用同一套 API 类型和预览组件。

## 测试与取舍

`backend/tests/` 覆盖迁移备份、旧 token、目录树 CRUD/移动、重名、分享密码/过期/子树权限、上传失败清理、Range、会话吊销、编辑冲突与 WebDAV 映射。CI 同时执行 pytest、`npm run typecheck` 和 `npm run build`。

迁移采用 `schema_version`，没有引入 Alembic：本仓库只有一个 SQLAlchemy 元数据来源和少量 SQLite 结构，轻量迁移更容易审阅、部署和回滚。固定 `httpcore==1.0.9` 是为外链导入的已解析 IP 连接路径提供支持，避免 DNS 重绑定；没有增加新的框架或运行时服务。

## 已知边界

- 文件明文存储；不做客户端加密。
- 单进程 Uvicorn 是当前一致性模型的一部分。
- 进程崩溃时仍可能出现少量孤儿磁盘文件，它们不会被自动清理。
- 进程内会话、登录限流状态不会跨重启保留。
- 一键部署的服务与网页更新以 root 运行，更新源受信任是部署边界。
- 回收站、断点续传、多用户、对象存储和配额不在本次范围。