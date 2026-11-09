import { AlertCircle, CalendarClock, FolderOpen, LockKeyhole, PencilLine } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { publicSharesApi, type FileItem, type FolderItem, type PublicShareInfo } from "../api";
import { FileBrowser } from "../components/files/FileBrowser";
import type { FileCrumb } from "../components/files/FileBreadcrumbs";
import type { FileBrowseSource, ListingOptions } from "../components/files/source";
import { formatDate } from "../lib/format";

type UnlockedInfo = Extract<PublicShareInfo, { target_type: "file" | "folder" }>;

function asFile(value: FileItem | null): FileItem | null {
  return value ? { ...value, type: "file" } : null;
}

export function UnifiedSharePage() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<PublicShareInfo | null>(null);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [path, setPath] = useState<FileCrumb[]>([]);

  async function loadInfo() {
    try {
      const result = await publicSharesApi.info(token);
      setInfo(result);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  useEffect(() => {
    setInfo(null);
    setPassword("");
    setPath([]);
    setError("");
    void loadInfo();
  }, [token]);

  const unlocked = info && "target_type" in info ? (info as UnlockedInfo) : null;
  const sharedFile = unlocked?.target_type === "file" ? asFile(unlocked.file) : null;

  useEffect(() => {
    if (!unlocked) return;
    setPath([{ id: null, name: unlocked.name }]);
  }, [unlocked?.id, unlocked?.name]);

  const source = useMemo<FileBrowseSource | null>(() => {
    if (!unlocked) return null;
    return {
      list(options: ListingOptions) {
        if (unlocked.target_type === "file") {
          const item = asFile(unlocked.file);
          const matches = item && (!options.query || item.name.toLocaleLowerCase().includes(options.query.toLocaleLowerCase()));
          return Promise.resolve({
            items: matches && item ? [item] : [],
            total: matches && item ? 1 : 0,
            page: 1,
            page_size: 1,
          });
        }
        return publicSharesApi.list(token, options.folderId, options.page, options.query, options.sort, options.order);
      },
      content: (fileId) => publicSharesApi.content(token, fileId),
      saveContent: unlocked.allow_edit ? (fileId, content, etag) => publicSharesApi.saveContent(token, fileId, content, etag) : undefined,
      rawUrl: (fileId) => publicSharesApi.rawUrl(token, fileId),
      downloadUrl: (fileId) => publicSharesApi.downloadUrl(token, fileId),
    };
  }, [token, unlocked]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setUnlocking(true);
    setError("");
    try {
      await publicSharesApi.unlock(token, password);
      await loadInfo();
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setUnlocking(false);
    }
  }

  function navigate(folderId: number | null, folder?: FolderItem) {
    if (folderId === null) {
      if (unlocked) setPath([{ id: null, name: unlocked.name }]);
      return;
    }
    const existing = path.findIndex((item) => item.id === folderId);
    if (existing >= 0) {
      setPath(path.slice(0, existing + 1));
      return;
    }
    if (folder) setPath([...path, { id: folder.id, name: folder.name }]);
  }

  if (info?.password_required && !unlocked) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center py-10 text-center sm:py-16">
        <span className="rounded-2xl bg-app-panel2 p-4 text-app-accent"><LockKeyhole size={28} /></span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">受密码保护的分享</h1>
        <p className="mt-2 text-sm text-app-muted">输入分享者提供的访问密码后继续。</p>
        <form className="mt-6 w-full space-y-3 text-left" onSubmit={unlock}>
          <label className="block space-y-1.5 text-sm"><span>访问密码</span><input autoFocus className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="btn-primary w-full" disabled={unlocking}>{unlocking ? "验证中..." : "访问分享"}</button>
          {error && <p className="flex items-start gap-2 text-sm text-app-danger"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</p>}
        </form>
      </div>
    );
  }

  if (!unlocked || !source) {
    return <div className="mx-auto max-w-lg py-16 text-center"><p className="text-sm text-app-muted">{error || "正在加载分享..."}</p>{error && <button className="btn-outline mt-4" onClick={() => void loadInfo()}>重试</button>}</div>;
  }

  const currentFolderId = path.length ? path[path.length - 1].id : null;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="vault-kicker">CryoVault 分享</p>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight">{unlocked.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-app-muted">
            <span className="inline-flex items-center gap-1.5">{unlocked.target_type === "folder" ? <FolderOpen size={15} /> : <PencilLine size={15} />}{unlocked.target_type === "folder" ? "共享文件夹" : "共享文件"}</span>
            <span>{unlocked.allow_edit ? "允许在线编辑文本" : "只读访问"}</span>
            {unlocked.expires_at && <span className="inline-flex items-center gap-1.5"><CalendarClock size={15} />有效至 {formatDate(unlocked.expires_at)}</span>}
          </p>
        </div>
        <span className="badge">{unlocked.password_required ? "密码已验证" : "公开链接"}</span>
      </header>
      {unlocked.target_type === "file" && !sharedFile && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-app-danger">分享目标文件不存在或已失效。</div>}
      {unlocked.target_type === "file" && sharedFile ? (
        <FileBrowser source={source} folderId={null} breadcrumbs={path.length ? path : [{ id: null, name: unlocked.name }]} onNavigate={navigate} />
      ) : null}
      {unlocked.target_type === "folder" ? (
        <FileBrowser source={source} folderId={currentFolderId} breadcrumbs={path.length ? path : [{ id: null, name: unlocked.name }]} onNavigate={navigate} emptyLabel="此分享目录为空。" />
      ) : null}
    </div>
  );
}