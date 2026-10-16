import { Check, Copy, Download, ExternalLink, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";

import { shareLink } from "../api";
import { Modal } from "./Modal";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  token: string;
  groupName: string;
}

export function ShareDialog({ open, onClose, token, groupName }: ShareDialogProps) {
  const link = shareLink(token);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const el = document.createElement("textarea");
      el.value = link;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function downloadQr() {
    const canvas = wrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${groupName || "share"}-qr.png`;
    a.click();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="分享二维码"
      subtitle={groupName}
      footer={
        <>
          <button className="btn-outline" onClick={downloadQr}>
            <Download className="h-4 w-4" />
            保存二维码
          </button>
          <a className="btn-primary" href={link} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            打开
          </a>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div
          ref={wrapRef}
          className="rounded-2xl border border-white/10 bg-white p-4 shadow-glow"
        >
          <QRCodeCanvas value={link} size={208} level="M" includeMargin={false} />
        </div>
        <div className="flex w-full items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-ink-900/70 px-3 py-2">
            <QrCode className="h-4 w-4 shrink-0 text-frost-400" />
            <span className="truncate font-mono text-xs text-slate-300">{link}</span>
          </div>
          <button className="btn-outline shrink-0" onClick={copy}>
            {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
        <p className="text-center text-xs text-slate-400">
          扫码或打开链接即可浏览该分组文件，无需登录。
        </p>
      </div>
    </Modal>
  );
}
