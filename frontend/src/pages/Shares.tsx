import { Copy, Edit3, ExternalLink, Folder, Link2, LockKeyhole, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sharesApi, type ShareUpdateInput, type UnifiedShare } from "../api";
import { publicPath } from "../base";
import { ConfirmDialog } from "../components/files/ConfirmDialog";
import { ShareLinkDialog } from "../components/files/ShareLinkDialog";
import { ShareSettingsDialog } from "../components/files/ShareSettingsDialog";
import { formatDate } from "../lib/format";

type StatusFilter = "all" | "active" | "expired";
type TypeFilter = "all" | "file" | "folder";

function isExpired(share: UnifiedShare): boolean {
  return Boolean(share.expires_at && new Date(share.expires_at.endsWith("Z") ? share.expires_at : `${share.expires_at}Z`).getTime() <= Date.now());
}

function shareLink(token: string): string {
  return `${window.location.origin}${publicPath.share(token)}`;
}

export function Shares() {
  const [items, setItems] = useState<UnifiedShare[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<UnifiedShare | null>(null);
  const [showingLink, setShowingLink] = useState<UnifiedShare | null>(null);
  const [revoking, setRevoking] = useState<UnifiedShare | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await sharesApi.list());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (needle && !item.name.toLocaleLowerCase().includes(needle)) return false;
      if (typeFilter !== "all" && item.target_type !== typeFilter) return false;
      if (statusFilter === "active" && isExpired(item)) return false;
      if (statusFilter === "expired" && !isExpired(item)) return false;
      return true;
    });
  }, [items, query, statusFilter, typeFilter]);

  async function copy(item: UnifiedShare) {
    try {
      await navigator.clipboard.writeText(shareLink(item.token));
      setNotice("分享链接已复制");
    } catch {
      setShowingLink(item);
    }
  }

  async function save(item: UnifiedShare, input: ShareUpdateInput) {
    await sharesApi.update(item.id, input);
    setNotice("分享设置已更新");
    await refresh();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="vault-kicker">访问控制</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">分享管理</h1>
          <p className="mt-1 text-sm text-app-muted">集中查看文件与文件夹链接，修改权限、有效期和访问密码。</p>
        </div>
        <span className="badge">{items.length} 个分享</span>
      </header>

      <section className="card grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
          <input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索分享名称" />
        </label>
        <select className="input sm:w-32" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} aria-label="按类型筛选">
          <option value="all">全部类型</option>
          <option value="file">文件</option>
          <option value="folder">文件夹</option>
        </select>
        <select className="input sm:w-32" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} aria-label="按状态筛选">
          <option value="all">全部状态</option>
          <option value="active">有效</option>
          <option value="expired">已过期</option>
        </select>
      </section>

      {error && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-app-danger">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-300">{notice}</div>}

      <section className="card overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-4 border-b border-app-border px-4 py-3 text-xs font-medium text-app-muted md:grid">
          <span>分享内容</span><span>访问设置</span><span className="text-right">操作</span>
        </div>
        {loading ? <p className="px-4 py-12 text-center text-sm text-app-muted">正在加载分享...</p> : null}
        {!loading && !visible.length ? <p className="px-4 py-12 text-center text-sm text-app-muted">{items.length ? "没有符合筛选条件的分享" : "暂无分享。可在文件页面通过“分享”创建链接。"}</p> : null}
        <div className="divide-y divide-app-border">
          {visible.map((item) => {
            const expired = isExpired(item);
            return (
              <article key={item.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 rounded-xl bg-app-panel2 p-2 text-app-accent">{item.target_type === "folder" ? <Folder size={17} /> : <Link2 size={17} />}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="mt-1 text-xs text-app-muted">{item.target_type === "folder" ? "文件夹" : "文件"} · 创建于 {formatDate(item.created_at)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`badge ${expired ? "!text-app-danger" : ""}`}>{expired ? "已过期" : item.allow_edit ? "可编辑" : "只读"}</span>
                  {item.password_required && <span className="badge"><LockKeyhole size={12} />有密码</span>}
                  <span className="badge">{item.expires_at ? `至 ${formatDate(item.expires_at)}` : "永久有效"}</span>
                </div>
                <div className="flex justify-end gap-1">
                  <button className="btn-ghost btn-icon !p-2" title="复制链接" aria-label={`复制 ${item.name} 的链接`} onClick={() => void copy(item)}><Copy size={16} /></button>
                  <button className="btn-ghost btn-icon !p-2" title="查看二维码" aria-label={`查看 ${item.name} 的二维码`} onClick={() => setShowingLink(item)}><ExternalLink size={16} /></button>
                  <button className="btn-ghost btn-icon !p-2" title="修改分享" aria-label={`修改 ${item.name}`} onClick={() => setEditing(item)}><Edit3 size={16} /></button>
                  <button className="btn-danger btn-icon !p-2" title="撤销分享" aria-label={`撤销 ${item.name}`} onClick={() => setRevoking(item)}><Trash2 size={16} /></button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <ShareSettingsDialog open={editing !== null} share={editing} submitLabel="保存修改" onClose={() => setEditing(null)} onSubmit={async (input) => {
        if (editing) await save(editing, input);
      }} />
      <ShareLinkDialog open={showingLink !== null} share={showingLink} link={showingLink ? shareLink(showingLink.token) : ""} onClose={() => setShowingLink(null)} onCopied={() => setNotice("分享链接已复制")} />
      <ConfirmDialog open={revoking !== null} title={`撤销“${revoking?.name ?? ""}”的分享`} description="撤销后该链接会立即失效，原文件不会被删除。" confirmLabel="撤销分享" onClose={() => setRevoking(null)} onConfirm={async () => {
        if (!revoking) return;
        await sharesApi.remove(revoking.id);
        setRevoking(null);
        setNotice("分享已撤销");
        await refresh();
      }} />
    </div>
  );
}