import { Folder, Link2, LockKeyhole, Moon, Settings, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { treeApi } from "../api";
import { useAuth } from "../auth";
import { panelPath } from "../base";
import { formatBytes } from "../lib/format";
import { useTheme } from "../theme";

export function Layout({ children }: {children: ReactNode}) {
  const {status, lock} = useAuth();
  const {theme, toggle} = useTheme();
  const {pathname} = useLocation();
  const navigate = useNavigate();
  const [size, setSize] = useState<number | null>(null);
  const isPublic = pathname.startsWith("/s/") || pathname.startsWith("/f/");
  const admin = status === "unlocked" && !isPublic;
  useEffect(() => { if (admin) treeApi.stats().then(s => setSize(s.total_size)).catch(() => setSize(null)); }, [admin, pathname]);
  const links = [{path: "/files", label: "文件", Icon: Folder}, {path: "/shares", label: "分享管理", Icon: Link2}, {path: "/settings", label: "设置", Icon: Settings}];
  return <div className="min-h-screen bg-app-bg text-app-text">
    <header className="flex h-14 items-center justify-between border-b border-app-border bg-app-panel px-4">
      <Link to={panelPath("/files")} className="font-bold">CryoVault</Link>
      <div className="flex items-center gap-2"><button className="btn-ghost !p-2" title={theme === "dark" ? "浅色模式" : "深色模式"} onClick={toggle}>{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button>
        {admin && <button className="btn-ghost !p-2" title="锁定管理" onClick={async () => {await lock(); navigate(panelPath("/login"));}}><LockKeyhole size={18}/></button>}</div>
    </header>
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {admin && <aside className="hidden w-52 shrink-0 flex-col border-r border-app-border p-3 md:flex"><nav className="space-y-1">{links.map(({path,label,Icon}) => <NavLink key={path} to={panelPath(path)} className={({isActive}) => `flex items-center gap-3 rounded px-3 py-2 text-sm ${isActive ? "bg-app-panel2 text-app-accent" : "text-app-muted"}`}><Icon size={17}/>{label}</NavLink>)}</nav><div className="mt-auto px-3 py-4 text-xs text-app-muted">已使用 {size === null ? "--" : formatBytes(size)}</div></aside>}
      <main className="min-w-0 flex-1 px-4 py-5 pb-24 sm:px-6 md:pb-6">{children}</main>
    </div>
    {admin && <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-app-border bg-app-panel p-2 md:hidden">{links.map(({path,label,Icon}) => <NavLink key={path} to={panelPath(path)} className={({isActive}) => `flex flex-col items-center gap-1 px-4 py-1 text-xs ${isActive ? "text-app-accent" : "text-app-muted"}`}><Icon size={19}/>{label}</NavLink>)}</nav>}
  </div>;
}
