import {
  ArrowLeft,
  HardDrive,
  Loader2,
  QrCode,
  Settings2,
  Snowflake,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { adminApi, shareLink, urls, type Group } from "../api";
import { panelPath } from "../base";
import { FileBrowser, type BrowserAdapter } from "../components/FileBrowser";
import { Modal } from "../components/Modal";
import { ShareDialog } from "../components/ShareDialog";
import { formatBytes } from "../lib/format";

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
      rename: (f, newName) => adminApi.renameFile(f.id, newName),
      upload: async (files) => {
        await adminApi.uploadFiles(groupId, files);
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
      <div className="flex h-64 items-center justify-center text-app-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="card p-8 text-center text-app-muted">
        <p>{error ?? "分组不存在"}</p>
        <Link to={panelPath("/")} className="btn-outline mt-4 inline-flex">
          <ArrowLeft className="h-4 w-4" />
          返回
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={panelPath("/")}
          className="inline-flex items-center gap-1.5 text-sm text-app-muted transition hover:text-app-text"
        >
          <ArrowLeft className="h-4 w-4" />
          分组管理
        </Link>

        <div className="card mt-3 flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="vault-kicker flex items-center gap-2">
              <Snowflake className="h-3.5 w-3.5" />
              Vault unit {String(group.id).padStart(2, "0")}
            </div>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-wide text-app-text">
              {group.name}
            </h1>
            <p className="mt-1 text-sm text-app-muted">
              {group.description || "暂无描述"}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="chip">{group.file_count} 个文件</span>
              <span className="chip">
                <HardDrive className="h-3.5 w-3.5" />
                {formatBytes(group.total_size)}
              </span>
              <span className={group.allow_edit ? "chip chip-accent" : "chip"}>
                {group.allow_edit ? "分享可编辑" : "分享只读"}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              className="btn-outline"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
              设置
            </button>
            <button className="btn-primary" onClick={() => setShareOpen(true)}>
              <QrCode className="h-4 w-4" />
              分享二维码
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-2.5 text-sm text-app-danger">
          {error}
        </div>
      )}

      <FileBrowser
        adapter={adapter}
        emptyHint="拖拽文件到此处，或点击右上角「上传」"
      />

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        link={shareLink(group.share_token)}
        name={group.name}
        hint="扫码或打开链接即可浏览该分组文件，无需登录。"
      />

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        size="sm"
        title="分组设置"
        subtitle={group.name}
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
              保存
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-app-muted">名称</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-app-muted">描述</span>
            <textarea
              className="input min-h-[72px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2.5 text-sm text-app-text">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={allowEdit}
              onChange={(e) => setAllowEdit(e.target.checked)}
            />
            允许通过分享链接编辑文本文件
          </label>
          <label className="flex items-center gap-2.5 text-sm text-app-text">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={regenerate}
              onChange={(e) => setRegenerate(e.target.checked)}
            />
            重新生成分享链接（旧二维码立即失效）
          </label>
        </div>
      </Modal>
    </div>
  );
}
