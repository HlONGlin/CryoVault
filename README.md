# CryoVault

CryoVault 是一个面向 Linux 自托管场景的轻量网盘，支持本地文件存储、分组管理、二维码分享，以及常见文件的在线预览。

## 功能

- 本地文件系统保存上传数据，SQLite 保存分组和文件元数据
- 分组上传、搜索、重命名、删除和批量上传
- 每个分组拥有独立分享链接，可生成二维码 PNG
- 分享页无需登录，可浏览并下载分组内文件
- TXT、YAML、JSON、Markdown、代码等 UTF-8 文本在线查看和编辑
- 图片预览与缩放，视频支持浏览器原生播放和 Range 拖动，音频支持播放
- 可选管理 API token；分享链接不需要管理 token
- 开发模式支持手机通过局域网访问前端，适合扫码测试

## 技术栈

- Backend: Python 3.11+、FastAPI、SQLAlchemy、SQLite
- Frontend: React、TypeScript、Vite、Tailwind CSS、CodeMirror
- Storage: `CRYOVAULT_DATA_DIR/storage`

## Linux 快速启动

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env，至少设置一个管理 token
chmod +x start.sh
./start.sh
```

启动后访问：

- 管理端：`http://localhost:5173`
- API 文档：`http://localhost:8000/docs`

## 一键安装与管理

在支持 systemd 的 Linux 服务器上，使用 root 执行下面的命令，直接进入 CryoVault 数字管理菜单：

```bash
bash <(curl -fsSL https://github.com/HlONGlin/CryoVault/raw/main/one-click.sh)
```

脚本会检查并安装 Python、Node.js 等依赖，下载项目源码、构建前端、配置 systemd 服务并启动 CryoVault。首次安装时会提示设置管理员令牌；令牌可用于管理页面右上角的「管理令牌」设置。

数字菜单提供以下操作：

1. 安装或更新 CryoVault
2. 启动 CryoVault
3. 停止 CryoVault
4. 彻底卸载并清除全部数据
5. 重置管理员令牌（保留文件数据）

默认安装位置：

- 程序：`/opt/cryovault`
- 文件、SQLite 数据库和配置：`/var/lib/cryovault`
- systemd 服务：`cryovault.service`

彻底卸载会同时删除上传文件、数据库和管理员令牌，脚本会要求输入 `DELETE` 二次确认。重置管理员令牌只修改访问凭据，不会删除分组或文件。

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

如果 `frontend/dist` 存在，FastAPI 会自动托管构建后的前端，此时可以直接访问 `http://服务器地址:8000`。生产环境建议通过 Nginx 或 Caddy 配置 HTTPS，并将 `CRYOVAULT_ADMIN_TOKEN` 设置为随机长 token。

## 配置

配置使用 `backend/.env`，变量前缀为 `CRYOVAULT_`：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CRYOVAULT_DATA_DIR` | `data` | SQLite 数据库和上传文件目录 |
| `CRYOVAULT_ADMIN_TOKEN` | 空 | 管理接口 token，空值表示不启用管理鉴权 |
| `CRYOVAULT_MAX_UPLOAD_SIZE` | `0` | 单文件上传上限，单位字节，0 表示不限 |
| `CRYOVAULT_BASE_URL` | `http://localhost:5173` | 外部集成使用的前端地址 |

## 验证

后端冒烟测试：

```bash
cd backend
source .venv/bin/activate
python smoke_test.py
```

前端构建：

```bash
cd frontend
npm run build
```
