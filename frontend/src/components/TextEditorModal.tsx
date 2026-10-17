import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";
import { Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { FileItem, TextContent } from "../api";
import { extensionsFor } from "../lib/codemirror";
import { languageFor } from "../lib/format";
import { useTheme } from "../theme";
import { Modal } from "./Modal";

interface TextEditorModalProps {
  file: FileItem | null;
  onClose: () => void;
  load: (file: FileItem) => Promise<TextContent>;
  save?: (file: FileItem, content: string) => Promise<unknown>;
  readOnly?: boolean;
}

export function TextEditorModal({
  file,
  onClose,
  load,
  save,
  readOnly,
}: TextEditorModalProps) {
  const { theme } = useTheme();
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const editable = Boolean(save) && !readOnly;
  const dirty = content !== original;

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSavedAt(null);
    load(file)
      .then((data) => {
        if (cancelled) return;
        setContent(data.content);
        setOriginal(data.content);
      })
      .catch((e) => !cancelled && setError(String(e.message ?? e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [file, load]);

  const extensions = useMemo(
    () => (file ? extensionsFor(file.name) : []),
    [file]
  );

  async function handleSave() {
    if (!file || !save) return;
    setSaving(true);
    setError(null);
    try {
      await save(file, content);
      setOriginal(content);
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      size="xl"
      padded={false}
      title={file?.name}
      subtitle={
        file
          ? `${languageFor(file.name)} · ${readOnly ? "只读" : dirty ? "未保存" : "已同步"}`
          : undefined
      }
      footer={
        <>
          {error && (
            <span className="mr-auto text-xs text-app-danger">{error}</span>
          )}
          {savedAt && !error && (
            <span className="mr-auto text-xs text-emerald-600 dark:text-emerald-300">
              已保存 {savedAt}
            </span>
          )}
          <button className="btn-outline" onClick={onClose}>
            关闭
          </button>
          {editable && (
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存
            </button>
          )}
        </>
      }
    >
      {loading ? (
        <div className="flex h-64 items-center justify-center text-app-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <CodeMirror
          value={content}
          height="60vh"
          theme={theme === "dark" ? oneDark : "light"}
          editable={editable}
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
      )}
    </Modal>
  );
}
