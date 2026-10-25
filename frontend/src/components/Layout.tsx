import {
  LockKeyhole,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth";
import { panelPath } from "../base";
import { useTheme } from "../theme";

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
    <div className="flex items-center gap-3">
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight text-app-text">
            CryoVault
          </span>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 ring-1 ring-blue-500/20 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-400/30">
            云盘
          </span>
        </div>
        <span className="text-[11px] font-normal text-app-faint">
          私有数据封存与分发
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col bg-app-bg text-app-text">
      <header className="sticky top-0 z-40 border-b border-app-border bg-app-panel/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {isPublic ? (
            <div className="flex items-center gap-3">{brand}</div>
          ) : (
            <Link
              to={panelPath(unlocked ? "/" : "/login")}
              className="group flex items-center gap-3"
            >
              {brand}
            </Link>
          )}

          <div className="flex items-center gap-2">
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
                  className="btn-outline flex items-center gap-1.5 px-3 py-1.5 text-xs text-app-muted hover:text-app-text"
                  onClick={handleLock}
                  title="锁定当前会话"
                >
                  <LockKeyhole className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">锁定管理</span>
                </button>
              ) : (
                <Link
                  to={panelPath("/login")}
                  className="btn-primary flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>管理解锁</span>
                </Link>
              ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-app-border py-5 text-center text-xs text-app-faint">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="font-medium text-app-muted">CryoVault</span>
            <span>·</span>
            <span>Cloudreve 风格现代化云存储</span>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span>本地加密存储</span>
            <span>·</span>
            <span>极速传输</span>
            {authRequired && !isPublic && (
              <>
                <span>·</span>
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
