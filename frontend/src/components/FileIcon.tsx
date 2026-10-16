import { FileArchive, FileCode2, FileText, Film, Image, Music, File as FileGlyph } from "lucide-react";

import type { FileItem } from "../api";
import { extension } from "../lib/format";

const CODE_EXT = new Set([
  "json", "yaml", "yml", "toml", "ini", "cfg", "conf", "js", "jsx", "ts", "tsx",
  "py", "java", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "php", "sh",
  "bash", "zsh", "sql", "html", "htm", "css", "scss", "vue", "svelte", "xml",
]);

const ARCHIVE_EXT = new Set(["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "zst"]);

export function FileIcon({ file, className }: { file: FileItem; className?: string }) {
  const ext = extension(file.name);
  const cls = className ?? "h-5 w-5";

  if (file.kind === "image") return <Image className={cls} />;
  if (file.kind === "video") return <Film className={cls} />;
  if (file.kind === "audio") return <Music className={cls} />;
  if (ARCHIVE_EXT.has(ext)) return <FileArchive className={cls} />;
  if (CODE_EXT.has(ext)) return <FileCode2 className={cls} />;
  if (file.kind === "text") return <FileText className={cls} />;
  return <FileGlyph className={cls} />;
}
