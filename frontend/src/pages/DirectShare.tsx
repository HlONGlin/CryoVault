import { ArrowLeft, FilePlus2, Snowflake } from "lucide-react";
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
      <div>
        <Link
          to={panelPath("/")}
          className="inline-flex items-center gap-1.5 text-sm text-app-muted transition hover:text-app-text"
        >
          <ArrowLeft className="h-4 w-4" />
          分组管理
        </Link>

        <div className="card mt-3 flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="vault-kicker flex items-center gap-2">
              <Snowflake className="h-3.5 w-3.5" />
              Direct file delivery
            </div>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-wide text-app-text">
              <FilePlus2 className="h-6 w-6 text-app-accent" />
              单文件分享
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-app-muted">
              直接上传单个文件并生成独立下载链接和二维码，无需先创建分组。文本文件可选择允许通过链接编辑。
            </p>
          </div>
          <span className="chip shrink-0 self-start">
            上传后点击卡片上的分享图标
          </span>
        </div>
      </div>

      <FileBrowser
        adapter={adapter}
        emptyHint="上传任意单个文件，然后在文件卡片上点击分享图标生成链接与二维码"
      />
    </div>
  );
}
