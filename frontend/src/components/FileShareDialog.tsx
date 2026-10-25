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
      title="单文件分享直链"
      subtitle={file?.name}
      footer={
        <button className="btn-outline text-xs" onClick={onClose}>
          关闭
        </button>
      }
    >
      {loading ? (
        <div className="flex h-52 flex-col items-center justify-center gap-2.5 text-app-muted">
          <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
          <span className="text-xs text-app-faint">正在查询分享状态...</span>
        </div>
      ) : share ? (
        <div className="space-y-4">
          <QrPanel
            link={fileShareLink(share.share_token)}
            name={file?.name ?? "file"}
            hint={
              share.allow_edit
                ? "扫码后可在线查看并编辑文本文件，其他类型可免登录直接下载。"
                : "扫码后可在任意终端免登录高速预览或下载该文件。"
            }
          />
          <div className="flex flex-col gap-2.5 border-t border-app-border/80 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <span className="text-xs font-medium text-app-muted">
              {share.allow_edit ? (
                <span className="text-blue-600 dark:text-blue-400">
                  当前支持在线编辑
                </span>
              ) : (
                "当前为只读分享"
              )}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                className="btn-outline flex-1 text-xs sm:flex-none"
                onClick={toggleEdit}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>{share.allow_edit ? "设为只读" : "开启编辑"}</span>
              </button>
              {revokeShare && (
                <button
                  className="btn-danger flex-1 text-xs sm:flex-none"
                  onClick={revoke}
                  disabled={busy}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>撤销链接</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-app-border bg-app-panel2/60 p-4 text-xs leading-relaxed text-app-muted">
            为该文件单独生成免登录的下载直链与高清二维码，无需预先创建分组，即传即享。
          </div>
          <div className="rounded-xl border border-app-border bg-app-panel2/60 p-3">
            <label className="flex items-center gap-2.5 text-xs text-app-text cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-blue-600"
                checked={allowEdit}
                onChange={(e) => setAllowEdit(e.target.checked)}
              />
              <div>
                <span className="font-semibold">允许访客在线编辑内容</span>
                <p className="text-[11px] text-app-muted">
                  仅针对 txt、md、json、py 等文本/代码文件有效
                </p>
              </div>
            </label>
          </div>
          <button
            className="btn-primary w-full py-2.5 text-xs font-semibold"
            onClick={create}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            <span>生成专属直链与二维码</span>
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs text-app-danger">
          {error}
        </div>
      )}
    </Modal>
  );
}
