import {
  ArrowUpCircle,
  CheckCircle2,
  Download,
  RotateCw,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { adminApi, ApiError, type UpdateInfo } from "../api";
import { useAuth } from "../auth";
import { Modal } from "./Modal";

const DISMISS_KEY = "cryovault.updateIgnored";

export function UpdateDialog() {
  const { status } = useAuth();
  const unlocked = status === "unlocked";

  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [closing, setClosing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [done, setDone] = useState<{ version?: string; restarted?: boolean } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const checkedFor = useRef<string | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  const check = useCallback(
    async (force: boolean) => {
      setChecking(true);
      try {
        const result = await adminApi.checkUpdate(force);
        setInfo(result);
        setError(result.error);
        return result;
      } catch (e) {
        if (!(e instanceof ApiError) || e.status === 401) {
          setError(e instanceof Error ? e.message : String(e));
        }
        return null;
      } finally {
        setChecking(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!unlocked) {
      checkedFor.current = null;
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await check(false);
      if (cancelled || !result?.update_available) return;
      // Locked visitors see the button but must unlock before the banner pops.
      if (!unlocked) return;
      if (checkedFor.current === result.latest) return;
      checkedFor.current = result.latest;
      try {
        if (localStorage.getItem(DISMISS_KEY) === result.latest) return;
      } catch {
        /* storage unavailable */
      }
      setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [unlocked, check]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  function ignoreThisVersion() {
    if (info?.latest) {
      try {
        localStorage.setItem(DISMISS_KEY, info.latest);
      } catch {
        /* storage unavailable */
      }
    }
    setOpen(false);
  }

  function closeDialog() {
    if (applying && !done) return;
    setOpen(false);
    setClosing(false);
  }

  async function startUpdate() {
    setApplying(true);
    setClosing(false);
    setLogs([]);
    setDone(null);
    setError(null);
    try {
      await adminApi.applyUpdate((event) => {
        if (event.event === "log") {
          setLogs((prev) => [...prev, event.message]);
        } else if (event.event === "done") {
          if (event.version) setLogs((prev) => [...prev, `版本：${event.version}`]);
          if (event.changed === false) {
            setDone({ version: event.version, restarted: false });
          }
          if (event.restarted) setClosing(true);
        } else if (event.event === "error") {
          setError(event.message);
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  const latest = info?.latest;
  const available = Boolean(info?.update_available);

  return (
    <>
      {available && (
        <button
          className="btn-outline flex shrink-0 items-center gap-1.5 px-2 py-1.5 text-xs text-amber-600 hover:text-amber-500 dark:text-amber-300 sm:px-3"
          onClick={() => setOpen(true)}
          title={`发现新版本 ${latest}`}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">更新 {latest}</span>
        </button>
      )}

      <Modal
        open={open}
        onClose={closeDialog}
        title="发现新版本"
        subtitle={`当前版本 v${info?.current ?? "?"} → 最新版本 v${latest ?? "?"}`}
        size="md"
        footer={
          done ? (
            <button className="btn-primary text-xs" onClick={() => window.location.reload()}>
              <RotateCw className="h-3.5 w-3.5" />
              刷新页面
            </button>
          ) : (
            <>
              <button
                className="btn-ghost text-xs"
                onClick={() => check(true)}
                disabled={checking || applying}
              >
                <RotateCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
                重新检查
              </button>
              {!applying && (
                <button className="btn-ghost text-xs" onClick={ignoreThisVersion}>
                  跳过此版本
                </button>
              )}
              <button
                className="btn-primary text-xs"
                onClick={() => (applying ? undefined : startUpdate())}
                disabled={applying || !info?.can_apply || (done !== null && !closing)}
              >
                {applying ? (
                  <RotateCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {applying ? "正在更新…" : "立即更新"}
              </button>
            </>
          )
        }
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-xl border border-app-border bg-app-panel2/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-app-muted">当前版本</span>
              <code className="font-mono text-app-text">v{info?.current ?? "?"}</code>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-app-muted">最新版本</span>
              <code className={available ? "font-mono text-amber-500" : "font-mono text-emerald-500"}>
                {latest ? `v${latest}` : "未知"}
              </code>
            </div>
            {info?.published_at && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-app-muted">发布时间</span>
                <span className="text-app-text">
                  {new Date(info.published_at).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-app-danger">
              {error}
            </div>
          )}

          {info && !available && !error && (
            <div className="flex items-center gap-2 rounded-xl border border-app-border bg-app-panel2/50 px-3.5 py-3 text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
              当前已是最新版本
            </div>
          )}

          {available && !info?.can_apply && info?.reason && (
            <div className="flex items-start gap-2 rounded-xl border border-app-border bg-app-panel2/50 px-3.5 py-3 text-app-muted">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-app-faint" />
              <span className="leading-relaxed">{info.reason}</span>
            </div>
          )}

          {available && info?.notes && (
            <div className="max-h-40 overflow-auto rounded-xl border border-app-border bg-app-panel2/50 p-4">
              <div className="mb-1.5 font-semibold text-app-text">更新说明</div>
              <p className="whitespace-pre-wrap leading-relaxed text-app-muted">
                {info.notes}
              </p>
            </div>
          )}

          {!info?.can_apply && info?.url && (
            <a
              className="btn-outline w-full justify-center text-xs"
              href={info.url}
              target="_blank"
              rel="noreferrer"
            >
              <ArrowUpCircle className="h-3.5 w-3.5" />
              在 GitHub 查看版本说明
            </a>
          )}

          {(logs.length > 0 || applying) && (
            <div>
              <div className="mb-1.5 font-semibold text-app-text">更新日志</div>
              <pre
                ref={logRef}
                className="h-40 overflow-auto rounded-xl border border-app-border bg-app-bg p-3 font-mono text-[11px] leading-relaxed text-app-muted sm:h-48"
              >
                {logs.length ? logs.join("\n") : "正在启动更新..."}
              </pre>
            </div>
          )}

          {closing && (
            <div className="flex items-center gap-2 rounded-xl border border-app-border bg-app-panel2/50 px-3.5 py-3 text-app-text">
              <RotateCw className="h-4 w-4 animate-spin text-app-accent" />
              安装完成，服务正在重启，页面将在几秒后自动刷新…
            </div>
          )}
        </div>
      </Modal>
      {closing && <AutoReload />}
    </>
  );
}

function AutoReload() {
  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetch("/api/health", { cache: "no-store" })
        .then((res) => {
          if (res.ok) window.location.reload();
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}
