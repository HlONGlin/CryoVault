import { Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { fileShareLink, type FileItem, type FileShareInfo } from "../api";
import { Modal } from "./Modal";
import { QrPanel } from "./QrPanel";

interface FileShareDialogProps {
  file: FileItem | null;
  onClose: () => void;
  getShare: (file: FileItem) => Promise<FileShareInfo | null>;
  createShare: (file: FileItem, allowEdit: boolean) => Promise<FileShareInfo>;
  revokeShare?: (file: FileItem) => Promise<void>;
}

export function FileShareDialog({
  file,
  onClose,
  getShare,
  createShare,
  revokeShare,
}: FileShareDialogProps) {
  const [share, setShare] = useState<FileShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allowEdit, setAllowEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setShare(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getShare(file)
      .then((result) => {
        if (cancelled) return;
        setShare(result);
        setAllowEdit(result?.allow_edit ?? false);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [file, getShare]);

  async function create() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setShare(await createShare(file, allowEdit));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEdit() {
    if (!file || !share) return;
    setBusy(true);
    setError(null);
    try {
      setShare(await createShare(file, !share.allow_edit));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!file || !revokeShare) return;
    if (!window.confirm("撤销后该下载链接和二维码将立即失效，确定继续？")) return;
    setBusy(true);
    setError(null);
    try {
      await revokeShare(file);
      setShare(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={file !== null}
      onClose={onClose}
      size="sm"
      title="单文件分享"
      subtitle={file?.name}
      footer={
        <button className="btn-outline" onClick={onClose}>
          关闭
        </button>
      }
    >
      {loading ? (
        <div className="flex h-48 items-center justify-center text-app-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : share ? (
        <div className="space-y-4">
          <QrPanel
            link={fileShareLink(share.share_token)}
            name={file?.name ?? "file"}
            hint={
              share.allow_edit
                ? "扫码后可查看并编辑该文本文件，其他类型文件可直接预览或下载。"
                : "扫码后可预览或下载该文件，无需登录。"
            }
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-app-border pt-4">
            <span className="mr-auto text-xs text-app-muted">
              {share.allow_edit ? "当前允许编辑文本" : "当前为只读分享"}
            </span>
            <button className="btn-outline" onClick={toggleEdit} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {share.allow_edit ? "改为只读" : "允许编辑"}
            </button>
            {revokeShare && (
              <button className="btn-danger" onClick={revoke} disabled={busy}>
                <Trash2 className="h-4 w-4" />
                撤销链接
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-app-border bg-app-panel2 p-4 text-sm text-app-muted">
            为这个文件单独生成下载链接和二维码，不需要创建分组。
          </div>
          <label className="flex items-center gap-2.5 text-sm text-app-text">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={allowEdit}
              onChange={(e) => setAllowEdit(e.target.checked)}
            />
            允许通过链接编辑文本文件
          </label>
          <button className="btn-primary w-full" onClick={create} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            生成下载链接与二维码
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-sm text-app-danger">
          {error}
        </div>
      )}
    </Modal>
  );
}
