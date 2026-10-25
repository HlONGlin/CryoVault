import { ChevronRight, FilePlus2, Home, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { adminApi, urls } from "../api";
import { panelPath } from "../base";
import { FileBrowser, type BrowserAdapter } from "../components/FileBrowser";

export function DirectShare() {
  const adapter = useMemo<BrowserAdapter>(
    () => ({
      list: async () => (await adminApi.directInfo()).files,
      rawUrl: (f) => urls.adminRaw(f.id),
      downloadUrl: (f) => urls.adminDownload(f.id),
      getContent: (f) => adminApi.getContent(f.id),
      saveContent: (f, content) => adminApi.saveContent(f.id, content),
      remove: (f) => adminApi.deleteFile(f.id),
      rename: (f, newName) => adminApi.renameFile(f.id, newName),
      upload: (files) => adminApi.uploadDirectFiles(files),
      getShare: (f) => adminApi.getFileShare(f.id),
      createShare: (f, allowEdit) => adminApi.createFileShare(f.id, allowEdit),
      revokeShare: (f) => adminApi.deleteFileShare(f.id),
    }),
    []
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-app-muted">
        <Link
          to={panelPath("/")}
          className="flex items-center gap-1.5 font-medium transition hover:text-app-text"
        >
          <Home className="h-3.5 w-3.5" />
          <span>文件库</span>
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-app-faint" />
        <span className="font-semibold text-app-text">单文件分发</span>
      </nav>

      {/* Hero Banner Card */}
      <div className="card flex flex-col gap-4 bg-app-panel p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-400">
            <FilePlus2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-app-text sm:text-2xl">
                单文件独立分享
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300">
                <Sparkles className="h-2.5 w-2.5" />
                免建分组
              </span>
            </div>
            <p className="mt-1 max-w-xl text-xs text-app-muted">
              直接上传任意文件并生成独立下载直链与高清二维码。文本文件可随时开启访客在线协同编辑。
            </p>
          </div>
        </div>
      </div>

      <FileBrowser
        adapter={adapter}
        emptyHint="上传任意单个文件，然后在文件卡片或操作列中点击分享图标生成链接与二维码"
      />
    </div>
  );
}
