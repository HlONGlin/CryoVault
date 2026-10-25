import { ArrowLeft, FileQuestion } from "lucide-react";
import { Link } from "react-router-dom";

import { panelPath } from "../base";

export function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="card p-8 shadow-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-500/20 dark:bg-blue-950/40 dark:text-blue-400">
          <FileQuestion className="h-8 w-8" />
        </div>
        <p className="mt-5 font-mono text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
          Error 404
        </p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-app-text">
          请求的资源或页面不存在
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-app-muted">
          该路径可能已被移动、删除，或输入的 URL 地址有误。
        </p>
        <Link to={panelPath("/")} className="btn-primary mt-6 inline-flex text-xs font-semibold">
          <ArrowLeft className="h-4 w-4" />
          <span>返回文件库主页</span>
        </Link>
      </div>
    </div>
  );
}
