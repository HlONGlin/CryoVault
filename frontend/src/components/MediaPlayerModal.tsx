import { Download } from "lucide-react";

import type { FileItem } from "../api";
import { Modal } from "./Modal";

interface MediaPlayerModalProps {
  file: FileItem | null;
  src: string;
  downloadUrl: string;
  onClose: () => void;
}

export function MediaPlayerModal({
  file,
  src,
  downloadUrl,
  onClose,
}: MediaPlayerModalProps) {
  const isVideo = file?.kind === "video";
  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      size={isVideo ? "xl" : "md"}
      padded={false}
      title={file?.name}
      footer={
        <>
          <a className="btn-outline" href={downloadUrl} download>
            <Download className="h-4 w-4" />
            下载
          </a>
          <button className="btn-primary" onClick={onClose}>
            关闭
          </button>
        </>
      }
    >
      <div className="flex items-center justify-center bg-black/60">
        {isVideo ? (
          <video
            key={src}
            src={src}
            controls
            autoPlay
            playsInline
            className="max-h-[70vh] w-full bg-black"
          >
            当前浏览器不支持视频播放。
          </video>
        ) : (
          <div className="w-full p-8">
            <audio key={src} src={src} controls autoPlay className="w-full" />
          </div>
        )}
      </div>
    </Modal>
  );
}
