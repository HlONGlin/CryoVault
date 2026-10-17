import {
  Database,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  QrCode,
  ShieldCheck,
  Snowflake,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "../api";
import { useAuth } from "../auth";
import { panelPath } from "../base";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "令牌解锁",
    text: "管理端与公开分享隔离，只有持有令牌的人才能操作数据。",
  },
  {
    icon: Database,
    title: "本地封存",
    text: "文件与 SQLite 元数据全部保存在服务器本地磁盘。",
  },
  {
    icon: QrCode,
    title: "扫码交付",
    text: "分组或单个文件都能生成独立链接与二维码。",
  },
];

export function Login() {
  const { status, authRequired, unlock } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? panelPath("/");

  const [token, setToken] = useState("");
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") {
    return (
      <div className="flex h-64 items-center justify-center text-app-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (status === "unlocked") {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) {
      setError("请输入管理员令牌。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await unlock(token);
      navigate(from, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError("令牌不正确，请重新输入。");
      } else if (e instanceof ApiError && e.status === 429) {
        setError("尝试次数过多，请稍后再试。");
      } else {
        setError(e instanceof Error ? e.message : "解锁失败，请稍后重试。");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl items-center py-6 sm:py-12">
      <div className="card grid w-full overflow-hidden animate-fade-up lg:grid-cols-[1.02fr_1fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-app-border bg-app-panel2 p-8 lg:flex">
          <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-[var(--accent-soft)] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-[var(--accent-soft)] blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-app-border-strong bg-app-panel text-app-accent shadow-frost">
                <Snowflake className="h-6 w-6" />
                <span className="absolute -right-1 -top-1 h-2 w-2 animate-soft-pulse rounded-full bg-app-accent" />
              </span>
              <div className="leading-none">
                <div className="text-sm font-semibold tracking-[0.08em] text-app-text">
                  CryoVault
                </div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-app-faint">
                  Cryogenic data vault
                </div>
              </div>
            </div>

            <h2 className="mt-10 text-2xl font-semibold leading-snug tracking-wide text-app-text">
              冷封装数据，
              <br />
              只对持有令牌的人开放。
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-app-muted">
              解锁后可管理分组、上传文件，并为分组或单个文件生成二维码分享链接。
            </p>
          </div>

          <ul className="relative mt-10 space-y-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-panel text-app-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-xs font-semibold text-app-text">
                    {title}
                  </div>
                  <div className="mt-0.5 text-xs leading-relaxed text-app-faint">
                    {text}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <div className="p-6 sm:p-9">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-app-border-strong bg-app-panel2 text-app-accent shadow-frost">
              <Snowflake className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 h-2 w-2 animate-soft-pulse rounded-full bg-app-accent" />
            </span>
            <div className="leading-none">
              <div className="text-sm font-semibold tracking-[0.08em] text-app-text">
                CryoVault
              </div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-app-faint">
                Cryogenic data vault
              </div>
            </div>
          </div>

          <div className="vault-kicker flex items-center gap-2">
            <LockKeyhole className="h-3.5 w-3.5" />
            Access control
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-wide text-app-text">
            解锁数据舱
          </h1>
          <p className="mt-1 text-sm text-app-muted">
            输入管理员令牌后开始管理文件与分享。
          </p>

          {!authRequired ? (
            <div className="mt-6 space-y-4 rounded-xl border border-app-border bg-app-panel2 p-5 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-300" />
              <p className="text-sm leading-relaxed text-app-muted">
                后端未启用管理令牌（
                <code className="font-mono text-xs text-app-text">
                  CRYOVAULT_ADMIN_TOKEN
                </code>{" "}
                为空），当前无需解锁。
              </p>
              <button
                className="btn-primary w-full"
                onClick={() => navigate(from, { replace: true })}
              >
                进入管理控制台
              </button>
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-app-muted">
                  管理员令牌
                </span>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
                  <input
                    className="input pl-9 pr-10 font-mono"
                    type={visible ? "text" : "password"}
                    autoFocus
                    autoComplete="current-password"
                    placeholder="CRYOVAULT_ADMIN_TOKEN"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-app-faint transition hover:bg-app-panel3 hover:text-app-text"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? "隐藏令牌" : "显示令牌"}
                  >
                    {visible ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>

              {error && (
                <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-sm text-app-danger">
                  {error}
                </div>
              )}

              <button
                className="btn-primary w-full"
                type="submit"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                解锁管理控制台
              </button>

              <p className="text-center text-xs leading-relaxed text-app-faint">
                令牌与后端{" "}
                <code className="font-mono text-app-muted">
                  CRYOVAULT_ADMIN_TOKEN
                </code>{" "}
                一致。使用一键脚本安装时，安装完成会显示该令牌。
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
