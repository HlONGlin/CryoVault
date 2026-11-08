import { Folder, FolderPlus, Grid2X2, List, MoreHorizontal, Search, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { adminApi, treeApi, type FileItem, type FolderItem, type TreeItem } from "../api";
import { panelPath } from "../base";
import { FileIcon } from "../components/FileIcon";
import { formatBytes } from "../lib/format";
import { TextEditorModal } from "../components/TextEditorModal";
import { MediaPlayerModal } from "../components/MediaPlayerModal";
import { Modal } from "../components/Modal";
import { MoveDialog } from "../components/MoveDialog";

export function Files() {
  const { folderId } = useParams();
  const current = folderId ? Number(folderId) : null;
  const navigate = useNavigate();
  const upload = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<TreeItem[]>([]);
  const [crumbs, setCrumbs] = useState<FolderItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const [grid, setGrid] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [preview, setPreview] = useState<FileItem | null>(null);
  const [moving, setMoving] = useState<TreeItem | null>(null);
  const loadText = useCallback((file: FileItem) => adminApi.getContent(file.id), []);
  const saveText = useCallback((file: FileItem, content: string, etag: string) => adminApi.saveContent(file.id, content, etag), []);
  const key = (item: TreeItem) => `${item.type}:${item.id}`;
  const refresh = useCallback(async () => {
    try {
      const listing = await treeApi.list(current, page, q, sort);
      setItems(listing.items); setTotal(listing.total); setError("");
      const path: FolderItem[] = [];
      let id = current;
      while (id !== null && path.length < 100) {
        const folder = await treeApi.folder(id);
        path.unshift(folder); id = folder.parent_id;
      }
      setCrumbs(path);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [current, page, q, sort]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setPage(1); setSelected([]); }, [current]);
  async function uploadFiles(files: FileList | File[]) {
    try {
      const result = await treeApi.upload(Array.from(files), current);
      const errors = result.results.filter(r => r.error).map(r => `${r.name}: ${r.error}`);
      await refresh(); if (errors.length) setError(errors.join("；"));
    } catch (e) { setError(String(e)); }
  }
  async function action(item: TreeItem, kind: string) {
    setMenu(null);
    try {
      if (kind === "open" && item.type === "folder") navigate(panelPath(`/files/${item.id}`));
      if (kind === "open" && item.type === "file") setPreview(item);
      if (kind === "download" && item.type === "file") window.open(`/api/files/${item.id}/download`, "_blank");
      if (kind === "download" && item.type === "folder") await treeApi.archive([item]);
      if (kind === "rename") {
        const name = window.prompt("重命名", item.name);
        if (name && name !== item.name) await treeApi.update(item, {name});
      }
      if (kind === "move") {
        setMoving(item);
      }
      if (kind === "share") {
        const share = await treeApi.createShare(item);
        const url = `${location.origin}/s/${share.token}`;
        try { await navigator.clipboard.writeText(url); alert("分享链接已复制"); }
        catch { window.prompt("复制分享链接", url); }
      }
      if (kind === "delete" && confirm(`删除“${item.name}”及其内容？`)) await treeApi.remove(item);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  return <div className="space-y-4" onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault(); void uploadFiles(e.dataTransfer.files);}}>
    <nav className="flex flex-wrap gap-2 text-sm"><Link to={panelPath("/files")} className="text-app-accent">文件</Link>{crumbs.map(c => <span key={c.id}>/ <Link to={panelPath(`/files/${c.id}`)}>{c.name}</Link></span>)}</nav>
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-primary" onClick={() => upload.current?.click()}><Upload size={16}/>上传</button>
      <input ref={upload} type="file" multiple className="hidden" onChange={e => {if (e.target.files) void uploadFiles(e.target.files); e.target.value = "";}}/>
      <button className="btn-outline" onClick={async () => {const name = prompt("文件夹名称"); if (name) {try {await treeApi.createFolder(name, current); await refresh();} catch(e) {setError(String(e));}}}}><FolderPlus size={16}/>新建文件夹</button>
      <button className="btn-outline" onClick={async () => {const url = prompt("文件链接"); if (url) {try {await treeApi.importLink(url, current); await refresh();} catch(e) {setError(String(e));}}}}>从链接导入</button>
      <label className="flex items-center gap-2 rounded border border-app-border px-3"><Search size={16}/><input className="bg-transparent py-2 text-sm outline-none" placeholder="搜索" value={q} onChange={e => {setQ(e.target.value);setPage(1);}}/></label>
      <select className="input !w-auto" value={sort} onChange={e => setSort(e.target.value)}><option value="name">名称</option><option value="updated_at">修改时间</option><option value="size">大小</option></select>
      <button className="btn-ghost" title={grid ? "列表视图" : "网格视图"} onClick={() => setGrid(!grid)}>{grid ? <List size={18}/> : <Grid2X2 size={18}/>}</button>
      {selected.length > 0 && <button className="btn-danger" onClick={async () => {if (confirm(`删除选中的 ${selected.length} 项？`)) {for (const item of items.filter(i => selected.includes(key(i)))) await treeApi.remove(item); setSelected([]); await refresh();}}}>删除所选</button>}
      {selected.length > 0 && <button className="btn-outline" onClick={() => void treeApi.archive(items.filter(i => selected.includes(key(i)))).catch(e => setError(String(e)))}>下载所选</button>}
    </div>
    {error && <p className="text-sm text-app-danger">{error}</p>}
    <div className={grid ? "grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" : "divide-y divide-app-border border-y border-app-border"}>
      {items.map(item => <div key={key(item)} onContextMenu={e => {e.preventDefault();setMenu(key(item));}} className={`relative flex items-center gap-3 p-3 hover:bg-app-panel2 ${grid ? "min-h-24 border border-app-border" : ""}`}>
        <input type="checkbox" checked={selected.includes(key(item))} onChange={e => setSelected(e.target.checked ? [...selected, key(item)] : selected.filter(x => x !== key(item)))}/>
        {item.type === "folder" ? <Folder size={23} className="text-amber-500 shrink-0"/> : <FileIcon file={item} />}
        <button className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => void action(item, "open")}>{item.name}</button>
        {!grid && item.type === "file" && <span className="text-xs text-app-muted">{formatBytes(item.size)}</span>}
        <button className="btn-ghost !p-1" title="更多操作" onClick={() => setMenu(menu === key(item) ? null : key(item))}><MoreHorizontal size={18}/></button>
        {menu === key(item) && <div className="absolute right-2 top-10 z-20 w-36 border border-app-border bg-app-panel shadow-lg">{["open","download","share","rename","move","delete"].map(a => <button key={a} className="block w-full px-3 py-2 text-left text-sm hover:bg-app-panel2" onClick={() => void action(item,a)}>{({open:"打开",download:"下载",share:"分享",rename:"重命名",move:"移动到",delete:"删除"} as Record<string,string>)[a]}</button>)}</div>}
      </div>)}
    </div>
    {!items.length && <div className="py-12 text-center text-sm text-app-muted">此文件夹为空</div>}
    <div className="flex justify-between text-sm text-app-muted"><span>共 {total} 项</span><div className="flex gap-3"><button disabled={page <= 1} onClick={() => setPage(page-1)}>上一页</button><span>{page}</span><button disabled={page * 100 >= total} onClick={() => setPage(page+1)}>下一页</button></div></div>
    <TextEditorModal file={preview?.kind === "text" ? preview : null} onClose={() => setPreview(null)} load={loadText} save={saveText}/>
    <MediaPlayerModal file={preview && (preview.kind === "video" || preview.kind === "audio") ? preview : null} src={`/api/files/${preview?.id}/raw`} downloadUrl={`/api/files/${preview?.id}/download`} onClose={() => setPreview(null)}/>
    <Modal open={preview?.kind === "image"} onClose={() => setPreview(null)} title={preview?.name || "预览"}><img className="mx-auto max-h-[70vh] max-w-full" src={`/api/files/${preview?.id}/raw`} alt={preview?.name}/></Modal>
    {preview?.kind === "other" && <Modal open onClose={() => setPreview(null)} title={preview.name}><a className="btn-primary" href={`/api/files/${preview.id}/download`}>下载文件</a></Modal>}
    <MoveDialog item={moving} onClose={() => setMoving(null)} onMove={async id => {if (!moving) return; await treeApi.update(moving, moving.type === "folder" ? {parent_id: id} : {folder_id: id}); setMoving(null); await refresh();}}/>
  </div>;
}
