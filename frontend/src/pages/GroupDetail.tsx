import {
  ArrowLeft,
  ChevronRight,
  Clock,
  FolderOpen,
  HardDrive,
  Home,
  Loader2,
  QrCode,
  Settings2,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { adminApi, shareLink, urls, type Group } from "../api";
import { panelPath } from "../base";
import { FileBrowser, type BrowserAdapter } from "../components/FileBrowser";
import { Modal } from "../components/Modal";
import { ShareDialog } from "../components/ShareDialog";
import { formatBytes, formatDate } from "../lib/format";

export function GroupDetail() {
  const { id } = useParams();
  const groupId = Number(id);

  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allowEdit, setAllowEdit] = useState(false);
  const [regenerate, setRegenerate] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const g = await adminApi.getGroup(groupId);
      setGroup(g);
      setName(g.name);
      setDescription(g.description);
      setAllowEdit(g.allow_edit);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const adapter = useMemo<BrowserAdapter>(
    () => ({
      list: () => adminApi.listFiles(groupId),
      rawUrl: (f) => urls.adminRaw(f.id),
      downloadUrl: (f) => urls.adminDownload(f.id),
      getContent: (f) => adminApi.getContent(f.id),
      saveContent: (f, content) => adminApi.saveContent(f.id, content),
      remove: (f) => adminApi.deleteFile(f.id),
      downloadArchive: (files) =>
        adminApi.downloadArchive(files.map((file) => file.id)),
      rename: (f, newName) => adminApi.renameFile(f.id, newName),
      upload: async (files, onProgress, signal) => {
        await adminApi.uploadFiles(groupId, files, onProgress, signal);
        void load();
      },
      getShare: (f) => adminApi.getFileShare(f.id),
      createShare: (f, allowEdit) => adminApi.createFileShare(f.id, allowEdit),
      revokeShare: (f) => adminApi.deleteFileShare(f.id),
    }),
    [groupId, load]
  );

  async function saveSettings() {
    setSaving(true);
    try {
      const g = await adminApi.updateGroup(groupId, {
        name: name.trim(),
        description: description.trim(),
        allow_edit: allowEdit,
        regenerate_token: regenerate,
      });
      setGroup(g);
      setRegenerate(false);
      setSettingsOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-app-muted">
        <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
        <span className="text-xs text-app-faint">正在载入分组信息...</span>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center text-app-muted shadow-sm">
        <p className="text-sm font-medium text-app-text">{error ?? "分组不存在或已被移除"}</p>
        <Link to={panelPath("/")} className="btn-outline mt-4 inline-flex text-xs">
          <ArrowLeft className="h-4 w-4" />
          返回文件库
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cloudreve Style Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-app-muted">
        <Link
          to={panelPath("/")}
          className="flex items-center gap-1.5 font-medium transition hover:text-app-text"
        >
          <Home className="h-3.5 w-3.5" />
          <span>文件库</span>
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-app-faint" />
        <span className="font-semibold text-app-text">{group.name}</span>
      </nav>

      {/* Cloudreve Style Group Hero Card */}
      <div className="card relative overflow-hidden bg-app-panel p-5 shadow-sm sm:p-6">
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-400">
              <FolderOpen className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-bold tracking-tight text-app-text sm:text-2xl">
                  {group.name}
                </h1>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                  Vault #{String(group.id).padStart(2, "0")}
                </span>
              </div>
              <p className="mt-1 text-xs text-app-muted">
                {group.description || "暂无分组描述信息"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="chip">
                  <FolderOpen className="h-3 w-3 text-app-faint" />
                  {group.file_count} 个文件
                </span>
                <span className="chip">
                  <HardDrive className="h-3 w-3 text-app-faint" />
                  {formatBytes(group.total_size)}
                </span>
                <span className="chip">
                  <Clock className="h-3 w-3 text-app-faint" />
                  {formatDate(group.created_at).split(" ")[0]}
                </span>
                <span
                  className={group.allow_edit ? "chip chip-accent" : "chip"}
                >
                  {group.allow_edit ? "公开链接可协同编辑" : "公开链接只读"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              className="btn-outline h-9 px-3.5 text-xs font-medium"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>设置</span>
            </button>
            <button
              className="btn-primary h-9 px-3.5 text-xs font-semibold"
              onClick={() => setShareOpen(true)}
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>分享二维码</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-app-danger">
          {error}
        </div>
      )}

      {/* Embedded FileBrowser with full Dual-View (Grid & List) */}
      <FileBrowser
        adapter={adapter}
        emptyHint="拖拽文件到此处，或点击右上角「上传文件」按钮"
      />

      {/* Share Dialog */}
      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        link={shareLink(group.share_token)}
        name={group.name}
        hint="扫码或复制链接即可在任意终端免登录访问此分组。"
      />

      {/* Settings Dialog */}
      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        size="sm"
        title="分组设置"
        subtitle={`管理「${group.name}」的属性与访问权限`}
        footer={
          <>
            <button
              className="btn-outline"
              onClick={() => setSettingsOpen(false)}
            >
              取消
            </button>
            <button
              className="btn-primary"
              onClick={saveSettings}
              disabled={saving || !name.trim()}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>保存修改</span>
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-app-text">分组名称</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-app-muted">描述</span>
            <textarea
              className="input min-h-[80px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="space-y-2.5 rounded-xl border border-app-border bg-app-panel2/60 p-3 text-xs">
            <label className="flex items-center gap-2.5 text-app-text cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-blue-600"
                checked={allowEdit}
                onChange={(e) => setAllowEdit(e.target.checked)}
              />
              <div>
                <span className="font-semibold">允许通过分享链接在线编辑文本文件</span>
                <p className="text-[11px] text-app-muted">
                  开启后访客无需登录即可在线修改并保存文本与代码文件
                </p>
              </div>
            </label>
            <label className="flex items-center gap-2.5 text-app-text cursor-pointer pt-2 border-t border-app-border/60">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-red-600"
                checked={regenerate}
                onChange={(e) => setRegenerate(e.target.checked)}
              />
              <div>
                <span className="font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  重新生成公开分享 Token
                </span>
                <p className="text-[11px] text-app-muted">
                  注意：勾选后旧的分享链接与二维码将立即失效
                </p>
              </div>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
