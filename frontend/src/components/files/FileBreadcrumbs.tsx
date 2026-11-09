import { ChevronRight, Home } from "lucide-react";

export interface FileCrumb {
  id: number | null;
  name: string;
}

interface Props {
  items: FileCrumb[];
  onNavigate: (folderId: number | null) => void;
}

export function FileBreadcrumbs({ items, onNavigate }: Props) {
  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm scrollbar-none" aria-label="文件夹路径">
      {items.map((item, index) => (
        <span className="flex shrink-0 items-center gap-1" key={`${item.id ?? "root"}-${index}`}>
          {index > 0 && <ChevronRight size={14} className="text-app-faint" />}
          <button className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-app-panel2 ${index === items.length - 1 ? "font-medium text-app-text" : "text-app-muted"}`} onClick={() => onNavigate(item.id)}>
            {index === 0 && <Home size={14} />}
            <span className="max-w-48 truncate">{item.name}</span>
          </button>
        </span>
      ))}
    </nav>
  );
}