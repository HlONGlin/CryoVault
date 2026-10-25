import {
  Eye,
  FolderOpen,
  Loader2,
  Pencil,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { shareApi, urls, type ShareInfo } from "../api";
import { FileBrowser, type BrowserAdapter } from "../components/FileBrowser";

export function SharePage() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInfo = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setInfo(await shareApi.info(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  const adapter = useMemo<BrowserAdapter>(
    () => ({
      list: () => shareApi.listFiles(token),
      rawUrl: (file) => urls.shareRaw(token, file.id),
      downloadUrl: (file) => urls.shareDownload(token, file.id),
      getContent: (file) => shareApi.getContent(token, file.id),
      saveContent: info?.allow_edit
        ? (file, content) => shareApi.saveContent(token, file.id, content)
        : undefined,
    }),
    [info?.allow_edit, token]
  );

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-app-muted">
        <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
        <span className="text-xs text-app-faint">正在获取分享空间数据...</span>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="card p-8 shadow-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-500/20 dark:bg-red-950/40 dark:text-red-400">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-app-text">
            分享链接不可用
          </h1>
          <p className="mt-2 text-xs text-app-muted">
            {error ?? "该分组已被删除，或分享者已重置该链接的访问令牌。"}
          </p>
          <p className="mt-4 text-[11px] text-app-faint">
            如有疑问，请向文件所有者索取最新的访问链接。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cloudreve Style Share Header Card */}
      <section className="card relative overflow-hidden bg-app-panel p-5 shadow-sm sm:p-6">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-400">
              <FolderOpen className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                  公开分享
                </span>
                <h1 className="truncate text-xl font-bold tracking-tight text-app-text sm:text-2xl">
                  {info.name}
                </h1>
              </div>
              <p className="mt-1 text-xs text-app-muted">
                {info.description || "分享者未提供分组描述信息"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span
              className={
                info.allow_edit
                  ? "badge bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "badge bg-app-panel2 text-app-muted"
              }
            >
              {info.allow_edit ? (
                <>
                  <Pencil className="h-3 w-3" />
                  可协同编辑文本
                </>
              ) : (
                "只读访问"
              )}
            </span>
            <span className="badge bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
              <Eye className="h-3 w-3" />
              点击文件可直接预览
            </span>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-app-danger">
          {error}
        </div>
      )}

      {/* Embedded FileBrowser with List/Grid switch & search */}
      <FileBrowser adapter={adapter} emptyHint="这个分享空间目前还没有文件" />
    </div>
  );
}
