import { useCallback, useEffect, useState } from "react";
import { Copy, QrCode, Settings2, Trash2 } from "lucide-react";
import { treeApi, type UnifiedShare } from "../api";
import { QrPanel } from "../components/QrPanel";

export function Shares() {
  const [items, setItems] = useState<UnifiedShare[]>([]);
  const [error, setError] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { setItems(await treeApi.shares()); } catch (e) { setError(String(e)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function edit(item: UnifiedShare) {
    const expiry = prompt("有效期（ISO 日期，留空表示永久）", item.expires_at ?? "");
    if (expiry === null) return;
    const password = prompt("设置新密码，留空清除密码，取消则保留现有密码");
    const allowEdit = confirm("允许在线编辑文本文件？");
    try {
      await treeApi.updateShare(item.id, {allow_edit: allowEdit, expires_at: expiry || null,
        ...(password === null ? {} : {password})});
      await refresh();
    } catch (e) { setError(String(e)); }
  }
  return <div className="space-y-4">
    <h1 className="text-xl font-semibold">分享管理</h1>
    {error && <p className="text-sm text-app-danger">{error}</p>}
    <div className="divide-y divide-app-border border-y border-app-border">
      {items.map(item => {
        const url = `${location.origin}/s/${item.token}`;
        return <div key={item.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p>
            <p className="text-xs text-app-muted">{item.target_type === "file" ? "文件" : "文件夹"} · {item.allow_edit ? "可编辑" : "只读"} · {item.password_required ? "有密码" : "无密码"} · {item.expires_at ? new Date(item.expires_at.endsWith("Z") ? item.expires_at : item.expires_at + "Z").toLocaleString() : "永久有效"}</p></div>
          <button className="btn-ghost !p-2" title="复制链接" onClick={() => void navigator.clipboard.writeText(url)}><Copy size={16}/></button>
          <button className="btn-ghost !p-2" title="二维码" onClick={() => setQr(qr === url ? null : url)}><QrCode size={16}/></button>
          <button className="btn-ghost !p-2" title="修改分享" onClick={() => void edit(item)}><Settings2 size={16}/></button>
          <button className="btn-danger !p-2" title="撤销分享" onClick={async () => {if(confirm("撤销此分享？")) {await treeApi.deleteShare(item.id); await refresh();}}}><Trash2 size={16}/></button>
          {qr === url && <div className="basis-full"><QrPanel link={url} name={item.name}/></div>}
        </div>;
      })}
    </div>
    {!items.length && <p className="py-8 text-center text-sm text-app-muted">暂无分享</p>}
  </div>;
}
