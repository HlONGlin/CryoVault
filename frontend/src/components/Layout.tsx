import {
  LockKeyhole,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth";
import { panelPath } from "../base";
import { useTheme } from "../theme";
import { UpdateDialog } from "./UpdateDialog";

export function Layout({ children }: { children: ReactNode }) {
  const { status, authRequired, lock } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const unlocked = status === "unlocked";
  const isPublic = pathname.startsWith("/s/") || pathname.startsWith("/f/");

  async function handleLock() {
    await lock();
    navigate(panelPath("/login"), { replace: true });
  }

  const brand = (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-bold tracking-tight text-app-text">
            CryoVault
          </span>
          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 ring-1 ring-blue-500/20 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-400/30">
            云盘
          </span>
        </div>
        <span className="hidden truncate text-[11px] font-normal text-app-faint sm:block">
          私有数据封存与分发
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col bg-app-bg text-app-text">
      <header className="sticky top-0 z-40 border-b border-app-border bg-app-panel/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3">
          {isPublic ? (
            <div className="flex min-w-0 items-center gap-3">{brand}</div>
          ) : (
            <Link
              to={panelPath(unlocked ? "/" : "/login")}
              className="group flex min-w-0 items-center gap-3"
            >
              {brand}
            </Link>
          )}

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!isPublic && <UpdateDialog />}
            {!isPublic && unlocked && (
              <Link
                to={panelPath("/settings")}
                className={`btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs ${pathname.endsWith("/settings") ? "text-app-accent" : "text-app-muted"}`}
                title="设置"
                aria-label="设置"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">设置</span>
              </Link>
            )}
            <button
              className="btn-ghost rounded-xl p-2.5 text-app-muted hover:text-app-text"
              onClick={toggle}
              title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
              aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            >
              {theme === "dark" ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4 text-amber-500" />
              )}
            </button>

            {!isPublic &&
              (unlocked ? (
                <button
                  className="btn-outline flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-app-muted hover:text-app-text sm:px-3"
                  onClick={handleLock}
                  title="锁定当前会话"
                >
                  <LockKeyhole className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">锁定管理</span>
                </button>
              ) : (
                <Link
                  to={panelPath("/login")}
                  className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs sm:px-3.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">管理解锁</span>
                </Link>
              ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-app-border py-4 pb-safe text-center text-xs text-app-faint sm:py-5">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-3 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="font-medium text-app-muted">CryoVault</span>
            <span>·</span>
            <span>Cloudreve 风格现代化云存储</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px]">
            <span>本地加密存储</span>
            <span>·</span>
            <span>极速传输</span>
            {authRequired && !isPublic && (
              <>
                <span className="hidden sm:inline">·</span>
                <span className="rounded bg-app-panel2 px-1.5 py-0.5 text-app-muted">
                  受令牌保护
                </span>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
