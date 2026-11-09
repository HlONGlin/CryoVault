import { Folder, MoreHorizontal } from "lucide-react";
import type { TreeItem } from "../../api";
import { formatBytes } from "../../lib/format";
import { FileIcon } from "../FileIcon";
import { itemKey } from "./source";

interface Props {
  items: TreeItem[];
  selectedKeys: string[];
  loading: boolean;
  onToggle: (item: TreeItem) => void;
  onOpen: (item: TreeItem) => void;
  onMenu: (item: TreeItem, position: { x: number; y: number }) => void;
}

export function GridView({ items, selectedKeys, loading, onToggle, onOpen, onMenu }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((item) => (
        <article key={itemKey(item)} className={`group relative rounded-xl border bg-app-panel p-3 ${selectedKeys.includes(itemKey(item)) ? "border-app-accent ring-2 ring-app-accent/15" : "border-app-border"}`} onContextMenu={(event) => { event.preventDefault(); onMenu(item, { x: event.clientX, y: event.clientY }); }}>
          <input className="absolute left-3 top-3" type="checkbox" checked={selectedKeys.includes(itemKey(item))} onChange={() => onToggle(item)} aria-label={`选择 ${item.name}`} />
          <button className="flex w-full flex-col items-center px-2 pb-2 pt-5 text-center" onClick={() => onOpen(item)}>
            <span className={`mb-3 flex h-14 w-14 items-center justify-center rounded-2xl ${item.type === "folder" ? "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300" : "bg-app-panel2"}`}>
              {item.type === "folder" ? <Folder size={30} /> : <FileIcon file={item} className="h-8 w-8" />}
            </span>
            <span className="line-clamp-2 min-h-10 text-sm leading-5">{item.name}</span>
            <span className="mt-1 text-xs text-app-muted">{item.type === "file" ? formatBytes(item.size) : `${item.file_count} 项`}</span>
          </button>
          <button className="btn-ghost absolute right-1.5 top-1.5 !p-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" title="更多操作" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onMenu(item, { x: rect.right - 180, y: rect.bottom + 4 }); }}><MoreHorizontal size={18} /></button>
        </article>
      ))}
      {!items.length && <div className="col-span-full rounded-xl border border-app-border bg-app-panel py-14 text-center text-sm text-app-muted">{loading ? "正在加载..." : "此文件夹为空"}</div>}
    </div>
  );
}