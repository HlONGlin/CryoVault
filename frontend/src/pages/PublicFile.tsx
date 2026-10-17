import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";
import { Download, Loader2, Save, Snowflake } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { fileShareApi, urls, type PublicFileShare } from "../api";
import { FileIcon } from "../components/FileIcon";
import { extensionsFor } from "../lib/codemirror";
import { formatBytes, formatDate, kindMeta } from "../lib/format";
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
      setSaveMessage("已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-app-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="card p-8">
          <Snowflake className="mx-auto h-10 w-10 text-app-danger" />
          <h1 className="mt-4 text-xl font-semibold text-app-text">
            文件链接不可用
          </h1>
          <p className="mt-2 text-sm text-app-muted">
            {error ?? "该单文件分享可能已被撤销或删除。"}
          </p>
          <p className="mt-4 text-xs text-app-faint">
            请联系分享者获取新的链接。
          </p>
        </div>
      </div>
    );
  }

  const { file, allow_edit } = info;
  const meta = kindMeta[file.kind];

  return (
    <div className="space-y-5">
      <section className="card relative overflow-hidden p-6 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[var(--accent-soft)] blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="vault-kicker flex items-center gap-2">
              <Snowflake className="h-3.5 w-3.5" />
              Direct file delivery
            </div>
            <h1 className="mt-2 flex items-center gap-2 break-all text-2xl font-semibold tracking-wide text-app-text">
              <FileIcon
                file={file}
                className={`h-6 w-6 shrink-0 ${meta.accent}`}
              />
              {file.name}
            </h1>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="chip">{meta.label}</span>
              <span className="chip">{formatBytes(file.size)}</span>
              <span className="chip">{formatDate(file.updated_at)}</span>
              <span className={allow_edit ? "chip chip-accent" : "chip"}>
                {allow_edit ? "可编辑文本" : "只读分享"}
              </span>
            </div>
          </div>
          <a
            className="btn-primary shrink-0 self-start"
            href={urls.fileShareDownload(token)}
            download
          >
            <Download className="h-4 w-4" />
            下载文件
          </a>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-2.5 text-sm text-app-danger">
          {error}
        </div>
      )}

      {file.kind === "text" ? (
        <div className="card overflow-hidden">
          {contentLoading ? (
            <div className="flex h-64 items-center justify-center text-app-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <CodeMirror
                value={content}
                height="60vh"
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
                className="text-sm"
              />
              {allow_edit && (
                <div className="flex items-center justify-end gap-3 border-t border-app-border px-4 py-3">
                  {saveMessage && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-300">
                      {saveMessage}
                    </span>
                  )}
                  <button
                    className="btn-primary"
                    onClick={save}
                    disabled={saving || content === original}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    保存修改
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : file.kind === "image" ? (
        <div className="card flex items-center justify-center overflow-hidden p-3">
          <a href={urls.fileShareRaw(token)} target="_blank" rel="noreferrer">
            <img
              src={urls.fileShareRaw(token)}
              alt={file.name}
              className="max-h-[72vh] max-w-full rounded-xl object-contain"
            />
          </a>
        </div>
      ) : file.kind === "video" ? (
        <div className="card overflow-hidden bg-black/70">
          <video
            src={urls.fileShareRaw(token)}
            controls
            playsInline
            className="max-h-[72vh] w-full bg-black"
          >
            当前浏览器不支持视频播放。
          </video>
        </div>
      ) : file.kind === "audio" ? (
        <div className="card p-8">
          <audio src={urls.fileShareRaw(token)} controls className="w-full" />
        </div>
      ) : (
        <div className="card flex flex-col items-center gap-4 p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-app-border bg-app-panel2">
            <FileIcon file={file} className={`h-7 w-7 ${meta.accent}`} />
          </div>
          <p className="text-sm text-app-muted">
            该类型文件不支持在线预览，请直接下载。
          </p>
          <a
            className="btn-outline"
            href={urls.fileShareDownload(token)}
            download
          >
            <Download className="h-4 w-4" />
            下载文件
          </a>
        </div>
      )}
    </div>
  );
}
