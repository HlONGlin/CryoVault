import { Folder } from "lucide-react";
import { useEffect, useState } from "react";
import type { FolderItem, Listing, TreeItem } from "../api";
import { Modal } from "./Modal";

interface Props {
  item: TreeItem | null;
  onClose: () => void;
  onMove: (folder: number | null) => Promise<void>;
  list: (folderId: number | null, page: number) => Promise<Listing>;
}

export function MoveDialog({ item, onClose, onMove, list }: Props) {
  const [path, setPath] = useState<FolderItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = path.length ? path[path.length - 1].id : null;

  useEffect(() => {
    if (!item) return;
    setPath([]);
    setError("");
  }, [item]);

  useEffect(() => {
    if (!item) return;
    let active = true;
    async function load() {
      try {
        const all: FolderItem[] = [];
        for (let page = 1; ; page += 1) {
          const result = await list(current, page);
          all.push(...result.items.filter((entry): entry is FolderItem => entry.type === "folder" && !(item?.type === "folder" && entry.id === item.id)));
          if (page * result.page_size >= result.total) break;
        }
        if (active) { setFolders(all); setError(""); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      }
    }
    void load();
    return () => { active = false; };
  }, [current, item, list]);

  async function confirmMove() {
    setBusy(true);
    setError("");
    try {
      await onMove(current);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={Boolean(item)} onClose={onClose} title={`移动 ${item?.name ?? ""}`} footer={
      <>
        <button className="btn-outline" onClick={onClose}>取消</button>
        <button className="btn-primary" disabled={busy} onClick={() => void confirmMove()}>{busy ? "移动中..." : "移动到此处"}</button>
      </>
    }>
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        <button className="rounded-lg px-2 py-1 hover:bg-app-panel2" onClick={() => setPath([])}>根目录</button>
        {path.map((folder, index) => <button key={folder.id} className="rounded-lg px-2 py-1 hover:bg-app-panel2" onClick={() => setPath(path.slice(0, index + 1))}>/ {folder.name}</button>)}
      </nav>
      {folders.map((folder) => <button key={folder.id} className="flex w-full items-center gap-2 border-b border-app-border py-3 text-left text-sm hover:bg-app-panel2/50" onClick={() => setPath([...path, folder])}><Folder size={16} className="text-amber-500" />{folder.name}</button>)}
      {!folders.length && <p className="py-6 text-center text-sm text-app-muted">没有可用的子文件夹</p>}
      {error && <p className="mt-3 text-sm text-app-danger">{error}</p>}
    </Modal>
  );
}