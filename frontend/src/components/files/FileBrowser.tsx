import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { FileItem, FolderItem, ShareCreateInput, TreeItem, UnifiedShare } from "../../api";
import { useFolderListing } from "../../hooks/useFolderListing";
import { useSelection } from "../../hooks/useSelection";
import { useUpload } from "../../hooks/useUpload";
import { publicPath } from "../../base";
import { MoveDialog } from "../MoveDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { FileActionMenu, type FileAction } from "./FileActionMenu";
import { FileBreadcrumbs, type FileCrumb } from "./FileBreadcrumbs";
import { FileToolbar } from "./FileToolbar";
import { GridView } from "./GridView";
import { ImportDialog } from "./ImportDialog";
import { ListView } from "./ListView";
import { NameDialog } from "./NameDialog";
import { PreviewDialogs } from "./PreviewDialogs";
import { ShareLinkDialog } from "./ShareLinkDialog";
import { ShareSettingsDialog } from "./ShareSettingsDialog";
import type { FileBrowseSource } from "./source";

interface Props {
  source: FileBrowseSource;
  folderId: number | null;
  breadcrumbs: FileCrumb[];
  onNavigate: (folderId: number | null, folder?: FolderItem) => void;
  emptyLabel?: string;
}

type NameDialogState = { mode: "folder" } | { mode: "rename"; item: TreeItem } | null;

export function FileBrowser({ source, folderId, breadcrumbs, onNavigate, emptyLabel = "此文件夹为空" }: Props) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [grid, setGrid] = useState(false);
  const [preview, setPreview] = useState<FileItem | null>(null);
  const [menuItem, setMenuItem] = useState<TreeItem | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [moving, setMoving] = useState<TreeItem | null>(null);
  const [deleting, setDeleting] = useState<TreeItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [shareTarget, setShareTarget] = useState<TreeItem | null>(null);
  const [shareResult, setShareResult] = useState<UnifiedShare | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const listing = useFolderListing({ source, folderId, page, query, sort, order });
  const selection = useSelection(listing.items);
  const upload = useUpload(source, folderId, () => { listing.refresh(); selection.clear(); });
  const pages = Math.max(1, Math.ceil(listing.total / listing.pageSize));

  useEffect(() => {
    setPage(1);
    setQuery("");
    selection.clear();
    setActionError("");
    setNotice("");
  }, [folderId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function openMenu(item: TreeItem, position: { x: number; y: number }) {
    setMenuItem(item);
    setMenuPosition(position);
  }
  function closeMenu() {
    setMenuItem(null);
    setMenuPosition(null);
  }
  function runAction(action: () => Promise<void>) {
    setActionError("");
    void action().catch((reason: unknown) => {
      setActionError(reason instanceof Error ? reason.message : String(reason));
    });
  }
  function openItem(item: TreeItem) {
    if (item.type === "folder") onNavigate(item.id, item);
    else setPreview(item);
  }
  function handleMenuAction(item: TreeItem, action: FileAction) {
    closeMenu();
    if (action === "open") openItem(item);
    if (action === "download") {
      runAction(async () => {
        if (item.type === "file") window.open(source.downloadUrl(item.id), "_blank", "noopener,noreferrer");
        else if (source.archive) await source.archive([item]);
      });
    }
    if (action === "share") setShareTarget(item);
    if (action === "rename") setNameDialog({ mode: "rename", item });
    if (action === "move") setMoving(item);
    if (action === "delete") setDeleting([item]);
  }
  async function createShare(input: ShareCreateInput) {
    if (!shareTarget || !source.createShare) return;
    const share = await source.createShare(shareTarget, input);
    setShareResult(share);
    setShareTarget(null);
    setNotice("分享已创建");
    try { await navigator.clipboard.writeText(`${window.location.origin}${publicPath.share(share.token)}`); } catch { /* shown in dialog */ }
    listing.refresh();
  }

  return (
    <section
      className="relative space-y-4"
      onDragOver={(event) => { if (source.upload) { event.preventDefault(); setDropActive(true); } }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false); }}
      onDrop={(event) => { if (!source.upload) return; event.preventDefault(); setDropActive(false); void upload.start(event.dataTransfer.files); }}
    >
      <FileBreadcrumbs items={breadcrumbs} onNavigate={onNavigate} />
      <FileToolbar
        query={query} sort={sort} order={order} grid={grid}
        selectedCount={selection.selectedItems.length}
        canUpload={Boolean(source.upload)} canCreateFolder={Boolean(source.createFolder)} canImport={Boolean(source.importLink)}
        canArchive={Boolean(source.archive)} canDelete={Boolean(source.remove)}
        uploadBusy={upload.busy} uploadProgress={upload.progress}
        onQueryChange={(value) => { setQuery(value); setPage(1); selection.clear(); }}
        onSortChange={(value) => { setSort(value); setPage(1); }}
        onOrderChange={(value) => { setOrder(value); setPage(1); }}
        onGridChange={setGrid} onUpload={(files) => void upload.start(files)}
        onNewFolder={() => setNameDialog({ mode: "folder" })} onImport={() => setImporting(true)}
        onArchiveSelected={() => runAction(async () => { if (source.archive) await source.archive(selection.selectedItems); })}
        onDeleteSelected={() => setDeleting(selection.selectedItems)} onClearSelection={selection.clear}
      />
      {(actionError || listing.error || upload.error) && <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-app-danger"><AlertCircle size={16} className="mt-0.5 shrink-0" />{actionError || listing.error || upload.error}</div>}
      {notice && <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-300"><CheckCircle2 size={16} />{notice}</div>}
      {grid ? <GridView items={listing.items} selectedKeys={selection.selectedKeys} loading={listing.loading} onToggle={selection.toggle} onOpen={openItem} onMenu={openMenu} />
        : <ListView items={listing.items} selectedKeys={selection.selectedKeys} loading={listing.loading} onToggle={selection.toggle} onToggleAll={selection.toggleAll} onOpen={openItem} onMenu={openMenu} />}
      {!listing.loading && !listing.items.length && emptyLabel !== "此文件夹为空" && <p className="-mt-2 text-center text-xs text-app-muted">{emptyLabel}</p>}
      <div className="flex items-center justify-between text-sm text-app-muted"><span>共 {listing.total} 项</span><div className="flex items-center gap-3"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</button></div></div>
      {dropActive && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-app-accent bg-app-bg/90 text-sm font-medium text-app-accent">松开即可上传到当前文件夹</div>}

      <FileActionMenu item={menuItem} position={menuPosition} canShare={Boolean(source.createShare)} canArchive={Boolean(source.archive)} canRename={Boolean(source.rename)} canMove={Boolean(source.move)} canDelete={Boolean(source.remove)} onAction={handleMenuAction} onClose={closeMenu} />
      <PreviewDialogs file={preview} source={source} canEdit={Boolean(source.saveContent)} onClose={() => setPreview(null)} />
      <NameDialog
        open={nameDialog !== null}
        title={nameDialog?.mode === "rename" ? "重命名" : "新建文件夹"}
        label={nameDialog?.mode === "rename" ? "新名称" : "文件夹名称"}
        initialValue={nameDialog?.mode === "rename" ? nameDialog.item.name : ""}
        onClose={() => setNameDialog(null)}
        onSubmit={async (value) => {
          if (nameDialog?.mode === "rename" && source.rename) await source.rename(nameDialog.item, value);
          if (nameDialog?.mode === "folder" && source.createFolder) await source.createFolder(value, folderId);
          listing.refresh();
        }}
      />
      <ConfirmDialog
        open={deleting.length > 0}
        title={deleting.length === 1 ? `删除“${deleting[0]?.name ?? ""}”` : `删除 ${deleting.length} 项`}
        description="删除后会从服务器永久移除文件或文件夹及其内容，此操作无法撤销。"
        confirmLabel="永久删除"
        onClose={() => setDeleting([])}
        onConfirm={async () => {
          if (!source.remove) return;
          const results = await Promise.allSettled(deleting.map((item) => source.remove!(item)));
          const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
          selection.clear();
          setDeleting([]);
          listing.refresh();
          if (failed) throw failed.reason;
        }}
      />
      <MoveDialog item={moving} onClose={() => setMoving(null)} list={async (id, targetPage) => source.list({ folderId: id, page: targetPage, query: "", sort: "name", order: "asc" })} onMove={async (parentId) => { if (!moving || !source.move) return; await source.move(moving, parentId); setMoving(null); listing.refresh(); }} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} onImport={async (url, name) => { if (!source.importLink) return; await source.importLink(url, folderId, name); listing.refresh(); }} />
      <ShareSettingsDialog open={Boolean(shareTarget)} submitLabel="创建分享" onClose={() => setShareTarget(null)} onSubmit={async (input) => {
        if (!shareTarget) return;
        await createShare({ ...input, target_type: shareTarget.type, ...(shareTarget.type === "file" ? { file_id: shareTarget.id } : { folder_id: shareTarget.id }) });
      }} />
      <ShareLinkDialog open={Boolean(shareResult)} share={shareResult} link={shareResult ? `${window.location.origin}${publicPath.share(shareResult.token)}` : ""} onClose={() => setShareResult(null)} onCopied={() => setNotice("分享链接已复制")} />
    </section>
  );
}