import {
  FolderOpen,
  Layers,
  Loader2,
  Plus,
  QrCode,
  Snowflake,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { adminApi, type Group } from "../api";
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
    if (!window.confirm(`删除分组「${group.name}」及其全部文件？此操作不可撤销。`)) return;
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="vault-kicker flex items-center gap-2"><Snowflake className="h-3.5 w-3.5" /> Vault console / 01</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-wide text-ice-100">冷冻数据舱</h1>
          <p className="mt-1 text-sm text-slate-400">
            将文件封存到分组保险库，通过二维码安全交付。
          </p>
        </div>
        <button className="btn-primary self-start" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          新建分组
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="分组" value={String(groups.length)} />
        <Stat label="文件" value={String(totalFiles)} />
        <Stat label="占用空间" value={formatBytes(totalSize)} />
        <Stat label="服务" value="在线" accent />
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="card flex h-56 flex-col items-center justify-center gap-3 text-slate-400">
          <Layers className="h-8 w-8 text-slate-600" />
          <p className="text-sm">还没有分组，先创建一个吧。</p>
          <button className="btn-outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            新建分组
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.id} className="card flex flex-col gap-3 p-4 transition hover:border-frost-500/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-frost-400/70">Vault unit {String(group.id).padStart(2, "0")}</div>
            <h3 className="truncate text-base font-semibold text-ice-100">{group.name}</h3>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">
                    {group.description || "无描述"}
                  </p>
                </div>
                <span className="shrink-0 rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-400">
                  {group.file_count} 个文件
                </span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>{formatBytes(group.total_size)}</span>
                <span>{formatDate(group.created_at)}</span>
                {group.allow_edit && <span className="text-frost-400">允许编辑</span>}
              </div>

              <div className="mt-auto flex items-center gap-1.5 pt-1">
                <Link to={`/groups/${group.id}`} className="btn-outline flex-1">
                  <FolderOpen className="h-4 w-4" />
                  打开
                </Link>
                <button className="btn-outline" onClick={() => setSharing(group)} title="二维码">
                  <QrCode className="h-4 w-4" />
                </button>
                <button className="btn-danger" onClick={() => removeGroup(group)} title="删除">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        size="sm"
        title="新建分组"
        footer={
          <>
            <button className="btn-outline" onClick={() => setCreateOpen(false)}>
              取消
            </button>
            <button className="btn-primary" onClick={createGroup} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              创建
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">名称</span>
            <input
              className="input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：产品资料 / 2024 年报"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">描述（可选）</span>
            <textarea
              className="input min-h-[72px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="给这个分组加一段说明"
            />
          </label>
          <label className="flex items-center gap-2.5 text-sm text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 accent-frost-500"
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
        token={sharing?.share_token ?? ""}
        groupName={sharing?.name ?? ""}
      />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={accent ? "mt-1 text-lg font-semibold text-frost-400" : "mt-1 text-lg font-semibold text-white"}>
        {value}
      </div>
    </div>
  );
}
