import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { treeApi, type FileItem, type TreeItem, type UnifiedShare } from "../api";
import { TextEditorModal } from "../components/TextEditorModal";
import { MediaPlayerModal } from "../components/MediaPlayerModal";
import { Modal } from "../components/Modal";

type PublicInfo = UnifiedShare & { file: FileItem | null };

export function UnifiedSharePage() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [path, setPath] = useState<{id: number; name: string}[]>([]);
  const [items, setItems] = useState<TreeItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [preview, setPreview] = useState<FileItem | null>(null);
  const base = `/api/public/shares/${encodeURIComponent(token)}/files`;
  const loadInfo = useCallback(async () => {
    try {
      const result = await treeApi.publicInfo(token);
      if (result.password_required && !("target_type" in result)) { setLocked(true); return; }
      setLocked(false); setInfo(result); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [token]);
  useEffect(() => { void loadInfo(); }, [loadInfo]);
  useEffect(() => {
    if (info?.target_type !== "folder") return;
    treeApi.publicList(token, path.length ? path[path.length - 1].id : null, page).then(r => {setItems(r.items); setTotal(r.total);})
      .catch(e => setError(String(e)));
  }, [info, path, token, page]);
  useEffect(() => {setPage(1);}, [path]);
  const load = useCallback((file: FileItem) => treeApi.publicContent(token, file.id), [token]);
  const save = useCallback((file: FileItem, content: string, etag: string) => treeApi.publicSave(token, file.id, content, etag), [token]);
  if (locked) return <form className="mx-auto max-w-sm space-y-4 py-12" onSubmit={async e => {
    e.preventDefault(); try { await treeApi.publicUnlock(token, password); await loadInfo(); }
    catch (err) { setError(String(err)); }
  }}><h1 className="text-lg font-semibold">输入分享密码</h1><input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}/><button className="btn-primary">访问</button>{error && <p>{error}</p>}</form>;
  if (!info) return <p className="py-12 text-center">{error || "正在加载..."}</p>;
  const files: TreeItem[] = info.target_type === "file" && info.file ? [{...info.file, type: "file"}] : items;
  return <div className="space-y-4"><h1 className="text-xl font-semibold">{info.name}</h1>
    {info.target_type === "folder" && <nav className="flex flex-wrap gap-2 text-sm"><button onClick={() => setPath([])}>根目录</button>{path.map((p, i) => <button key={p.id} onClick={() => setPath(path.slice(0, i + 1))}>/ {p.name}</button>)}</nav>}
    {error && <p className="text-red-500">{error}</p>}
    <div className="divide-y divide-app-border border-y border-app-border">{files.map(item => <div key={`${item.type}:${item.id}`} className="flex items-center gap-3 py-3">
      <button className="min-w-0 flex-1 truncate text-left" onClick={() => item.type === "folder" ? setPath([...path, {id: item.id, name: item.name}]) : setPreview(item)}>{item.type === "folder" ? "文件夹 · " : "文件 · "}{item.name}</button>
      {item.type === "file" && <a className="btn-outline" href={`${base}/${item.id}/download`}>下载</a>}
    </div>)}</div>
    {info.target_type === "folder" && <div className="flex justify-end gap-4 text-sm"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>{page}</span><button disabled={page * 100 >= total} onClick={() => setPage(page + 1)}>下一页</button></div>}
    <TextEditorModal file={preview?.kind === "text" ? preview : null} onClose={() => setPreview(null)} load={load} save={info.allow_edit ? save : undefined}/>
    <MediaPlayerModal file={preview && (preview.kind === "video" || preview.kind === "audio") ? preview : null} src={`${base}/${preview?.id}/raw`} downloadUrl={`${base}/${preview?.id}/download`} onClose={() => setPreview(null)}/>
    <Modal open={preview?.kind === "image"} onClose={() => setPreview(null)} title={preview?.name || "预览"}><img className="mx-auto max-h-[70vh] max-w-full" src={`${base}/${preview?.id}/raw`} alt={preview?.name}/></Modal>
    {preview?.kind === "other" && <Modal open onClose={() => setPreview(null)} title={preview.name}><a className="btn-primary" href={`${base}/${preview.id}/download`}>下载文件</a></Modal>}
  </div>;
}
