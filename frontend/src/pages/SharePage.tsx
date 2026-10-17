import { Download, Loader2, Share2, Snowflake } from "lucide-react";
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
      <div className="flex h-64 items-center justify-center text-app-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="card p-8">
          <Share2 className="mx-auto h-10 w-10 text-app-danger" />
          <h1 className="mt-4 text-xl font-semibold text-app-text">
            分享链接不可用
          </h1>
          <p className="mt-2 text-sm text-app-muted">
            {error ?? "该分组可能已被删除或链接已失效。"}
          </p>
          <p className="mt-4 text-xs text-app-faint">
            请联系分享者获取新的链接。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-6 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[var(--accent-soft)] blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="vault-kicker flex items-center gap-2">
              <Snowflake className="h-3.5 w-3.5" />
              CryoVault / shared unit
            </div>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-wide text-app-text">
              {info.name}
            </h1>
            <p className="mt-1 text-sm text-app-muted">
              {info.description || "共享文件分组"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <span
              className={info.allow_edit ? "badge text-app-accent" : "badge"}
            >
              {info.allow_edit ? "可编辑文本" : "只读访问"}
            </span>
            <span className="badge">
              <Download className="h-3.5 w-3.5" />
              点击文件即可预览
            </span>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-2.5 text-sm text-app-danger">
          {error}
        </div>
      )}

      <FileBrowser adapter={adapter} emptyHint="这个分享分组还没有文件" />
    </div>
  );
}
