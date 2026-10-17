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
      title="分享二维码"
      subtitle={name}
      footer={
        <a className="btn-primary" href={link} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" />
          打开
        </a>
      }
    >
      <QrPanel link={link} name={name} hint={hint} />
    </Modal>
  );
}
