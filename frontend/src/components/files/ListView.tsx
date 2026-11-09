import { Folder, MoreHorizontal } from "lucide-react";
import type { TreeItem } from "../../api";
import { formatBytes, formatDate } from "../../lib/format";
import { FileIcon } from "../FileIcon";
import { itemKey } from "./source";

interface Props {
  items: TreeItem[];
  selectedKeys: string[];
  loading: boolean;
  onToggle: (item: TreeItem) => void;
  onToggleAll: () => void;
  onOpen: (item: TreeItem) => void;
  onMenu: (item: TreeItem, position: { x: number; y: number }) => void;
}

export function ListView({ items, selectedKeys, loading, onToggle, onToggleAll, onOpen, onMenu }: Props) {
  const allSelected = items.length > 0 && items.every((item) => selectedKeys.includes(itemKey(item)));
  return (
    <div className="overflow-hidden rounded-xl border border-app-border bg-app-panel">
      <div className="hidden grid-cols-[32px_minmax(0,1fr)_120px_170px_40px] items-center gap-3 border-b border-app-border px-3 py-2 text-xs text-app-muted sm:grid">
        <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="全选" />
        <span>名称</span><span>大小</span><span>修改时间</span><span />
      </div>
      {items.map((item) => (
        <div key={itemKey(item)} className="grid grid-cols-[28px_minmax(0,1fr)_36px] items-center gap-3 border-b border-app-border/70 px-3 py-2.5 last:border-0 hover:bg-app-panel2/60 sm:grid-cols-[32px_minmax(0,1fr)_120px_170px_40px]" onContextMenu={(event) => { event.preventDefault(); onMenu(item, { x: event.clientX, y: event.clientY }); }}>
          <input type="checkbox" checked={selectedKeys.includes(itemKey(item))} onChange={() => onToggle(item)} aria-label={`选择 ${item.name}`} />
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => onOpen(item)}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.type === "folder" ? "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300" : "bg-app-panel2"}`}>
              {item.type === "folder" ? <Folder size={18} /> : <FileIcon file={item} className="h-5 w-5" />}
            </span>
            <span className="min-w-0"><span className="block truncate text-sm">{item.name}</span>{item.type === "folder" && <span className="block text-xs text-app-muted">{item.file_count} 个文件</span>}</span>
          </button>
          <span className="hidden text-xs text-app-muted sm:block">{item.type === "file" ? formatBytes(item.size) : formatBytes(item.total_size)}</span>
          <span className="hidden text-xs text-app-muted sm:block">{formatDate(item.updated_at)}</span>
          <button className="btn-ghost !p-1.5" title="更多操作" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onMenu(item, { x: rect.right - 180, y: rect.bottom + 4 }); }}><MoreHorizontal size={18} /></button>
        </div>
      ))}
      {!items.length && <div className="py-14 text-center text-sm text-app-muted">{loading ? "正在加载..." : "此文件夹为空"}</div>}
    </div>
  );
}