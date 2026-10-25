import { Download, Film, Music } from "lucide-react";

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
      title={
        <div className="flex items-center gap-2">
          {isVideo ? (
            <Film className="h-4 w-4 text-purple-500" />
          ) : (
            <Music className="h-4 w-4 text-amber-500" />
          )}
          <span className="truncate">{file?.name}</span>
        </div>
      }
      footer={
        <div className="flex items-center gap-2">
          <a
            className="btn-outline text-xs"
            href={downloadUrl}
            download
          >
            <Download className="h-3.5 w-3.5" />
            <span>下载原文件</span>
          </a>
          <button className="btn-primary text-xs" onClick={onClose}>
            关闭
          </button>
        </div>
      }
    >
      <div className="flex items-center justify-center bg-black/90">
        {isVideo ? (
          <video
            key={src}
            src={src}
            controls
            autoPlay
            playsInline
            className="max-h-[72vh] w-full bg-black shadow-lg"
          >
            当前浏览器暂不支持在线视频播放。
          </video>
        ) : (
          <div className="w-full bg-app-panel p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 ring-1 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-400">
              <Music className="h-7 w-7" />
            </div>
            <p className="mb-4 text-sm font-semibold text-app-text">{file?.name}</p>
            <audio key={src} src={src} controls autoPlay className="w-full" />
          </div>
        )}
      </div>
    </Modal>
  );
}
