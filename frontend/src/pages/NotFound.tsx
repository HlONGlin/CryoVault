import { ArrowLeft, Snowflake } from "lucide-react";
import { Link } from "react-router-dom";

import { panelPath } from "../base";

export function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="card p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-app-border bg-app-panel2 text-app-accent">
          <Snowflake className="h-7 w-7" />
        </div>
        <p className="mt-5 font-mono text-sm font-medium uppercase tracking-[0.2em] text-app-accent">
          404
        </p>
        <h1 className="mt-2 text-xl font-semibold text-app-text">页面不存在</h1>
        <p className="mt-2 text-sm text-app-muted">
          请检查地址，或返回 CryoVault 首页。
        </p>
        <Link to={panelPath("/")} className="btn-primary mt-6 inline-flex">
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </Link>
      </div>
    </div>
  );
}
