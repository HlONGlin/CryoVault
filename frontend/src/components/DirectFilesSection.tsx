import { useMemo } from "react";

import { adminApi, urls, type FileItem } from "../api";
import { FileBrowser, type BrowserAdapter } from "./FileBrowser";

export function DirectFilesSection({
  onFilesChange,
}: {
  onFilesChange: (files: FileItem[]) => void;
}) {
  const adapter = useMemo<BrowserAdapter>(
    () => ({
      list: async () => (await adminApi.directInfo()).files,
      rawUrl: (file) => urls.adminRaw(file.id),
      downloadUrl: (file) => urls.adminDownload(file.id),
      getContent: (file) => adminApi.getContent(file.id),
      saveContent: (file, content) => adminApi.saveContent(file.id, content),
      remove: (file) => adminApi.deleteFile(file.id),
      downloadArchive: (files) => adminApi.downloadArchive(files.map((file) => file.id)),
      rename: (file, newName) => adminApi.renameFile(file.id, newName),
      upload: (files, onProgress, signal) =>
        adminApi.uploadDirectFiles(files, onProgress, signal),
      getShare: (file) => adminApi.getFileShare(file.id),
      createShare: (file, allowEdit) =>
        adminApi.createFileShare(file.id, allowEdit),
      revokeShare: (file) => adminApi.deleteFileShare(file.id),
    }),
    []
  );

  return (
    <section id="single-files" className="scroll-mt-20 space-y-4 pt-2">
      <div className="border-b border-app-border pb-3">
        <div>
          <h2 className="text-base font-bold text-app-text">直接上传</h2>
          <p className="mt-1 text-xs text-app-muted">
            无需创建分组，上传文件后即可生成免登录下载与二维码链接。
          </p>
        </div>
      </div>

      <FileBrowser
        adapter={adapter}
        emptyHint="上传文件后，点击卡片或行尾的分享图标即可生成独立链接与二维码"
        onFilesChange={onFilesChange}
      />
    </section>
  );
}
