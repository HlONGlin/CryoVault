import { Download, Edit3, ExternalLink, FolderInput, Link2, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { TreeItem } from "../../api";

export type FileAction = "open" | "download" | "share" | "rename" | "move" | "delete";

interface Props {
  item: TreeItem | null;
  position: { x: number; y: number } | null;
  canShare: boolean;
  canArchive: boolean;
  canRename: boolean;
  canMove: boolean;
  canDelete: boolean;
  onAction: (item: TreeItem, action: FileAction) => void;
  onClose: () => void;
}

export function FileActionMenu({ item, position, canShare, canArchive, canRename, canMove, canDelete, onAction, onClose }: Props) {
  useEffect(() => {
    if (!position) return;
    const close = () => onClose();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, position]);

  if (!position || !item) return null;
  const left = Math.min(position.x, window.innerWidth - 200);
  const top = Math.min(position.y, window.innerHeight - (item.type === "file" ? 260 : 220));
  const actions: { id: FileAction; label: string; icon: typeof ExternalLink; visible: boolean; danger?: boolean }[] = [
    { id: "open", label: item.type === "folder" ? "打开" : "预览", icon: ExternalLink, visible: true },
    { id: "download", label: "下载", icon: Download, visible: item.type === "file" || canArchive },
    { id: "share", label: "分享", icon: Link2, visible: canShare },
    { id: "rename", label: "重命名", icon: Edit3, visible: canRename },
    { id: "move", label: "移动到", icon: FolderInput, visible: canMove },
    { id: "delete", label: "删除", icon: Trash2, visible: canDelete, danger: true },
  ];
  return createPortal(
    <div className="fixed inset-0 z-50" onPointerDown={onClose}>
      <div className="absolute w-48 overflow-hidden rounded-xl border border-app-border bg-app-panel p-1 shadow-2xl" style={{ left, top }} onPointerDown={(event) => event.stopPropagation()}>
        {actions.filter((action) => action.visible).map(({ id, label, icon: Icon, danger }) => (
          <button key={id} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${danger ? "text-app-danger hover:bg-app-panel2" : "hover:bg-app-panel2"}`} onClick={() => onAction(item, id)}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}