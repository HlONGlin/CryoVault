import { useEffect, useState } from "react";
import { Modal } from "../Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (url: string, name: string) => Promise<void>;
}

export function ImportDialog({ open, onClose, onImport }: Props) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setName("");
    setBusy(false);
    setError("");
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!/^https?:\/\//i.test(url)) { setError("请输入有效的 http 或 https 地址"); return; }
    setBusy(true);
    setError("");
    try {
      await onImport(url.trim(), name.trim());
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="从链接导入" subtitle="服务器会下载链接内容并保存到当前文件夹" footer={
      <>
        <button className="btn-outline" onClick={onClose}>取消</button>
        <button className="btn-primary" type="submit" form="import-dialog-form" disabled={busy}>{busy ? "正在导入..." : "开始导入"}</button>
      </>
    }>
      <form id="import-dialog-form" className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1.5 text-sm">
          <span>文件链接</span>
          <input className="input" type="url" autoFocus value={url} placeholder="https://example.com/file.zip" onChange={(event) => setUrl(event.target.value)} />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span>保存名称（可选）</span>
          <input className="input" value={name} placeholder="留空则使用服务端提供的文件名" onChange={(event) => setName(event.target.value)} />
        </label>
        {error && <p className="text-sm text-app-danger">{error}</p>}
      </form>
    </Modal>
  );
}