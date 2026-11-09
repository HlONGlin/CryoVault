import { Archive, ArrowDownAZ, ArrowUpAZ, FolderPlus, Grid2X2, Link2, List, Search, Trash2, Upload, X } from "lucide-react";
import { useRef } from "react";

interface Props {
  query: string;
  sort: string;
  order: "asc" | "desc";
  grid: boolean;
  selectedCount: number;
  canUpload: boolean;
  canCreateFolder: boolean;
  canImport: boolean;
  canArchive: boolean;
  canDelete: boolean;
  uploadBusy: boolean;
  uploadProgress: number;
  onQueryChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onOrderChange: (value: "asc" | "desc") => void;
  onGridChange: (value: boolean) => void;
  onUpload: (files: FileList) => void;
  onNewFolder: () => void;
  onImport: () => void;
  onArchiveSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
}

export function FileToolbar(props: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {props.canUpload && <>
          <button className="btn-primary" onClick={() => input.current?.click()} disabled={props.uploadBusy}><Upload size={16} />{props.uploadBusy ? `${props.uploadProgress}%` : "上传"}</button>
          <input ref={input} type="file" multiple className="hidden" onChange={(event) => { if (event.target.files) props.onUpload(event.target.files); event.target.value = ""; }} />
        </>}
        {props.canCreateFolder && <button className="btn-outline" onClick={props.onNewFolder}><FolderPlus size={16} />新建文件夹</button>}
        {props.canImport && <button className="btn-outline" onClick={props.onImport}><Link2 size={16} />从链接导入</button>}
        <div className="relative min-w-40 flex-1 sm:min-w-52 sm:max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" />
          <input className="input !pl-9" value={props.query} placeholder="搜索当前文件夹" onChange={(event) => props.onQueryChange(event.target.value)} />
        </div>
        <select className="input !w-auto" aria-label="排序字段" value={props.sort} onChange={(event) => props.onSortChange(event.target.value)}>
          <option value="name">名称</option><option value="updated_at">修改时间</option><option value="size">大小</option>
        </select>
        <button className="btn-ghost btn-icon !p-2" title={props.order === "asc" ? "升序" : "降序"} onClick={() => props.onOrderChange(props.order === "asc" ? "desc" : "asc")}>{props.order === "asc" ? <ArrowDownAZ size={18} /> : <ArrowUpAZ size={18} />}</button>
        <div className="flex rounded-xl border border-app-border bg-app-panel2 p-0.5">
          <button className={`view-toggle-btn ${!props.grid ? "active" : ""}`} title="列表视图" onClick={() => props.onGridChange(false)}><List size={18} /></button>
          <button className={`view-toggle-btn ${props.grid ? "active" : ""}`} title="网格视图" onClick={() => props.onGridChange(true)}><Grid2X2 size={18} /></button>
        </div>
      </div>
      {props.selectedCount > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-app-border bg-app-panel2/60 px-3 py-2 text-sm">
        <span className="mr-auto text-app-muted">已选择 {props.selectedCount} 项</span>
        {props.canArchive && <button className="btn-outline" onClick={props.onArchiveSelected}><Archive size={15} />打包下载</button>}
        {props.canDelete && <button className="btn-danger" onClick={props.onDeleteSelected}><Trash2 size={15} />删除</button>}
        <button className="btn-ghost !p-2" title="取消选择" onClick={props.onClearSelection}><X size={16} /></button>
      </div>}
    </div>
  );
}