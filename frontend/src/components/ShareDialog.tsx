import { ExternalLink } from "lucide-react";

import { Modal } from "./Modal";
import { QrPanel } from "./QrPanel";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  link: string;
  name: string;
  hint?: string;
}

export function ShareDialog({ open, onClose, link, name, hint }: ShareDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="分享二维码与链接"
      subtitle={name}
      footer={
        <div className="flex items-center gap-2">
          <button className="btn-outline text-xs" onClick={onClose}>
            关闭
          </button>
          <a
            className="btn-primary text-xs font-semibold"
            href={link}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>打开网页</span>
          </a>
        </div>
      }
    >
      <QrPanel link={link} name={name} hint={hint} />
    </Modal>
  );
}
