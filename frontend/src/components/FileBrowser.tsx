import clsx from "clsx";
import {
  Download,
  File as FileGlyph,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  TextCursorInput,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

import type { FileItem, FileKind, TextContent } from "../api";
import { formatBytes, formatDate, kindMeta } from "../lib/format";
import { FileIcon } from "./FileIcon";
import { MediaPlayerModal } from "./MediaPlayerModal";
import { Modal } from "./Modal";
import { TextEditorModal } from "./TextEditorModal";

export interface BrowserAdapter {
  list: () => Promise<FileItem[]>;
  rawUrl: (file: FileItem) => string;
  downloadUrl: (file: FileItem) => string;
  getContent: (file: FileItem) => Promise<TextContent>;
  saveContent?: (file: FileItem, content: string) => Promise<unknown>;
  remove?: (file: FileItem) => Promise<unknown>;
  rename?: (file: FileItem, name: string) => Promise<unknown>;
  upload?: (files: File[]) => Promise<unknown>;
}

type Filter = "all" | FileKind;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "text", label: "文本" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
  { key: "audio", label: "音频" },
  { key: "other", label: "其他" },
];

export function FileBrowser({
  adapter,
  emptyHint = "暂无文件",
}: {
  adapter: BrowserAdapter;
  emptyHint?: string;
}) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [editing, setEditing] = useState<FileItem | null>(null);
  const [playing, setPlaying] = useState<FileItem | null>(null);
  const [lightboxFile, setLightboxFile] = useState<FileItem | null>(null);
  const [renaming, setRenaming] = useState<FileItem | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

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

  const counts = useMemo(() => {
    const base: Record<Filter, number> = {
      all: files.length,
      text: 0,
      image: 0,
      video: 0,
      audio: 0,
      other: 0,
    };
    files.forEach((f) => (base[f.kind] += 1));
    return base;
  }, [files]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter(
      (f) => (filter === "all" || f.kind === filter) && (!q || f.name.toLowerCase().includes(q))
    );
  }, [files, filter, query]);

  const images = useMemo(() => filtered.filter((f) => f.kind === "image"), [filtered]);
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
    setError(null);
    try {
      await adapter.upload(Array.from(fileList));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
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
      setFiles((prev) => prev.map((f) => (f.id === renaming.id ? { ...f, ...(updated as object) } : f)));
      setRenaming(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                filter === key
                  ? "bg-frost-500/15 text-frost-400 ring-1 ring-frost-500/40"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              )}
            >
              {label}
              <span className="ml-1 text-[10px] opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="搜索文件名"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="btn-ghost p-2.5" onClick={refresh} aria-label="刷新">
            <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
          </button>
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
                className="btn-primary"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
                上传
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </div>
      )}

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
          "relative rounded-2xl transition",
          dragActive && "ring-2 ring-frost-500/60"
        )}
      >
        {dragActive && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-ink-950/70">
            <div className="flex flex-col items-center gap-2 text-frost-400">
              <UploadCloud className="h-8 w-8" />
              <span className="text-sm">松开即可上传</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex h-48 items-center justify-center text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 text-slate-500">
            <FileGlyph className="h-6 w-6" />
            <span className="text-sm">{files.length === 0 ? emptyHint : "没有匹配的文件"}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                thumbnail={file.kind === "image" ? adapter.rawUrl(file) : undefined}
                onOpen={() => open(file)}
                onDownload={() => window.open(adapter.downloadUrl(file), "_blank")}
                onRename={adapter.rename ? () => startRename(file) : undefined}
                onDelete={adapter.remove ? () => confirmDelete(file) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <TextEditorModal
        file={editing}
        onClose={() => setEditing(null)}
        load={adapter.getContent}
        save={adapter.saveContent}
      />

      <MediaPlayerModal
        file={playing}
        src={playing ? adapter.rawUrl(playing) : ""}
        downloadUrl={playing ? adapter.downloadUrl(playing) : "#"}
        onClose={() => setPlaying(null)}
      />

      <Lightbox
        open={lightboxFile !== null}
        close={() => setLightboxFile(null)}
        index={lightboxIndex}
        plugins={[Zoom]}
        slides={images.map((f) => ({ src: adapter.rawUrl(f), title: f.name }))}
        styles={{ container: { backgroundColor: "rgba(7,11,20,0.95)" } }}
      />

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        size="sm"
        title="重命名"
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
        <input
          className="input"
          value={renameValue}
          autoFocus
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitRename()}
        />
      </Modal>
    </div>
  );
}

interface FileCardProps {
  file: FileItem;
  thumbnail?: string;
  onOpen: () => void;
  onDownload: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

function FileCard({ file, thumbnail, onOpen, onDownload, onRename, onDelete }: FileCardProps) {
  const meta = kindMeta[file.kind];
  return (
    <div className="card group relative flex flex-col overflow-hidden transition hover:border-frost-500/40 hover:shadow-glow">
      <button
        onClick={onOpen}
        className="relative flex h-32 items-center justify-center overflow-hidden bg-ink-900/60"
        title={file.name}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={file.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className={clsx("flex flex-col items-center gap-2", meta.accent)}>
            <FileIcon file={file} className="h-9 w-9" />
            <span className="text-[11px] uppercase tracking-wide opacity-80">
              {meta.label}
            </span>
          </div>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-start gap-2">
          <FileIcon file={file} className={clsx("mt-0.5 h-4 w-4 shrink-0", meta.accent)} />
          <span className="line-clamp-2 break-all text-sm font-medium text-slate-100">
            {file.name}
          </span>
        </div>
        <span className="text-xs text-slate-500">
          {formatBytes(file.size)} · {formatDate(file.updated_at)}
        </span>
      </div>

      <div className="flex items-center gap-0.5 border-t border-white/5 px-2 py-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        {file.kind === "text" && (
          <button className="btn-ghost p-2" onClick={onOpen} title="打开 / 编辑">
            <Pencil className="h-4 w-4" />
          </button>
        )}
        <button className="btn-ghost p-2" onClick={onDownload} title="下载">
          <Download className="h-4 w-4" />
        </button>
        {onRename && (
          <button className="btn-ghost p-2" onClick={onRename} title="重命名">
            <TextCursorInput className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1" />
        {onDelete && (
          <button className="btn-danger p-2" onClick={onDelete} title="删除">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
