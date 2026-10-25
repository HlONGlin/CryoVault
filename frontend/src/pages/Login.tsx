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
    color: "text-blue-500 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/40",
    title: "高强度令牌鉴权",
    text: "管理端与公开分享严格隔离，仅持有密钥的用户可操作文件与空间配置。",
  },
  {
    icon: Database,
    color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40",
    title: "本地冷封装存储",
    text: "底层完全基于主机物理磁盘与 SQLite WAL 引擎，自主可控，无第三方依赖。",
  },
  {
    icon: QrCode,
    color: "text-purple-500 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/40",
    title: "一键分享与扫码交付",
    text: "支持为单个文件或整组保险库秒级生成免登录直链与高清二维码。",
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
        <Loader2 className="h-6 w-6 animate-spin text-app-accent" />
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
    <div className="mx-auto flex w-full max-w-4xl items-center py-6 sm:py-14">
      <div className="card grid w-full overflow-hidden bg-app-panel shadow-lg lg:grid-cols-[1.1fr_1fr]">
        {/* Left Feature Showcase */}
        <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-app-border bg-app-panel2/50 p-8 lg:flex">
          <div className="pointer-events-none absolute -left-12 -top-12 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
                <Snowflake className="h-6 w-6" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold tracking-tight text-app-text">
                    CryoVault
                  </span>
                  <span className="rounded bg-blue-50 px-1.5 py-0.2 text-[10px] font-semibold text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                    安全存储
                  </span>
                </div>
                <span className="text-[11px] text-app-faint">
                  私有数据封存与安全共享
                </span>
              </div>
            </div>

            <h2 className="mt-8 text-2xl font-bold leading-snug tracking-tight text-app-text">
              极简、安全的
              <br />
              私有数据冷存系统
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-app-muted">
              基于本地文件系统与高性能元数据库，为个人与小团队提供流畅的文件存取体验。
            </p>
          </div>

          <ul className="relative mt-8 space-y-3.5">
            {FEATURES.map(({ icon: Icon, color, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-sm ${color}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-xs font-semibold text-app-text">
                    {title}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-app-muted">
                    {text}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* Right Form Card */}
        <div className="flex flex-col justify-center p-6 sm:p-10">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
              <Snowflake className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-bold text-app-text">CryoVault</div>
              <div className="text-[11px] text-app-faint">私有数据冷存系统</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <LockKeyhole className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-app-text">
              身份验证
            </h1>
          </div>
          <p className="mt-1.5 text-xs text-app-muted">
            请输入系统管理员令牌以解锁完整的管理控制台功能。
          </p>

          {!authRequired ? (
            <div className="mt-6 space-y-4 rounded-xl border border-app-border bg-app-panel2/60 p-5 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="text-xs leading-relaxed text-app-muted">
                当前服务端未配置令牌校验（
                <code className="font-mono text-xs text-app-text">
                  CRYOVAULT_ADMIN_TOKEN
                </code>{" "}
                为空），可直接进入。
              </p>
              <button
                className="btn-primary w-full text-xs"
                onClick={() => navigate(from, { replace: true })}
              >
                进入管理控制台
              </button>
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-app-text">
                  管理员令牌 (Admin Token)
                </span>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
                  <input
                    className="input pl-9 pr-10 font-mono text-xs"
                    type={visible ? "text" : "password"}
                    autoFocus
                    autoComplete="current-password"
                    placeholder="输入 CRYOVAULT_ADMIN_TOKEN"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-app-faint transition hover:bg-app-panel2 hover:text-app-text"
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
                <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs text-app-danger">
                  {error}
                </div>
              )}

              <button
                className="btn-primary w-full py-2.5 text-xs font-semibold"
                type="submit"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                <span>解锁进入控制台</span>
              </button>

              <p className="text-center text-[11px] leading-relaxed text-app-faint">
                提示：若使用一键安装脚本启动，初始密钥可在脚本输出或终端日志中查看。
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
