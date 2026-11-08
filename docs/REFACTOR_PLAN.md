# CryoVault 0.3.0 重构计划

审计日期：2026-11-08  
审计基线：`main`，提交 `408f697`；仓库 `VERSION` 为 `0.2.2`。本阶段仅审计并形成方案，未修改应用代码或运行态数据。

## 1. 审计结论

### 已确认的问题

- 数据模型确实以 `Group.is_system` 和“单文件分享”系统分组保存直传文件；文件必须属于分组，不能表达根目录和嵌套目录。文件名没有目录内唯一约束。
- 分组分享字段在 `groups` 表，单文件分享在 `file_shares` 表。对应 API 分布在 `/api/groups`、`/api/direct`、`/api/share`、`/api/file-share`，公开页面分别为 `/s/:token` 和 `/f/:token`。`DirectShare.tsx` 没有被路由引用；`FileBrowser` adapter 在多个页面重复编写。
- Dashboard 同时呈现分组与直传文件区域，使用 `#single-files` 锚点和 `/direct` 重定向。统计卡片由前后端多个请求拼装，直传文件数由子组件回传。
- `to_group_out` 通过 ORM relationship 遍历分组的全部文件计算数量与空间；列表接口返回完整集合，无分页。`FileBrowser.tsx` 集中承载多类状态、操作和视图。
- 上传先写最终存储路径再提交数据库；批次处理不是事务整体原子操作。`delete_file` 先删磁盘文件再提交数据库；`purge_group_files` 仅删磁盘文件并依赖级联删除。在线文本编辑先替换磁盘文件，后提交数据库，没有版本条件。
- 数据库只有 `create_all` 和对 `groups.is_system` 的临时补列逻辑，无 schema 版本记录或迁移前备份。
- 管理 cookie 是由管理员令牌导出的确定性 HMAC。`session_max_age` 被设置到 cookie，但服务端会话本身没有过期、轮换或吊销记录；删除 cookie 只影响当前浏览器。`admin_token` 为空时 `require_admin` 放行。配置默认 `docs_enabled=true`、`cookie_secure=false`。
- `main.py` 在模块导入时读取 `frontend/dist/index.html`，之后构建前端不会更新已缓存内容；若启动时 dist 不存在，SPA 路由也不会注册。
- WebDAV 的实际路径是 `groups/<group id>/<file id>-<safe name>`，不是 README 所述的 `groups/<group id>/<file id>-<filename>` 的精确原名；`SyncState.remote_path` 唯一且按本地文件 ID 关联。同步器会依据状态删除本地或远端文件，因此路径/映射迁移属于高风险操作。
- `one-click.sh` 创建系统用户并把数据目录交给该用户，但当前生成的 systemd 单元没有 `User=`，所以服务以 root 运行。网页更新调用的脚本也要求 root；该机制仍需在文档中如实标注其权限风险。
- README 的目录说明、功能入口描述和宣传文案与代码现状不完全相符；前端出现 “Cloudreve” 字样，页脚有本地加密和极速传输等未被实现支持的表述。
- 只有 `backend/smoke_test.py`，没有 pytest 配置、前端测试或 CI。`requirements-dev.txt` 目前仅补充 httpx。
- `.opencode` 中有已跟踪文件和本地会话/锁状态；当前工作区另有未跟踪会话目录。清理工作只应删除已跟踪的仓库 agent 状态，并新增忽略规则；不得删除当前未跟踪运行态数据。

### 对初步审查的修订

- 仓库不是版本元数据 `0.1.0`：根目录 `VERSION` 是 `0.2.2`，后端从该文件读取版本；前端 `package.json` 仍是 `0.1.0`，应在发布阶段统一。
- 已知问题中的系统分组中文名称在当前 PowerShell 输出中显示乱码，代码语义和模型注释表明其用途是“单文件分享”分组；迁移识别应依赖 `is_system`，不能依赖名称字符串。
- WebDAV 不应随新目录 ID 重新生成远端路径。保持现有 `remote_path` 和 `SyncState` 映射可避免首次同步误判为删除/新增；若迁移验证无法证明映射安全，应停止自动同步并保留远端数据，等待管理员确认。
- `one-click.sh` 创建服务用户的事实成立，但“服务用户运行服务”的说法不成立；本次不改变服务权限边界或在线更新实现，只修正文档并记录现有 root 风险。

## 2. 目标数据模型

- `Folder`: `id`、可空 `parent_id`、`name`、`description`、`created_at`、`updated_at`。同一 `parent_id` 下文件夹名唯一；根级文件夹同样唯一。用数据库唯一约束配合 SQLite 对空值的处理，应用层统一完成同名自动编号。
- `FileItem`: 保留 `id`、`name`、`stored_name`、`size`、`mime_type`、时间戳；以可空 `folder_id` 替换 `group_id`，空值表示根目录。对同目录文件/文件夹统一执行 `name (2)` 冲突处理。磁盘上的 `stored_name` 和实际文件字节不变。
- `Share`: `id`、唯一 `token`、`target_type`（`file`/`folder`）、可空 `file_id`/`folder_id`、`allow_edit`、可空 `expires_at`/`password_hash`、`created_at`。数据库约束确保恰有一个有效目标，默认每个目标最多一个分享，修改分享保留 token，撤销立即删除记录。
- `SchemaVersion`: 单行当前版本。采用项目内轻量迁移函数，不引入 Alembic；迁移脚本每个版本独立、显式事务，并记录完成版本。
- WebDAV `SyncState` 维持现有 `remote_path`、`local_file_id` 与哈希/ETag 字段，不将同步状态改绑到 Folder。文件 ID 和磁盘名保留，现有路径因而可继续匹配。

## 3. API 变更表

统一使用 `/api/folders`、`/api/files`、`/api/shares`。管理 API 受同一管理员会话保护。列表返回统一错误结构（建议 `{ "error": { "code", "message", "details?" } }`），并提供一致的状态码。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/folders?parent_id=&page=&page_size=&sort=&order=&q=` | 列目录项，分页、排序、搜索，返回文件夹和文件统一条目 |
| `POST /api/folders` | 创建文件夹，可指定父目录 |
| `GET/PATCH/DELETE /api/folders/{id}` | 读取、重命名/移动、递归删除目录 |
| `POST /api/files` | 上传到 `folder_id`（空值为根）；每个文件独立返回成功或失败 |
| `GET/PATCH/DELETE /api/files/{id}` | 文件元数据、重命名/移动、删除 |
| `GET /api/files/{id}/raw|download` | 原始内容与下载，保留 Range 支持 |
| `GET/PUT /api/files/{id}/content` | 文本编辑；返回并要求 `etag`/版本条件，冲突为 409 |
| `POST /api/files/archive` | 选择文件及文件夹后递归打包下载 |
| `POST /api/imports/link` | 安全校验外链并导入到指定目录 |
| `GET/POST /api/shares` | 列出所有分享、创建文件或文件夹分享 |
| `PATCH/DELETE /api/shares/{id}` | 修改权限、有效期、密码或撤销 |
| `GET /api/shares/{token}` 及子资源路由 | 统一公开访问文件/文件夹分享；文件夹公开浏览限制在分享目标子树内 |
| `GET /api/stats` | SQL 聚合返回全局文件数、占用空间和容量配置 |

兼容期保留 `/api/share/...` 和 `/api/file-share/...` 路由，将其解析到统一 Share 服务；保留 `/api/groups`、`/api/direct` 所需的薄兼容端点，以免旧管理客户端意外失效，具体下线周期在 CHANGELOG 标注。`/s/:token` 继续作为统一公开页；`/f/:token` 只做兼容跳转，token 原样保留。更新、WebDAV 管理 API 继续使用现有路径。

## 4. 迁移和回滚方案

1. 启动时检查数据库版本。迁移前用 SQLite backup API 生成 `cryovault.db.pre-v0.3.0-<UTC时间>.bak`，不能只复制处于 WAL 写入状态的主 db 文件。备份失败则拒绝迁移启动。
2. 在事务中创建版本表和新表；每个非系统旧 Group 创建一个根 Folder，复制名称、描述和创建时间。`is_system=true` 分组的文件迁移到根目录（`folder_id=NULL`）。所有 `FileItem.id`、`stored_name`、内容、大小、MIME 和时间戳保留。
3. 旧 Group 的分享属性迁入 Folder Share，token 和编辑权限原样保留；旧 FileShare 迁入文件 Share，token 与编辑权限原样保留。兼容路由按同一个 token 解析，不生成替代 token。
4. 旧 `sync_states` 原样保留并校验每一条 `local_file_id` 仍指向同一 FileItem、`remote_path` 无变化。同步功能只有在校验完成后才运行；异常时关闭调度并在管理状态/日志中明确提示，绝不自动清理远端文件。
5. 新 schema 与数据校验通过后写入版本号，再启动应用。事务失败时回滚数据库事务；保留备份并停止启动，禁止带部分 schema 运行。
6. 回滚：停止服务，将当前数据库另行改名留存，再用迁移前 `.bak` 恢复；文件存储无需恢复，因为迁移不改动存储文件。恢复原 v0.2.2 程序目录/部署包并重启。回滚会丢弃升级后新增的数据库元数据，因此升级后投入使用前应再次备份；不应覆盖升级期间新增文件。

旧系统分组自身的 token 使用 `Share(target_type="folder", folder_id=NULL)` 保存，但公开访问仅限于原系统分组中仍在根目录的文件，不包括之后添加的其他根目录文件，也不允许浏览子文件夹。这样保留旧 token 而不扩大其可见范围。

当前实现保留旧表以服务兼容接口。新版 WebDAV 映射尚未完成，所有同步已暂停；保留原有 `sync_states` 和远端数据，连接测试仍可使用。恢复同步前必须实现并测试映射及删除冲突策略。

## 5. 分阶段实施与验收

每阶段形成独立 commit；开始下一阶段前运行对应测试。迁移相关测试使用临时 SQLite 和临时存储目录，不触碰实际用户数据。

| 阶段 | 工作 | 阶段验收 |
| --- | --- | --- |
| 0 审计与方案 | 本文档；核实旧 schema、API、同步和部署行为 | 方案审阅后再改应用代码 |
| 1 工程清理与基线 | 加 pytest 配置并把现有 smoke 覆盖迁入 pytest；忽略 `.opencode/`，只移除仓库已跟踪的 agent 状态文件；记录当前前端 typecheck/build 基线 | `pytest`、`npm run typecheck`、`npm run build` 通过；提交独立 commit |
| 2 模型与迁移 | Folder/FileItem/Share/SchemaVersion；可重复迁移、SQLite 在线备份、旧 token 迁移与兼容解析；WebDAV 状态校验 | 从 v0.2.2 fixture 升级并验证文件字节、token、分享、同步状态；新安装可建库；提交独立 commit |
| 3 后端 API | 新资源 API、统计聚合、分页/排序/搜索、目录递归和移动、目录打包、外链导入、上传清理、删除顺序、乐观编辑、统一错误、WebDAV 兼容 | API 行为和失败路径测试通过；旧路由测试通过；提交独立 commit |
| 4 前端 | 统一 API 客户端、文件树路由/布局、拆分浏览器组件与 hooks、统一公开页、分享管理；保留主题、预览/编辑、二维码与移动端 | typecheck/build 通过；核心文件控制在约 300 行内，超出项记录原因；提交独立 commit |
| 5 安全与发布 | 服务端会话、锁定吊销、令牌轮换失效、安全默认值、按需读取 SPA index；修正文档/脚本事实、架构文档、变更记录、版本同步；可选 CI | 全量 pytest、typecheck、build；检查干净安装和升级步骤；提交独立 commit |

pytest 必须覆盖迁移和旧 token、目录 CRUD/移动/重名、分享权限与子树隔离、过期和密码、上传失败清理、Range、会话吊销、编辑冲突。前端核心 hooks 测试视状态逻辑复杂度补充，不为了测试而镜像实现。

## 6. 简化决策与待确认

- 迁移采用轻量 schema 版本表，避免为单一 SQLite 服务引入 Alembic 及维护成本。
- 不新增多租户、回收站、断点续传、对象存储或权限角色；单管理员模型保持不变。
- 文件/目录采用统一 listing 条目，但仍保留独立 Folder、FileItem 表，避免引入通用 Node 抽象和复杂约束。
- 文件夹分享默认分享整个子树；每次公开请求都从目标 Folder 向上/向下校验归属，不能仅凭客户端传来的文件 ID 放行。
- 分享密码使用已有依赖可实现的标准密码哈希；避免明文存储。密码挑战的短期授权机制与错误限流在阶段 3 设计中落定。
- 管理令牌为空时采用启动显著警告并保持本机开发兼容；生产安装脚本继续生成令牌。该策略须在安全默认值实现时检查是否有更可靠的回环监听判断。
- WebDAV 更新不改远端路径。若文件移动只改变 CryoVault 目录，不改变底层 FileItem ID，当前 WebDAV 命名路径可保持稳定；不尝试把 WebDAV 远端目录同步成用户可见 Folder 树。
- 分享根目标表示、兼容管理 API 的保留期限、列表分页默认值及最大值属于实施时需要定值的细节；除根分享映射外，其余按简单一致的 API 约定执行并写入架构文档。

