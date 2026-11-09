import { useEffect, useState } from "react";
import { Modal } from "../Modal";

interface Props {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}

export function NameDialog({ open, title, label, initialValue = "", submitLabel = "确定", onClose, onSubmit }: Props) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    setBusy(false);
    setError("");
  }, [initialValue, open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cleaned = value.trim();
    if (!cleaned) { setError("请输入名称"); return; }
    setBusy(true);
    setError("");
    try {
      await onSubmit(cleaned);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} footer={
      <>
        <button className="btn-outline" type="button" onClick={onClose}>取消</button>
        <button className="btn-primary" type="submit" form="name-dialog-form" disabled={busy}>{busy ? "处理中..." : submitLabel}</button>
      </>
    }>
      <form id="name-dialog-form" className="space-y-3" onSubmit={submit}>
        <label className="block space-y-1.5 text-sm">
          <span>{label}</span>
          <input className="input" autoFocus value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        {error && <p className="text-sm text-app-danger">{error}</p>}
      </form>
    </Modal>
  );
}