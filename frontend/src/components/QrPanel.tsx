import { Check, Copy, Download, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";

interface QrPanelProps {
  link: string;
  name: string;
  hint?: string;
}

export function QrPanel({ link, name, hint }: QrPanelProps) {
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
    a.download = `${name || "share"}-qr.png`;
    a.click();
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={wrapRef}
        className="rounded-2xl border border-app-border bg-[var(--qr-plate)] p-4 shadow-glow"
      >
        <QRCodeCanvas value={link} size={208} level="M" includeMargin={false} />
      </div>

      <div className="flex w-full items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-app-border bg-app-panel2 px-3 py-2">
          <QrCode className="h-4 w-4 shrink-0 text-app-accent" />
          <span className="truncate font-mono text-xs text-app-muted">{link}</span>
        </div>
        <button className="btn-outline shrink-0" onClick={copy}>
          {copied ? (
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? "已复制" : "复制"}
        </button>
        <button
          className="btn-outline shrink-0 px-2.5"
          onClick={downloadQr}
          title="保存二维码"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>

      {hint && <p className="text-center text-xs text-app-muted">{hint}</p>}
    </div>
  );
}
