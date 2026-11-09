import { Copy, ExternalLink } from "lucide-react";
import type { UnifiedShare } from "../../api";
import { QrPanel } from "../QrPanel";
import { Modal } from "../Modal";

interface Props {
  open: boolean;
  share: UnifiedShare | null;
  link: string;
  onClose: () => void;
  onCopied: () => void;
}

export function ShareLinkDialog({ open, share, link, onClose, onCopied }: Props) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      onCopied();
    } catch {
      document.querySelector<HTMLInputElement>("#share-link-value")?.select();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={share ? `分享“${share.name}”` : "分享链接"} footer={
      <>
        <button className="btn-outline" onClick={onClose}>关闭</button>
        <a className="btn-primary" href={link} target="_blank" rel="noreferrer"><ExternalLink size={16} />打开分享</a>
      </>
    }>
      <div className="space-y-5">
        <div className="flex gap-2">
          <input id="share-link-value" className="input font-mono text-xs" readOnly value={link} onFocus={(event) => event.target.select()} />
          <button className="btn-outline shrink-0" onClick={() => void copy()}><Copy size={16} />复制</button>
        </div>
        <div className="flex justify-center rounded-xl border border-app-border bg-app-panel2/40 p-4"><QrPanel link={link} name={share?.name ?? "CryoVault 分享"} /></div>
      </div>
    </Modal>
  );
}