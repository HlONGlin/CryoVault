import { useEffect, useState } from "react";
import { Folder } from "lucide-react";
import { treeApi, type FolderItem, type TreeItem } from "../api";
import { Modal } from "./Modal";

export function MoveDialog({item, onClose, onMove}: {item: TreeItem | null; onClose: () => void; onMove: (folder: number | null) => Promise<void>}) {
  const [path, setPath] = useState<FolderItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [error, setError] = useState("");
  const current = path.length ? path[path.length - 1].id : null;
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    async function load() {
      try {
        const all: FolderItem[] = [];
        let page = 1;
        for (;;) {
          const result = await treeApi.list(current, page);
          all.push(...result.items.filter((entry): entry is FolderItem => entry.type === "folder" && !(item?.type === "folder" && entry.id === item.id)));
          if (page * result.page_size >= result.total) break;
          page++;
        }
        if (!cancelled) setFolders(all);
      } catch (e) { if (!cancelled) setError(String(e)); }
    }
    void load();
    return () => {cancelled = true;};
  }, [current, item]);
  useEffect(() => {setPath([]); setError("");}, [item]);
  return <Modal open={Boolean(item)} onClose={onClose} title={`移动 ${item?.name ?? ""}`} footer={<button className="btn-primary" onClick={() => void onMove(current).catch(e => setError(String(e)))}>移动到此处</button>}>
    <nav className="mb-4 flex flex-wrap gap-2 text-sm"><button onClick={() => setPath([])}>根目录</button>{path.map((folder, index) => <button key={folder.id} onClick={() => setPath(path.slice(0, index + 1))}>/ {folder.name}</button>)}</nav>
    {folders.map(folder => <button key={folder.id} className="flex w-full items-center gap-2 border-b border-app-border py-3 text-left text-sm" onClick={() => setPath([...path, folder])}><Folder size={16}/>{folder.name}</button>)}
    {!folders.length && <p className="py-6 text-sm text-app-muted">没有子文件夹</p>}{error && <p className="text-sm text-red-500">{error}</p>}
  </Modal>;
}
