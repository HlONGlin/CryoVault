import { Download, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { adminApi, urls, type FileItem } from "../api";
import { FileBrowser, type BrowserAdapter } from "./FileBrowser";

export function DirectFilesSection({
  onFilesChange,
}: {
  onFilesChange: (files: FileItem[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserKey, setBrowserKey] = useState(0);

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

  async function importLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.importDirectLink(url.trim(), name.trim());
      setUrl("");
      setName("");
      setBrowserKey((key) => key + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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

      <form className="grid gap-2 rounded-lg border border-app-border bg-app-panel p-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.45fr)_auto]" onSubmit={importLink}>
        <input className="input min-w-0" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="粘贴文件直链（HTTP / HTTPS）" />
        <input className="input min-w-0" value={name} onChange={(e) => setName(e.target.value)} placeholder="文件名（可选）" />
        <button className="btn-outline" type="submit" disabled={busy || !url.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          从直链导入
        </button>
        {error && <p className="text-xs text-app-danger sm:col-span-3">{error}</p>}
      </form>

      <FileBrowser
        key={browserKey}
        adapter={adapter}
        emptyHint="上传文件后，点击卡片或行尾的分享图标即可生成独立链接与二维码"
        onFilesChange={onFilesChange}
      />
    </section>
  );
}
