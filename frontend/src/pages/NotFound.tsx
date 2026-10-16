import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="card p-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-frost-400">404</p>
        <h1 className="mt-3 text-xl font-semibold text-white">页面不存在</h1>
        <p className="mt-2 text-sm text-slate-400">请检查地址，或返回 CryoVault 首页。</p>
        <Link to="/" className="btn-primary mt-6 inline-flex">
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </Link>
      </div>
    </div>
  );
}
