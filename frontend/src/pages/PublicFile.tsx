import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";
import { Download, Loader2, Save, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { fileShareApi, urls, type PublicFileShare } from "../api";
import { FileIcon, getFileVisuals } from "../components/FileIcon";
import { extensionsFor } from "../lib/codemirror";
import { formatBytes, formatDate } from "../lib/format";
import { useTheme } from "../theme";

export function PublicFile() {
  const { token = "" } = useParams();
  const { theme } = useTheme();

  const [info, setInfo] = useState<PublicFileShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fileShareApi
      .info(token)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        if (data.file.kind === "text") setContentLoading(true);
      })
      .catch(
        (e) => !cancelled && setError(e instanceof Error ? e.message : String(e))
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const isText = info?.file.kind === "text";
  const extensions = useMemo(
    () => (info ? extensionsFor(info.file.name) : []),
    [info]
  );

  const loadContent = useCallback(async () => {
    if (!token) return;
    setContentLoading(true);
    setError(null);
    try {
      const data = await fileShareApi.getContent(token);
      setContent(data.content);
      setOriginal(data.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setContentLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isText) void loadContent();
  }, [isText, loadContent]);

  async function save() {
    if (!info) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      await fileShareApi.saveContent(token, content);
      setOriginal(content);
      setSaveMessage("已成功保存更改");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-app-muted">
        <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
        <span className="text-xs text-app-faint">正在获取文件信息...</span>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="card p-8 shadow-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-500/20 dark:bg-red-950/40 dark:text-red-400">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-app-text">
            文件分享链接不可用
          </h1>
          <p className="mt-2 text-xs text-app-muted">
            {error ?? "该单文件分享已被创建者撤销，或文件已被移除。"}
          </p>
          <p className="mt-4 text-[11px] text-app-faint">
            如有需要，请联系分享者重新生成访问直链。
          </p>
        </div>
      </div>
    );
  }

  const { file, allow_edit } = info;
  const visuals = getFileVisuals(file);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Cloudreve Style Public File Hero */}
      <section className="card relative overflow-hidden bg-app-panel p-4 shadow-sm sm:p-6">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm sm:h-13 sm:w-13 ${visuals.bgColor} ${visuals.color} ${visuals.borderColor}`}
            >
              <FileIcon file={file} className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                  单文件直链
                </span>
                <span className={`badge ${visuals.badgeBg}`}>
                  {visuals.label}
                </span>
              </div>
              <h1 className="mt-1 break-all text-lg font-bold tracking-tight text-app-text sm:text-2xl">
                {file.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs sm:gap-2">
                <span className="chip font-mono">{formatBytes(file.size)}</span>
                <span className="chip">{formatDate(file.updated_at)}</span>
                <span
                  className={allow_edit ? "chip chip-accent" : "chip"}
                >
                  {allow_edit ? "支持在线编辑" : "只读下载"}
                </span>
              </div>
            </div>
          </div>

          <a
            className="btn-primary h-10 w-full shrink-0 justify-center px-4 text-xs font-semibold sm:w-auto sm:self-auto"
            href={urls.fileShareDownload(token)}
            download
          >
            <Download className="h-4 w-4" />
            <span>下载文件</span>
          </a>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-app-danger">
          {error}
        </div>
      )}

      {/* Preview Section */}
      {file.kind === "text" ? (
        <div className="card overflow-hidden bg-app-panel shadow-sm">
          {contentLoading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-app-muted">
              <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
              <span className="text-xs text-app-faint">正在加载文件内容...</span>
            </div>
          ) : (
            <>
              <CodeMirror
                value={content}
                height="62vh"
                theme={theme === "dark" ? oneDark : "light"}
                editable={allow_edit}
                extensions={extensions}
                onChange={setContent}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLine: true,
                  foldGutter: true,
                  autocompletion: true,
                }}
                className="text-xs sm:text-sm"
              />
              {allow_edit && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app-border bg-app-panel2/50 px-3 py-2.5 pb-safe sm:flex-nowrap sm:px-4 sm:py-3">
                  <span className="text-xs text-app-muted">
                    {saveMessage ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {saveMessage}
                      </span>
                    ) : content !== original ? (
                      <span className="text-amber-500 font-medium">
                        有未保存的改动
                      </span>
                    ) : (
                      "内容已同步"
                    )}
                  </span>
                  <button
                    className="btn-primary text-xs"
                    onClick={save}
                    disabled={saving || content === original}
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    <span>保存修改</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : file.kind === "image" ? (
        <div className="card flex items-center justify-center overflow-hidden bg-app-panel p-4 shadow-sm">
          <a
            href={urls.fileShareRaw(token)}
            target="_blank"
            rel="noreferrer"
            title="点击在新标签页查看原始大图"
          >
            <img
              src={urls.fileShareRaw(token)}
              alt={file.name}
              className="max-h-[75vh] max-w-full rounded-xl object-contain shadow-md"
            />
          </a>
        </div>
      ) : file.kind === "video" ? (
        <div className="card overflow-hidden bg-black/90 shadow-md">
          <video
            src={urls.fileShareRaw(token)}
            controls
            playsInline
            className="max-h-[75vh] w-full bg-black"
          >
            当前浏览器暂不支持在线播放此格式视频。
          </video>
        </div>
      ) : file.kind === "audio" ? (
        <div className="card p-8 bg-app-panel shadow-sm">
          <div className="mx-auto max-w-lg space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 ring-1 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-400">
              <FileIcon file={file} className="h-8 w-8" />
            </div>
            <p className="text-sm font-semibold text-app-text">{file.name}</p>
            <audio
              src={urls.fileShareRaw(token)}
              controls
              className="w-full"
            />
          </div>
        </div>
      ) : (
        <div className="card flex flex-col items-center gap-4 bg-app-panel p-8 text-center shadow-sm sm:p-12">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl border shadow-sm ${visuals.bgColor} ${visuals.color} ${visuals.borderColor}`}
          >
            <FileIcon file={file} className="h-8 w-8" />
          </div>
          <div>
            <p className="break-all text-base font-semibold text-app-text">{file.name}</p>
            <p className="mt-1 text-xs text-app-muted">
              该文件格式暂不支持浏览器在线直接预览，可直接下载至本地查看。
            </p>
          </div>
          <a
            className="btn-primary mt-2 w-full justify-center text-xs sm:w-auto"
            href={urls.fileShareDownload(token)}
            download
          >
            <Download className="h-4 w-4" />
            <span>立即下载 ({formatBytes(file.size)})</span>
          </a>
        </div>
      )}
    </div>
  );
}
