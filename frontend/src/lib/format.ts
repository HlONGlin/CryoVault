import type { FileKind } from "../api";

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export function extension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export const kindMeta: Record<FileKind, { label: string; accent: string }> = {
  text: { label: "文本", accent: "text-sky-300" },
  image: { label: "图片", accent: "text-emerald-300" },
  video: { label: "视频", accent: "text-violet-300" },
  audio: { label: "音频", accent: "text-amber-300" },
  other: { label: "文件", accent: "text-slate-300" },
};

export function languageFor(name: string): string {
  switch (extension(name)) {
    case "json":
      return "json";
    case "yaml":
    case "yml":
      return "yaml";
    case "md":
    case "markdown":
      return "markdown";
    case "py":
      return "python";
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
      return "javascript";
    default:
      return "text";
  }
}
