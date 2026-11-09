import { useEffect, useState } from "react";
import type { ShareCreateInput, ShareUpdateInput, UnifiedShare } from "../../api";
import { Modal } from "../Modal";

type ShareInput = ShareCreateInput | ShareUpdateInput;

interface Props {
  open: boolean;
  share?: UnifiedShare | null;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (input: ShareInput) => Promise<void>;
}

function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ShareSettingsDialog({ open, share, submitLabel, onClose, onSubmit }: Props) {
  const [allowEdit, setAllowEdit] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [changePassword, setChangePassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAllowEdit(share?.allow_edit ?? false);
    setExpiresAt(toLocalInput(share?.expires_at));
    setChangePassword(false);
    setClearPassword(false);
    setPassword("");
    setBusy(false);
    setError("");
  }, [open, share]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    let normalizedExpiry: string | null = null;
    if (expiresAt) {
      const date = new Date(expiresAt);
      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        setError("有效期必须晚于当前时间");
        return;
      }
      normalizedExpiry = date.toISOString();
    }
    if (changePassword && password.length < 4) {
      setError("访问密码至少需要 4 个字符");
      return;
    }
    const input: ShareUpdateInput = { allow_edit: allowEdit, expires_at: normalizedExpiry };
    if (changePassword) input.password = password;
    if (clearPassword) input.password = null;
    setBusy(true);
    setError("");
    try {
      await onSubmit(input);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={share ? "修改分享" : "创建分享"} subtitle={share?.name} footer={
      <>
        <button className="btn-outline" onClick={onClose}>取消</button>
        <button className="btn-primary" type="submit" form="share-settings-form" disabled={busy}>{busy ? "保存中..." : submitLabel}</button>
      </>
    }>
      <form id="share-settings-form" className="space-y-5" onSubmit={submit}>
        <label className="flex items-start gap-3 rounded-xl border border-app-border bg-app-panel2/50 p-3 text-sm">
          <input className="mt-1" type="checkbox" checked={allowEdit} onChange={(event) => setAllowEdit(event.target.checked)} />
          <span><strong className="block">允许在线编辑文本</strong><span className="text-app-muted">访问者只能通过文本编辑器修改文本文件。</span></span>
        </label>
        <label className="block space-y-1.5 text-sm">
          <span>有效期</span>
          <input className="input" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          <span className="block text-xs text-app-muted">留空表示永久有效。</span>
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={changePassword} disabled={clearPassword} onChange={(event) => setChangePassword(event.target.checked)} />
            {share?.password_required ? "更新访问密码" : "设置访问密码"}
          </label>
          {changePassword && <input className="input" type="password" autoComplete="new-password" value={password} placeholder="至少 4 个字符" onChange={(event) => setPassword(event.target.value)} />}
          {share?.password_required && !changePassword && !clearPassword && <span className="block text-xs text-app-muted">保持当前密码不变。</span>}
          {share?.password_required && <label className="flex items-center gap-2 text-sm text-app-muted"><input type="checkbox" checked={clearPassword} onChange={(event) => { setClearPassword(event.target.checked); if (event.target.checked) setChangePassword(false); }} />清除现有访问密码</label>}
        </div>
        {error && <p className="text-sm text-app-danger">{error}</p>}
      </form>
    </Modal>
  );
}