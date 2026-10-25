import {
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Film,
  Image,
  Music,
  File as FileGlyph,
} from "lucide-react";

import type { FileItem } from "../api";
import { extension } from "../lib/format";

const CODE_EXT = new Set([
  "json", "yaml", "yml", "toml", "ini", "cfg", "conf", "js", "jsx", "ts", "tsx",
  "py", "java", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "php", "sh",
  "bash", "zsh", "sql", "html", "htm", "css", "scss", "vue", "svelte", "xml",
]);

const ARCHIVE_EXT = new Set(["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "zst"]);
const SPREADSHEET_EXT = new Set(["xls", "xlsx", "csv", "tsv", "ods"]);

export interface FileVisual {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeBg: string;
}

export function getFileVisuals(file: FileItem): FileVisual {
  const ext = extension(file.name);
  if (file.kind === "image") {
    return {
      label: "图片",
      color: "text-emerald-500 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
      borderColor: "border-emerald-200 dark:border-emerald-800/40",
      badgeBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300",
    };
  }
  if (file.kind === "video") {
    return {
      label: "视频",
      color: "text-purple-500 dark:text-purple-400",
      bgColor: "bg-purple-50 dark:bg-purple-950/30",
      borderColor: "border-purple-200 dark:border-purple-800/40",
      badgeBg: "bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-300",
    };
  }
  if (file.kind === "audio") {
    return {
      label: "音频",
      color: "text-amber-500 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-950/30",
      borderColor: "border-amber-200 dark:border-amber-800/40",
      badgeBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300",
    };
  }
  if (ARCHIVE_EXT.has(ext)) {
    return {
      label: "压缩包",
      color: "text-rose-500 dark:text-rose-400",
      bgColor: "bg-rose-50 dark:bg-rose-950/30",
      borderColor: "border-rose-200 dark:border-rose-800/40",
      badgeBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300",
    };
  }
  if (SPREADSHEET_EXT.has(ext)) {
    return {
      label: "表格",
      color: "text-teal-500 dark:text-teal-400",
      bgColor: "bg-teal-50 dark:bg-teal-950/30",
      borderColor: "border-teal-200 dark:border-teal-800/40",
      badgeBg: "bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-300",
    };
  }
  if (CODE_EXT.has(ext)) {
    return {
      label: ext.toUpperCase() || "代码",
      color: "text-cyan-500 dark:text-cyan-400",
      bgColor: "bg-cyan-50 dark:bg-cyan-950/30",
      borderColor: "border-cyan-200 dark:border-cyan-800/40",
      badgeBg: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-300",
    };
  }
  if (file.kind === "text") {
    return {
      label: ext ? ext.toUpperCase() : "文本",
      color: "text-blue-500 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-950/30",
      borderColor: "border-blue-200 dark:border-blue-800/40",
      badgeBg: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300",
    };
  }
  return {
    label: ext ? ext.toUpperCase() : "文件",
    color: "text-slate-500 dark:text-slate-400",
    bgColor: "bg-slate-100 dark:bg-slate-800/50",
    borderColor: "border-slate-200 dark:border-slate-700/50",
    badgeBg: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
}

export function FileIcon({ file, className }: { file: FileItem; className?: string }) {
  const ext = extension(file.name);
  const cls = className ?? "h-5 w-5";

  if (file.kind === "image") return <Image className={cls} />;
  if (file.kind === "video") return <Film className={cls} />;
  if (file.kind === "audio") return <Music className={cls} />;
  if (ARCHIVE_EXT.has(ext)) return <FileArchive className={cls} />;
  if (SPREADSHEET_EXT.has(ext)) return <FileSpreadsheet className={cls} />;
  if (CODE_EXT.has(ext)) return <FileCode2 className={cls} />;
  if (file.kind === "text") return <FileText className={cls} />;
  return <FileGlyph className={cls} />;
}
