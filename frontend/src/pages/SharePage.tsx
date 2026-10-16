import { ArrowLeft, Download, Loader2, Share2, Snowflake } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

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
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="card p-8">
          <Share2 className="mx-auto h-10 w-10 text-rose-300" />
          <h1 className="mt-4 text-xl font-semibold text-white">分享链接不可用</h1>
          <p className="mt-2 text-sm text-slate-400">{error ?? "该分组可能已被删除或链接已失效。"}</p>
          <Link to="/" className="btn-outline mt-6 inline-flex">
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="vault-kicker flex items-center gap-2">
            <Snowflake className="h-3.5 w-3.5" />
            CryoVault / shared unit
          </div>
          <h1 className="mt-2 truncate text-2xl font-semibold tracking-wide text-ice-100">{info.name}</h1>
          <p className="mt-1 text-sm text-slate-400">{info.description || "共享文件分组"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
            {info.allow_edit ? "可编辑文本" : "只读访问"}
          </span>
          <span className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 sm:inline-flex">
            <Download className="h-3.5 w-3.5" />
            点击文件即可预览
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </div>
      )}

      <FileBrowser
        adapter={adapter}
        emptyHint="这个分享分组还没有文件"
      />
    </div>
  );
}
