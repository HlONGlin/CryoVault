import clsx from "clsx";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Eye,
  File as FileGlyph,
  FileText,
  Film,
  Image,
  LayoutGrid,
  List,
  Loader2,
  Music,
  Pencil,
  RefreshCw,
  Search,
  Share2,
  TextCursorInput,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

import type { FileItem, FileKind, FileShareInfo, TextContent } from "../api";
import { formatBytes, formatDate } from "../lib/format";
import { useTheme } from "../theme";
import { FileIcon, getFileVisuals } from "./FileIcon";
import { FileShareDialog } from "./FileShareDialog";
import { MediaPlayerModal } from "./MediaPlayerModal";
import { Modal } from "./Modal";

const TextEditorModal = lazy(() =>
  import("./TextEditorModal").then((m) => ({ default: m.TextEditorModal }))
);

export interface BrowserAdapter {
  list: () => Promise<FileItem[]>;
  rawUrl: (file: FileItem) => string;
  downloadUrl: (file: FileItem) => string;
  getContent: (file: FileItem) => Promise<TextContent>;
  saveContent?: (file: FileItem, content: string) => Promise<unknown>;
  remove?: (file: FileItem) => Promise<unknown>;
  rename?: (file: FileItem, name: string) => Promise<unknown>;
  upload?: (
    files: File[],
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ) => Promise<unknown>;
  downloadArchive?: (files: FileItem[]) => Promise<Blob>;
  getShare?: (file: FileItem) => Promise<FileShareInfo | null>;
  createShare?: (file: FileItem, allowEdit: boolean) => Promise<FileShareInfo>;
  revokeShare?: (file: FileItem) => Promise<void>;
}

type Filter = "all" | FileKind;
type ViewMode = "grid" | "list";
type SortField = "name" | "size" | "updated_at";
type SortOrder = "asc" | "desc";

const FILTERS: { key: Filter; label: string; icon: ReactNode }[] = [
  { key: "all", label: "全部", icon: null },
  { key: "text", label: "文本", icon: <FileText className="h-3.5 w-3.5" /> },
  { key: "image", label: "图片", icon: <Image className="h-3.5 w-3.5" /> },
  { key: "video", label: "视频", icon: <Film className="h-3.5 w-3.5" /> },
  { key: "audio", label: "音频", icon: <Music className="h-3.5 w-3.5" /> },
  { key: "other", label: "其他", icon: <FileGlyph className="h-3.5 w-3.5" /> },
];

export function FileBrowser({
  adapter,
  emptyHint = "暂无文件",
  onFilesChange,
}: {
  adapter: BrowserAdapter;
  emptyHint?: string;
  onFilesChange?: (files: FileItem[]) => void;
}) {
  const { theme } = useTheme();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [dragActive, setDragActive] = useState(false);

  // View mode: Grid vs List (Cloudreve style)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem("cryovault.viewMode");
      return saved === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });

  // Sorting
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [editing, setEditing] = useState<FileItem | null>(null);
  const [playing, setPlaying] = useState<FileItem | null>(null);
  const [lightboxFile, setLightboxFile] = useState<FileItem | null>(null);
  const [renaming, setRenaming] = useState<FileItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sharing, setSharing] = useState<FileItem | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("cryovault.viewMode", mode);
    } catch {
      /* ignore */
    }
  };

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(field === "updated_at" ? "desc" : "asc");
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFiles(await adapter.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [adapter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    onFilesChange?.(files);
  }, [files, onFilesChange]);

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set(
        [...current].filter((id) => files.some((file) => file.id === id))
      );
      return next.size === current.size ? current : next;
    });
  }, [files]);

  const counts = useMemo(() => {
    const base: Record<Filter, number> = {
      all: files.length,
      text: 0,
      image: 0,
      video: 0,
      audio: 0,
      other: 0,
    };
    files.forEach((f) => {
      if (f.kind in base) {
        base[f.kind] += 1;
      } else {
        base.other += 1;
      }
    });
    return base;
  }, [files]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter(
      (f) =>
        (filter === "all" || f.kind === filter) &&
        (!q || f.name.toLowerCase().includes(q))
    );
  }, [files, filter, query]);

  const sortedFiles = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") {
        cmp = a.name.localeCompare(b.name, "zh-CN");
      } else if (sortField === "size") {
        cmp = a.size - b.size;
      } else if (sortField === "updated_at") {
        cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortOrder]);

  const images = useMemo(
    () => sortedFiles.filter((f) => f.kind === "image"),
    [sortedFiles]
  );
  const lightboxIndex = lightboxFile
    ? Math.max(0, images.findIndex((f) => f.id === lightboxFile.id))
    : 0;

  function open(file: FileItem) {
    if (file.kind === "text") setEditing(file);
    else if (file.kind === "image") setLightboxFile(file);
    else if (file.kind === "video" || file.kind === "audio") setPlaying(file);
    else window.open(adapter.downloadUrl(file), "_blank");
  }

  async function handleUpload(fileList: FileList | null) {
    if (!adapter.upload || !fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    try {
      await adapter.upload(
        Array.from(fileList),
        (percent) => setUploadProgress(percent),
        controller.signal
      );
      await refresh();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      uploadAbortRef.current = null;
      setUploading(false);
      setUploadProgress(0);
    }
  }

  function cancelUpload() {
    uploadAbortRef.current?.abort();
  }

  async function confirmDelete(file: FileItem) {
    if (!adapter.remove) return;
    if (!window.confirm(`确定删除「${file.name}」？此操作不可撤销。`)) return;
    try {
      await adapter.remove(file);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function startRename(file: FileItem) {
    setRenaming(file);
    setRenameValue(file.name);
  }

  async function submitRename() {
    if (!adapter.rename || !renaming) return;
    const name = renameValue.trim();
    if (!name || name === renaming.name) {
      setRenaming(null);
      return;
    }
    try {
      const updated = await adapter.rename(renaming, name);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === renaming.id ? { ...f, ...(updated as object) } : f
        )
      );
      setRenaming(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function toggleSelection(fileId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = sortedFiles.every((file) => next.has(file.id));
      sortedFiles.forEach((file) => {
        if (allSelected) next.delete(file.id);
        else next.add(file.id);
      });
      return next;
    });
  }

  async function deleteSelected() {
    if (!adapter.remove || selectedIds.size === 0) return;
    const selected = files.filter((file) => selectedIds.has(file.id));
    if (
      !window.confirm(
        `确定删除选中的 ${selected.length} 个文件？此操作不可撤销。`
      )
    )
      return;

    setBatchDeleting(true);
    setError(null);
    try {
      for (const file of selected) await adapter.remove(file);
      const deleted = new Set(selected.map((file) => file.id));
      setFiles((current) => current.filter((file) => !deleted.has(file.id)));
      setSelectedIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchDeleting(false);
    }
  }

  async function downloadSelected() {
    if (!adapter.downloadArchive || selectedIds.size === 0) return;
    const selected = files.filter((file) => selectedIds.has(file.id));
    setBatchDownloading(true);
    setError(null);
    try {
      const blob = await adapter.downloadArchive(selected);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "cryovault-files.zip";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Action Bar (Cloudreve Style Toolbar) */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-app-border bg-app-panel p-2.5 shadow-sm sm:gap-3 sm:p-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Category Filter Pills */}
        <div className="-mx-0.5 flex items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5 scrollbar-none sm:flex-wrap sm:overflow-visible sm:pb-0">
          {FILTERS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={clsx(
                "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all sm:px-3",
                filter === key
                  ? "bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-500/20 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-400/30"
                  : "text-app-muted hover:bg-app-panel2 hover:text-app-text"
              )}
            >
              {icon}
              <span>{label}</span>
              <span
                className={clsx(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                  filter === key
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200"
                    : "bg-app-panel2 text-app-faint"
                )}
              >
                {counts[key]}
              </span>
            </button>
          ))}
          {adapter.remove && sortedFiles.length > 0 && (
            <label className="ml-1 inline-flex shrink-0 cursor-pointer items-center gap-1.5 border-l border-app-border pl-2 text-xs text-app-muted">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)] sm:h-3.5 sm:w-3.5"
                checked={
                  sortedFiles.length > 0 &&
                  sortedFiles.every((file) => selectedIds.has(file.id))
                }
                onChange={toggleVisibleSelection}
                aria-label="选择当前显示的文件"
              />
              全选
            </label>
          )}
        </div>

        {/* Search, View Mode Toggle, Refresh & Upload */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {selectedIds.size > 0 && adapter.remove && (
            <>
              <span className="text-xs text-app-muted">已选 {selectedIds.size} 个</span>
              <button
                className="btn-danger h-9 px-3 text-xs"
                onClick={() => void deleteSelected()}
                disabled={batchDeleting}
              >
                {batchDeleting ? "删除中..." : "删除选中"}
              </button>
            </>
          )}
          {selectedIds.size > 0 && adapter.downloadArchive && (
            <button
              className="btn-outline h-9 px-3 text-xs"
              onClick={() => void downloadSelected()}
              disabled={batchDownloading}
            >
              {batchDownloading ? "打包中..." : "下载选中"}
            </button>
          )}
          {/* Search Box */}
          <div className="relative order-first min-w-0 flex-1 basis-full sm:order-none sm:w-56 sm:basis-auto sm:flex-initial">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
            <input
              className="input h-9 pl-9 pr-8 text-xs"
              placeholder="搜索当前文件..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-app-faint hover:text-app-text"
                onClick={() => setQuery("")}
                title="清除"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* View Mode Toggle (Grid / List) */}
          <div className="flex shrink-0 items-center rounded-xl border border-app-border bg-app-panel2 p-0.5">
            <button
              className={clsx(
                "view-toggle-btn",
                viewMode === "grid" && "active font-medium"
              )}
              onClick={() => handleSetViewMode("grid")}
              title="网格视图"
              aria-label="网格视图"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              className={clsx(
                "view-toggle-btn",
                viewMode === "list" && "active font-medium"
              )}
              onClick={() => handleSetViewMode("list")}
              title="列表视图"
              aria-label="列表视图"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Refresh Button */}
          <button
            className="btn-outline h-9 w-9 shrink-0 p-0"
            onClick={refresh}
            aria-label="刷新"
            title="刷新"
          >
            <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
          </button>

          {/* Upload Button */}
          {adapter.upload && (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  void handleUpload(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                className="btn-primary h-9 flex-1 px-3.5 text-xs font-semibold sm:flex-none"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="h-3.5 w-3.5" />
                )}
                <span>{uploading ? `上传 ${uploadProgress}%` : "上传文件"}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {uploading && (
        <div className="flex items-center gap-3 rounded-xl border border-app-border bg-app-panel2 px-3 py-2.5">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-app-panel3">
            <div
              className="h-full rounded-full bg-app-accent transition-[width] duration-150"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className="shrink-0 text-xs text-app-muted">{uploadProgress}%</span>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={cancelUpload}>
            取消
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-app-danger">
          {error}
        </div>
      )}

      {/* Main Drag-and-Drop Area & Files Presentation */}
      <div
        onDragOver={(e) => {
          if (!adapter.upload) return;
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          if (!adapter.upload) return;
          e.preventDefault();
          setDragActive(false);
          void handleUpload(e.dataTransfer.files);
        }}
        className={clsx(
          "relative min-h-[220px] rounded-2xl transition-all duration-200",
          dragActive && "ring-2 ring-blue-500"
        )}
      >
        {/* Drag Overlay */}
        {dragActive && (
          <div
            className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-500 bg-blue-500/10 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-app-panel p-6 shadow-xl ring-1 ring-blue-500/30">
              <UploadCloud className="h-10 w-10 animate-bounce text-blue-500" />
              <span className="text-base font-semibold text-app-text">
                释放文件即可上传至当前保险库
              </span>
              <span className="text-xs text-app-muted">支持批量上传</span>
            </div>
          </div>
        )}

        {/* Content States */}
        {loading ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 text-app-muted">
            <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
            <span className="text-xs text-app-faint">正在加载文件列表...</span>
          </div>
        ) : sortedFiles.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-app-border bg-app-panel/50 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-400">
              <FileGlyph className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm font-semibold text-app-text">
                {files.length === 0 ? emptyHint : "没有找到匹配的文件"}
              </p>
              <p className="mt-1 text-xs text-app-muted">
                {files.length === 0
                  ? "可以将文件拖拽到此区域，或点击上方「上传文件」按钮"
                  : "尝试调整关键词或切换文件类型过滤器"}
              </p>
            </div>
            {adapter.upload && files.length === 0 && (
              <button
                className="btn-outline mt-2 text-xs"
                onClick={() => inputRef.current?.click()}
              >
                <UploadCloud className="h-4 w-4" />
                选择文件上传
              </button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View (Cloudreve Style Cards) */
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-3.5 md:grid-cols-3 lg:grid-cols-4">
            {sortedFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                thumbnail={
                  file.kind === "image" ? adapter.rawUrl(file) : undefined
                }
                onOpen={() => open(file)}
                onDownload={() =>
                  window.open(adapter.downloadUrl(file), "_blank")
                }
                onShare={
                  adapter.createShare ? () => setSharing(file) : undefined
                }
                onRename={adapter.rename ? () => startRename(file) : undefined}
                onDelete={
                  adapter.remove ? () => confirmDelete(file) : undefined
                }
                selected={selectedIds.has(file.id)}
                onToggleSelect={
                  adapter.remove ? () => toggleSelection(file.id) : undefined
                }
              />
            ))}
          </div>
        ) : (
          /* List View (Cloudreve Style Table) */
          <div className="overflow-hidden rounded-2xl border border-app-border bg-app-panel shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-app-border bg-app-panel2/60 text-xs font-semibold text-app-muted">
                    <th
                      className="cursor-pointer py-2.5 pl-3 pr-2 transition hover:text-app-text sm:py-3 sm:pl-4 sm:pr-3"
                      onClick={() => handleToggleSort("name")}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>文件名</span>
                        {sortField === "name" ? (
                          sortOrder === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-app-accent" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-app-accent" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      className="cursor-pointer px-2 py-2.5 transition hover:text-app-text sm:px-3 sm:py-3"
                      onClick={() => handleToggleSort("size")}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>大小</span>
                        {sortField === "size" ? (
                          sortOrder === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-app-accent" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-app-accent" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th
                      className="hidden cursor-pointer px-3 py-3 transition hover:text-app-text sm:table-cell"
                      onClick={() => handleToggleSort("updated_at")}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>修改日期</span>
                        {sortField === "updated_at" ? (
                          sortOrder === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-app-accent" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-app-accent" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </div>
                    </th>
                    <th className="hidden px-3 py-3 md:table-cell">类型</th>
                    <th className="py-2.5 pl-2 pr-3 text-right sm:py-3 sm:pl-3 sm:pr-4">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border/60">
                  {sortedFiles.map((file) => (
                    <FileListRow
                      key={file.id}
                      file={file}
                      onOpen={() => open(file)}
                      onDownload={() =>
                        window.open(adapter.downloadUrl(file), "_blank")
                      }
                      onShare={
                        adapter.createShare ? () => setSharing(file) : undefined
                      }
                      onRename={
                        adapter.rename ? () => startRename(file) : undefined
                      }
                      onDelete={
                        adapter.remove ? () => confirmDelete(file) : undefined
                      }
                      selected={selectedIds.has(file.id)}
                      onToggleSelect={
                        adapter.remove ? () => toggleSelection(file.id) : undefined
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {editing && (
        <Suspense
          fallback={
            <div
              className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
              style={{ background: "var(--overlay)" }}
            >
              <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
            </div>
          }
        >
          <TextEditorModal
            file={editing}
            onClose={() => setEditing(null)}
            load={adapter.getContent}
            save={adapter.saveContent}
          />
        </Suspense>
      )}

      {/* Media Player Modal */}
      <MediaPlayerModal
        file={playing}
        src={playing ? adapter.rawUrl(playing) : ""}
        downloadUrl={playing ? adapter.downloadUrl(playing) : "#"}
        onClose={() => setPlaying(null)}
      />

      {/* Lightbox for Images */}
      <Lightbox
        open={lightboxFile !== null}
        close={() => setLightboxFile(null)}
        index={lightboxIndex}
        plugins={[Zoom]}
        slides={images.map((f) => ({
          src: adapter.rawUrl(f),
          title: f.name,
        }))}
        styles={{
          container: {
            backgroundColor:
              theme === "dark"
                ? "rgba(11, 19, 34, 0.96)"
                : "rgba(248, 250, 252, 0.97)",
          },
        }}
      />

      {/* Single File Share Dialog */}
      {adapter.getShare && adapter.createShare && (
        <FileShareDialog
          file={sharing}
          onClose={() => setSharing(null)}
          getShare={adapter.getShare}
          createShare={adapter.createShare}
          revokeShare={adapter.revokeShare}
        />
      )}

      {/* Rename Dialog */}
      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        size="sm"
        title="重命名文件"
        footer={
          <>
            <button className="btn-outline" onClick={() => setRenaming(null)}>
              取消
            </button>
            <button className="btn-primary" onClick={submitRename}>
              保存
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="text-xs text-app-muted">输入新文件名：</label>
          <input
            className="input"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
          />
        </div>
      </Modal>
    </div>
  );
}

/* ========================================================================= */
/* Cloudreve Style Grid File Card                                           */
/* ========================================================================= */

interface FileActionProps {
  file: FileItem;
  onOpen: () => void;
  onDownload: () => void;
  onShare?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}

interface FileCardProps extends FileActionProps {
  thumbnail?: string;
}

function FileCard({
  file,
  thumbnail,
  onOpen,
  onDownload,
  onShare,
  onRename,
  onDelete,
  selected,
  onToggleSelect,
}: FileCardProps) {
  const visuals = getFileVisuals(file);

  return (
    <article className="card card-hover group relative flex flex-col overflow-hidden bg-app-panel">
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="absolute right-2 top-2 z-20 h-4 w-4 accent-[var(--accent)] sm:right-2.5 sm:top-2.5"
          aria-label={`选择 ${file.name}`}
        />
      )}
      {/* Thumbnail or File Type Area */}
      <button
        onClick={onOpen}
        className={clsx(
          "relative flex h-24 w-full items-center justify-center overflow-hidden border-b border-app-border/80 transition-colors sm:h-36",
          visuals.bgColor
        )}
        title={`打开预览: ${file.name}`}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={file.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 sm:gap-2">
            <div
              className={clsx(
                "flex h-10 w-10 items-center justify-center rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-110 sm:h-14 sm:w-14 sm:rounded-2xl",
                visuals.bgColor,
                visuals.color,
                "border",
                visuals.borderColor
              )}
            >
              <FileIcon file={file} className="h-5 w-5 sm:h-7 sm:w-7" />
            </div>
            <span
              className={clsx(
                "rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider sm:px-2 sm:text-[10px]",
                visuals.badgeBg
              )}
            >
              {visuals.label}
            </span>
          </div>
        )}

        {/* Quick Kind Tag Badge */}
        <span
          className={clsx(
            "badge absolute left-2 top-2 shadow-sm backdrop-blur sm:left-2.5 sm:top-2.5",
            visuals.badgeBg
          )}
        >
          {visuals.label}
        </span>
      </button>

      {/* Meta Information */}
      <div className="flex flex-1 flex-col justify-between p-2.5 sm:p-3.5">
        <div>
          <button
            onClick={onOpen}
            className="w-full text-left"
            title={file.name}
          >
            <h4 className="line-clamp-1 break-all text-xs font-semibold text-app-text transition-colors group-hover:text-app-accent sm:text-sm">
              {file.name}
            </h4>
          </button>
          <div className="mt-1 flex items-center justify-between gap-1.5 text-[11px] text-app-faint sm:text-xs">
            <span className="truncate font-mono">{formatBytes(file.size)}</span>
            <span className="shrink-0">
              {formatDate(file.updated_at).split(" ")[0]}
            </span>
          </div>
        </div>
      </div>

      {/* Action Toolbar on Bottom */}
      <div className="flex flex-wrap items-center gap-0.5 border-t border-app-border/70 bg-app-panel2/40 px-1.5 py-1 transition-colors sm:flex-nowrap sm:gap-1 sm:px-2 sm:py-1.5">
        <button
          className="btn-ghost h-8 w-8 shrink-0 p-0"
          onClick={onOpen}
          title={file.kind === "text" ? "编辑文件" : "查看预览"}
        >
          {file.kind === "text" ? (
            <Pencil className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          className="btn-ghost h-8 w-8 shrink-0 p-0"
          onClick={onDownload}
          title="下载到本地"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        {onShare && (
          <button
            className="btn-ghost h-8 w-8 shrink-0 p-0"
            onClick={onShare}
            title="生成单文件链接与二维码"
          >
            <Share2 className="h-3.5 w-3.5 text-blue-500" />
          </button>
        )}
        {onRename && (
          <button
            className="btn-ghost h-8 w-8 shrink-0 p-0"
            onClick={onRename}
            title="重命名"
          >
            <TextCursorInput className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="hidden flex-1 sm:block" />
        {onDelete && (
          <button
            className="btn-danger h-8 w-8 shrink-0 p-0"
            onClick={onDelete}
            title="删除文件"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}

/* ========================================================================= */
/* Cloudreve Style List Table Row                                           */
/* ========================================================================= */

function FileListRow({
  file,
  onOpen,
  onDownload,
  onShare,
  onRename,
  onDelete,
  selected,
  onToggleSelect,
}: FileActionProps) {
  const visuals = getFileVisuals(file);

  return (
    <tr className="group transition-colors hover:bg-app-panel2/50">
      {/* File Name & Icon */}
      <td className="py-2 pl-3 pr-2 sm:py-2.5 sm:pl-4 sm:pr-3">
        <div className="flex items-center gap-2 sm:gap-3">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
              aria-label={`选择 ${file.name}`}
            />
          )}
          <button
            onClick={onOpen}
            className="flex min-w-0 items-center gap-2 text-left transition group-hover:text-app-accent sm:gap-3"
            title={file.name}
          >
            <div
              className={clsx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border sm:h-8 sm:w-8",
                visuals.bgColor,
                visuals.color,
                visuals.borderColor
              )}
            >
              <FileIcon file={file} className="h-4 w-4" />
            </div>
            <span className="line-clamp-1 max-w-[42vw] break-all font-medium text-app-text transition group-hover:text-app-accent sm:max-w-[280px] md:max-w-lg">
              {file.name}
            </span>
          </button>
        </div>
      </td>

      {/* File Size */}
      <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] text-app-muted sm:px-3 sm:py-2.5 sm:text-xs">
        {formatBytes(file.size)}
      </td>

      {/* Date */}
      <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-app-faint sm:table-cell">
        {formatDate(file.updated_at)}
      </td>

      {/* Kind Badge */}
      <td className="hidden whitespace-nowrap px-3 py-2.5 md:table-cell">
        <span
          className={clsx(
            "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
            visuals.badgeBg
          )}
        >
          {visuals.label}
        </span>
      </td>

      {/* Actions */}
      <td className="py-2 pl-2 pr-3 text-right sm:py-2.5 sm:pl-3 sm:pr-4">
        <div className="flex items-center justify-end gap-0.5 sm:gap-1">
          <button
            className="btn-ghost h-8 w-8 shrink-0 p-0"
            onClick={onOpen}
            title={file.kind === "text" ? "编辑文件" : "查看预览"}
          >
            {file.kind === "text" ? (
              <Pencil className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            className="btn-ghost h-8 w-8 shrink-0 p-0"
            onClick={onDownload}
            title="下载"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          {onShare && (
            <button
              className="btn-ghost hidden h-8 w-8 shrink-0 p-0 sm:inline-flex"
              onClick={onShare}
              title="分享"
            >
              <Share2 className="h-3.5 w-3.5 text-blue-500" />
            </button>
          )}
          {onRename && (
            <button
              className="btn-ghost hidden h-8 w-8 shrink-0 p-0 sm:inline-flex"
              onClick={onRename}
              title="重命名"
            >
              <TextCursorInput className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              className="btn-danger h-8 w-8 shrink-0 p-0"
              onClick={onDelete}
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
