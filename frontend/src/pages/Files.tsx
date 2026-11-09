import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { filesApi, sharesApi, type TreeItem } from "../api";
import { panelPath } from "../base";
import { FileBrowser } from "../components/files/FileBrowser";
import type { FileCrumb } from "../components/files/FileBreadcrumbs";
import type { FileBrowseSource } from "../components/files/source";

export function Files() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const current = folderId && /^\d+$/.test(folderId) ? Number(folderId) : null;
  const [breadcrumbs, setBreadcrumbs] = useState<FileCrumb[]>([{ id: null, name: "文件" }]);
  const [pathError, setPathError] = useState("");

  const source = useMemo<FileBrowseSource>(() => ({
    list: ({ folderId: id, page, query, sort, order }) => filesApi.list(id, page, query, sort, order),
    content: (fileId) => filesApi.content(fileId),
    saveContent: (fileId, content, etag) => filesApi.saveContent(fileId, content, etag),
    rawUrl: (fileId) => filesApi.rawUrl(fileId),
    downloadUrl: (fileId) => filesApi.downloadUrl(fileId),
    archive: (items) => filesApi.downloadArchive(items),
    upload: async (files, id, onProgress) => (await filesApi.upload(files, id, onProgress)).results,
    createFolder: (name, parentId) => filesApi.createFolder(name, parentId),
    importLink: (url, id, name) => filesApi.importLink(url, id, name),
    rename: (item, name) => filesApi.rename(item, name),
    move: (item, parentId) => filesApi.move(item, parentId),
    remove: (item) => filesApi.remove(item),
    createShare: (_item: TreeItem, input) => sharesApi.create(input),
  }), []);

  useEffect(() => {
    let active = true;
    async function loadPath() {
      if (current === null) { setBreadcrumbs([{ id: null, name: "文件" }]); setPathError(""); return; }
      try {
        const path: FileCrumb[] = [];
        let id: number | null = current;
        for (let depth = 0; id !== null && depth < 100; depth += 1) {
          const folder = await filesApi.folder(id);
          path.unshift({ id: folder.id, name: folder.name });
          id = folder.parent_id;
        }
        if (active) { setBreadcrumbs([{ id: null, name: "文件" }, ...path]); setPathError(""); }
      } catch (reason) {
        if (active) setPathError(reason instanceof Error ? reason.message : String(reason));
      }
    }
    void loadPath();
    return () => { active = false; };
  }, [current]);

  function goTo(folderIdValue: number | null) {
    navigate(panelPath(folderIdValue === null ? "/files" : `/files/${folderIdValue}`));
  }

  return (
    <div className="space-y-5">
      <header><p className="vault-kicker">文件空间</p><h1 className="mt-1 text-2xl font-bold tracking-tight">我的文件</h1></header>
      {pathError && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-app-danger">{pathError}</p>}
      <FileBrowser source={source} folderId={current} breadcrumbs={breadcrumbs} onNavigate={goTo} emptyLabel="上传文件、新建文件夹，或从外部链接导入内容。" />
    </div>
  );
}