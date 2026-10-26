import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { adminApi, shareLink, type FileItem, type Group } from "../api";
import { panelPath } from "../base";
import { DirectFilesSection } from "../components/DirectFilesSection";
import { Modal } from "../components/Modal";
import { ShareDialog } from "../components/ShareDialog";
import { WebDavSyncCard } from "../components/WebDavSyncCard";
import { formatBytes, formatDate } from "../lib/format";

export function Dashboard() {
  const location = useLocation();
  const [groups, setGroups] = useState<Group[]>([]);
  const [directSummary, setDirectSummary] = useState({ count: 0, size: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [sharing, setSharing] = useState<Group | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allowEdit, setAllowEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGroups(await adminApi.listGroups());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (location.hash !== "#single-files") return;
    document.getElementById("single-files")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [location.hash]);

  const handleDirectFilesChange = useCallback((files: FileItem[]) => {
    setDirectSummary({
      count: files.length,
      size: files.reduce((total, file) => total + file.size, 0),
    });
  }, []);

  async function createGroup() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const group = await adminApi.createGroup({
        name: name.trim(),
        description: description.trim(),
        allow_edit: allowEdit,
      });
      setGroups((prev) => [group, ...prev]);
      setCreateOpen(false);
      setName("");
      setDescription("");
      setAllowEdit(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeGroup(group: Group) {
    if (!window.confirm(`删除分组「${group.name}」及其全部文件？此操作不可撤销。`))
      return;
    try {
      await adminApi.deleteGroup(group.id);
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const groupedFileCount = groups.reduce((total, group) => total + group.file_count, 0);
  const totalFileCount = groupedFileCount + directSummary.count;
  const totalSize =
    groups.reduce((total, group) => total + group.total_size, 0) +
    directSummary.size;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Top Welcome & Actions */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-app-text sm:text-2xl">
            文件库概览
          </h1>
          <p className="mt-1 text-sm text-app-muted">
            集中管理本地冷存保险库、分组分享与单文件直连分发。
          </p>
        </div>
        <button
          className="btn-primary w-full self-start text-xs sm:w-auto sm:self-auto sm:text-sm"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          <span>新建分组</span>
        </button>
      </header>

      {/* Cloudreve Style 4-Grid Overview Stat Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3.5">
        <StatCard
          label="分组保险库"
          value={String(groups.length)}
          suffix="个空间"
        />
        <StatCard
          label="托管文件总数"
          value={String(totalFileCount)}
          suffix="个文件"
        />
        <StatCard
          label="总占用空间"
          value={formatBytes(totalSize)}
          suffix="已封存"
        />
        <StatCard
          label="直连文件"
          value={String(directSummary.count)}
          suffix="个直链"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-app-danger">
          {error}
        </div>
      )}

      <WebDavSyncCard />

      {/* Vault Groups Section */}
      <section className="space-y-4" aria-labelledby="groups-heading">
        <div className="flex items-center justify-between gap-3 border-b border-app-border pb-3">
          <div className="flex items-center gap-2">
            <h2 id="groups-heading" className="text-base font-bold text-app-text">
              分组保险库
            </h2>
            <span className="rounded-full bg-app-panel2 px-2 py-0.5 text-xs text-app-muted">
              {groups.length}
            </span>
          </div>
          <span className="hidden text-xs text-app-faint sm:inline">
            支持一键生成扫码分享链接
          </span>
        </div>

        {loading ? (
          <div className="flex h-44 items-center justify-center text-app-muted">
            <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-app-border bg-app-panel p-6 text-center sm:flex-row sm:justify-between sm:p-8 sm:text-left">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm font-semibold text-app-text">
                  暂未创建任何文件分组
                </p>
                <p className="mt-1 text-xs text-app-muted">
                  新建分组后可集中批量上传该主题的文件，并生成独立的公开二维码。
                </p>
              </div>
            </div>
            <button
              className="btn-primary w-full text-xs sm:w-auto"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              立即创建分组
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <article
                key={group.id}
                className="card card-hover flex min-w-0 flex-col justify-between overflow-hidden bg-app-panel p-3.5 shadow-sm sm:p-4"
              >
                <div>
                  {/* Card Header: Icon + Title + Count Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-app-text transition-colors group-hover:text-app-accent">
                          {group.name}
                        </h3>
                        <span className="font-mono text-[10px] text-app-faint">
                          Vault #{String(group.id).padStart(2, "0")}
                        </span>
                      </div>
                    </div>
                    <span className="badge shrink-0 bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                      {group.file_count} 个文件
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mt-3 line-clamp-2 min-h-[34px] text-xs leading-relaxed text-app-muted">
                    {group.description || "暂无描述"}
                  </p>

                  {/* Metadata Chips */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="chip">
                      <span>{formatBytes(group.total_size)}</span>
                    </span>
                    <span className="chip">
                      <span>{formatDate(group.created_at).split(" ")[0]}</span>
                    </span>
                    {group.allow_edit ? (
                      <span className="chip chip-accent">可在线编辑</span>
                    ) : (
                      <span className="chip">只读</span>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-app-border/80 pt-3">
                  <Link
                    to={panelPath(`/groups/${group.id}`)}
                    className="btn-outline flex-1 basis-32 whitespace-nowrap text-xs"
                  >
                    <span>进入保险库</span>
                  </Link>
                  <button
                    className="btn-ghost flex-1 basis-16 whitespace-nowrap px-2.5 text-xs sm:flex-none"
                    onClick={() => setSharing(group)}
                    title="生成分享二维码"
                    aria-label={`分享分组 ${group.name}`}
                  >
                    分享
                  </button>
                  <button
                    className="btn-danger flex-1 basis-16 whitespace-nowrap px-2.5 text-xs sm:flex-none"
                    onClick={() => removeGroup(group)}
                    title="删除分组"
                    aria-label={`删除分组 ${group.name}`}
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Direct Files Section */}
      <DirectFilesSection onFilesChange={handleDirectFilesChange} />

      {/* Create Group Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        size="sm"
        title="新建文件分组"
        subtitle="为一组文件设立独立的管理与分享空间"
        footer={
          <>
            <button className="btn-outline" onClick={() => setCreateOpen(false)}>
              取消
            </button>
            <button
              className="btn-primary"
              onClick={createGroup}
              disabled={saving || !name.trim()}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>立即创建</span>
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-app-text">分组名称</span>
            <input
              className="input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：产品规格书 / 2024 年度归档"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-app-muted">描述信息（可选）</span>
            <textarea
              className="input min-h-[80px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="填写简要备注或使用说明"
            />
          </label>
          <div className="rounded-xl border border-app-border bg-app-panel2/60 p-3">
            <label className="flex items-center gap-2.5 text-xs text-app-text cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-blue-600"
                checked={allowEdit}
                onChange={(e) => setAllowEdit(e.target.checked)}
              />
              <div>
                <div className="font-semibold">允许通过公开分享链接协同编辑</div>
                <div className="text-[11px] text-app-muted">
                  仅支持文本与代码类型文件（txt、md、json、py 等）
                </div>
              </div>
            </label>
          </div>
        </div>
      </Modal>

      {/* Group Share Modal */}
      <ShareDialog
        open={sharing !== null}
        onClose={() => setSharing(null)}
        link={sharing ? shareLink(sharing.share_token) : ""}
        name={sharing?.name ?? ""}
        hint="扫码或复制链接即可在任意终端免登录访问此分组。"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="card bg-app-panel p-3.5 shadow-sm transition hover:shadow-md sm:p-4">
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium text-app-muted sm:text-xs">
          {label}
        </div>
        <div className="mt-0.5 truncate text-base font-bold text-app-text sm:text-lg">
          {value}
        </div>
        {suffix && (
          <div className="truncate text-[10px] text-app-faint">{suffix}</div>
        )}
      </div>
    </div>
  );
}
