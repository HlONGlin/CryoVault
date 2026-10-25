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
      {/* High Quality Centered QR Code Card */}
      <div
        ref={wrapRef}
        className="rounded-2xl border border-app-border bg-white p-3 shadow-sm dark:bg-white sm:p-4"
      >
        <QRCodeCanvas
          value={link}
          size={200}
          level="M"
          includeMargin={false}
          className="h-auto w-full max-w-[200px]"
        />
      </div>

      {/* Action Bar (Link bar, Copy & Download) */}
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-app-border bg-app-panel2 px-3 py-2 text-xs">
          <QrCode className="h-4 w-4 shrink-0 text-app-accent" />
          <span className="truncate font-mono text-app-muted select-all">
            {link}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="btn-outline flex-1 text-xs font-medium sm:flex-none"
            onClick={copy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copied ? "已复制" : "复制链接"}</span>
          </button>
          <button
            className="btn-outline shrink-0 p-2 text-app-muted hover:text-app-text"
            onClick={downloadQr}
            title="保存二维码图片"
            aria-label="保存二维码图片"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {hint && (
        <p className="text-center text-xs leading-relaxed text-app-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
