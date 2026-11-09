import { useState } from "react";
import { Modal } from "../Modal";

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmDialog({ open, title, description, confirmLabel = "确认", onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
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
        <button className="btn-outline" onClick={onClose}>取消</button>
        <button className="btn-danger" onClick={() => void confirm()} disabled={busy}>{busy ? "处理中..." : confirmLabel}</button>
      </>
    }>
      <p className="text-sm leading-6 text-app-muted">{description}</p>
      {error && <p className="mt-3 text-sm text-app-danger">{error}</p>}
    </Modal>
  );
}