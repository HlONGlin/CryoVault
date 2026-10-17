import {
  Files,
  FolderOpen,
  HardDrive,
  Layers,
  Loader2,
  Plus,
  QrCode,
  ShieldCheck,
  Snowflake,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { adminApi, shareLink, type Group } from "../api";
import { panelPath } from "../base";
import { Modal } from "../components/Modal";
import { ShareDialog } from "../components/ShareDialog";
import { formatBytes, formatDate } from "../lib/format";

export function Dashboard() {
  const [groups, setGroups] = useState<Group[]>([]);
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

  const totalFiles = groups.reduce((acc, g) => acc + g.file_count, 0);
  const totalSize = groups.reduce((acc, g) => acc + g.total_size, 0);

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-6 sm:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--accent-soft)] blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="vault-kicker flex items-center gap-2">
              <Snowflake className="h-3.5 w-3.5" />
              Vault console / 01
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-wide text-app-text sm:text-3xl">
              冷冻数据舱
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-app-muted">
              将文件封存到分组保险库，或直接为单个文件生成链接与二维码。所有数据保存在本地磁盘。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="badge">
                <ShieldCheck className="h-3.5 w-3.5 text-app-accent" />
                已解锁管理
              </span>
              <span className="badge">
                <HardDrive className="h-3.5 w-3.5 text-app-accent" />
                本地存储
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link to={panelPath("/direct")} className="btn-outline">
              <Files className="h-4 w-4" />
              单文件分享
            </Link>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              新建分组
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<Layers className="h-4 w-4" />}
          label="分组"
          value={String(groups.length)}
        />
        <Stat
          icon={<Files className="h-4 w-4" />}
          label="文件"
          value={String(totalFiles)}
        />
        <Stat
          icon={<HardDrive className="h-4 w-4" />}
          label="占用空间"
          value={formatBytes(totalSize)}
        />
        <Stat
          icon={<ShieldCheck className="h-4 w-4" />}
          label="服务状态"
          value="在线"
          accent
        />
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-2.5 text-sm text-app-danger">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-app-text">
          分组保险库
        </h2>
        <span className="text-xs text-app-faint">{groups.length} 个分组</span>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-app-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="card flex h-60 flex-col items-center justify-center gap-4 text-app-muted">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-app-border bg-app-panel2 text-app-accent">
            <Layers className="h-7 w-7" />
          </div>
          <div className="text-center">
            <p className="text-sm text-app-text">还没有分组</p>
            <p className="mt-1 text-xs text-app-faint">
              先创建一个分组，或直接使用单文件分享。
            </p>
          </div>
          <div className="flex gap-2">
            <Link to={panelPath("/direct")} className="btn-outline">
              <Files className="h-4 w-4" />
              单文件分享
            </Link>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              新建分组
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <article
              key={group.id}
              className="card card-hover flex flex-col gap-4 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="vault-kicker">
                    Vault unit {String(group.id).padStart(2, "0")}
                  </div>
                  <h3 className="mt-1 truncate text-base font-semibold text-app-text">
                    {group.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-app-muted">
                    {group.description || "暂无描述"}
                  </p>
                </div>
                <span className="badge shrink-0">{group.file_count} 文件</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className="chip">
                  <HardDrive className="h-3.5 w-3.5" />
                  {formatBytes(group.total_size)}
                </span>
                <span className="chip">{formatDate(group.created_at)}</span>
                {group.allow_edit && (
                  <span className="chip chip-accent">可编辑</span>
                )}
              </div>

              <div className="mt-auto flex items-center gap-1.5 pt-1">
                <Link
                  to={panelPath(`/groups/${group.id}`)}
                  className="btn-outline flex-1"
                >
                  <FolderOpen className="h-4 w-4" />
                  打开
                </Link>
                <button
                  className="btn-outline px-2.5"
                  onClick={() => setSharing(group)}
                  title="分享二维码"
                >
                  <QrCode className="h-4 w-4" />
                </button>
                <button
                  className="btn-danger px-2.5"
                  onClick={() => removeGroup(group)}
                  title="删除分组"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        size="sm"
        title="新建分组"
        subtitle="为一批文件创建独立保险库"
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
              创建
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-app-muted">名称</span>
            <input
              className="input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：产品资料 / 2024 年报"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-app-muted">
              描述（可选）
            </span>
            <textarea
              className="input min-h-[72px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="给这个分组加一段说明"
            />
          </label>
          <label className="flex items-center gap-2.5 text-sm text-app-text">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={allowEdit}
              onChange={(e) => setAllowEdit(e.target.checked)}
            />
            允许通过分享链接编辑文本文件
          </label>
        </div>
      </Modal>

      <ShareDialog
        open={sharing !== null}
        onClose={() => setSharing(null)}
        link={sharing ? shareLink(sharing.share_token) : ""}
        name={sharing?.name ?? ""}
        hint="扫码或打开链接即可浏览该分组文件，无需登录。"
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span
        className={
          accent
            ? "flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-app-accent"
            : "flex h-9 w-9 items-center justify-center rounded-xl bg-app-panel2 text-app-muted"
        }
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-app-faint">{label}</div>
        <div
          className={
            accent
              ? "mt-0.5 truncate text-base font-semibold text-app-accent"
              : "mt-0.5 truncate text-base font-semibold text-app-text"
          }
        >
          {value}
        </div>
      </div>
    </div>
  );
}
