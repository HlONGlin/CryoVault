import { useCallback } from "react";
import type { FileItem, TextContent } from "../../api";
import { MediaPlayerModal } from "../MediaPlayerModal";
import { Modal } from "../Modal";
import { TextEditorModal } from "../TextEditorModal";
import type { FileBrowseSource } from "./source";

interface Props {
  file: FileItem | null;
  source: FileBrowseSource;
  canEdit: boolean;
  onClose: () => void;
}

export function PreviewDialogs({ file, source, canEdit, onClose }: Props) {
  const load = useCallback(
    (_item: FileItem): Promise<TextContent> => source.content(_item.id),
    [source],
  );
  const save = source.saveContent
    ? (item: FileItem, content: string, etag: string) => source.saveContent!(item.id, content, etag)
    : undefined;
  const rawUrl = file ? source.rawUrl(file.id) : "";
  const downloadUrl = file ? source.downloadUrl(file.id) : "";

  return (
    <>
      <TextEditorModal
        file={file?.kind === "text" ? file : null}
        onClose={onClose}
        load={load}
        save={canEdit ? save : undefined}
      />
      <MediaPlayerModal
        file={file && (file.kind === "video" || file.kind === "audio") ? file : null}
        src={rawUrl}
        downloadUrl={downloadUrl}
        onClose={onClose}
      />
      <Modal open={file?.kind === "image"} onClose={onClose} title={file?.name || "图片预览"} size="xl" padded={false}>
        {file && <img className="mx-auto max-h-[75vh] max-w-full object-contain" src={rawUrl} alt={file.name} />}
      </Modal>
      <Modal open={file?.kind === "other"} onClose={onClose} title={file?.name || "文件"}>
        {file && <div className="space-y-4 text-center"><p className="text-sm text-app-muted">此文件类型暂不支持网页内预览。</p><a className="btn-primary" href={downloadUrl}>下载文件</a></div>}
      </Modal>
    </>
  );
}