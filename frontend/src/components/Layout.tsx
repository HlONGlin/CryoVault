import { KeyRound, Snowflake } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { getAdminToken, setAdminToken } from "../api";
import { Modal } from "./Modal";

export function Layout({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [token, setToken] = useState(getAdminToken());

  function save() {
    setAdminToken(token.trim());
    setSettingsOpen(false);
    window.location.reload();
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-frost-500/15 text-frost-400 ring-1 ring-frost-500/30">
              <Snowflake className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-wide text-white">CryoVault</span>
              <span className="text-[11px] text-slate-500">冷库网盘 · 分组分享</span>
            </span>
          </Link>
          <button
            className="btn-ghost"
            onClick={() => {
              setToken(getAdminToken());
              setSettingsOpen(true);
            }}
            title="管理令牌"
          >
            <KeyRound className="h-4 w-4" />
            <span className="hidden sm:inline">管理令牌</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="border-t border-white/5 py-4 text-center text-xs text-slate-600">
        CryoVault · 本地文件系统 + SQLite · 局域网自托管网盘
      </footer>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        size="sm"
        title="管理令牌"
        subtitle="与后端 CRYOVAULT_ADMIN_TOKEN 保持一致；留空表示后端未启用鉴权。"
        footer={
          <>
            <button className="btn-outline" onClick={() => setSettingsOpen(false)}>
              取消
            </button>
            <button className="btn-primary" onClick={save}>
              保存并刷新
            </button>
          </>
        }
      >
        <input
          className="input font-mono"
          type="password"
          placeholder="admin token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </Modal>
    </div>
  );
}
