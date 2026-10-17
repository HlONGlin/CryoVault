import {
  Files,
  LayoutGrid,
  LockKeyhole,
  Moon,
  ShieldCheck,
  Snowflake,
  Sun,
} from "lucide-react";
import { type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

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
    <>
      <span className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-app-border-strong bg-app-panel2 text-app-accent shadow-frost transition group-hover:border-app-accent">
        <Snowflake className="h-5 w-5" />
        <span className="absolute -right-1 -top-1 h-2 w-2 animate-soft-pulse rounded-full bg-app-accent shadow-[0_0_10px_var(--accent)]" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-[0.08em] text-app-text">
          CryoVault
        </span>
        <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-app-faint">
          Cryogenic data vault
        </span>
      </span>
    </>
  );

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-app-border bg-app-panel backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {isPublic ? (
            <span className="flex items-center gap-2.5">{brand}</span>
          ) : (
            <Link
              to={panelPath(unlocked ? "/" : "/login")}
              className="group flex items-center gap-2.5"
            >
              {brand}
            </Link>
          )}

          {unlocked && !isPublic && (
            <nav className="hidden items-center gap-1 md:flex">
              <NavLink
                to={panelPath("/")}
                end
                className={({ isActive }) =>
                  `nav-link ${isActive ? "nav-link-active" : ""}`
                }
              >
                <LayoutGrid className="h-4 w-4" />
                分组
              </NavLink>
              <NavLink
                to={panelPath("/direct")}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "nav-link-active" : ""}`
                }
              >
                <Files className="h-4 w-4" />
                单文件
              </NavLink>
            </nav>
          )}

          <div className="flex items-center gap-1.5">
            <button
              className="btn-ghost px-2.5"
              onClick={toggle}
              title={theme === "dark" ? "切换到白天模式" : "切换到夜间模式"}
              aria-label={theme === "dark" ? "切换到白天模式" : "切换到夜间模式"}
            >
              {theme === "dark" ? (
                <Moon className="h-[18px] w-[18px]" />
              ) : (
                <Sun className="h-[18px] w-[18px]" />
              )}
              <span className="hidden sm:inline">
                {theme === "dark" ? "夜间" : "白天"}
              </span>
            </button>

            {!isPublic && unlocked && (
              <Link
                to={panelPath("/direct")}
                className="btn-ghost px-2.5 md:hidden"
                title="单文件分享"
              >
                <Files className="h-[18px] w-[18px]" />
              </Link>
            )}

            {!isPublic &&
              (unlocked ? (
                <button className="btn-outline" onClick={handleLock}>
                  <LockKeyhole className="h-4 w-4" />
                  <span className="hidden sm:inline">锁定</span>
                </button>
              ) : (
                <Link to={panelPath("/login")} className="btn-outline">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">解锁</span>
                </Link>
              ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-app-border py-4 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-app-faint">
        CryoVault · cold storage protocol · local vault
        {authRequired && !isPublic && (
          <span className="ml-2 normal-case tracking-normal">
            · 管理端需要令牌解锁
          </span>
        )}
      </footer>
    </div>
  );
}
