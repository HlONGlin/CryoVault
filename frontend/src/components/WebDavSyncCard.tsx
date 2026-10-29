import { Cloud, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { adminApi, type SyncStatus } from "../api";

function reportText(status: SyncStatus): string {
  const report = status.last_report;
  if (!report) return "暂无同步记录";
  return `上传 ${report.uploaded} · 下载 ${report.downloaded} · 删除 ${
    report.deleted_local + report.deleted_remote
  } · 冲突 ${report.conflicts}`;
}

export function WebDavSyncCard() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await adminApi.syncStatus());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function testConnection() {
    setBusy(true);
    setMessage(null);
    try {
      await adminApi.testSyncConnection();
      setMessage("WebDAV 连接成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function runSync() {
    setBusy(true);
    setMessage(null);
    try {
      await adminApi.runSync();
      setMessage("同步完成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  if (!status) {
    return (
      <section className="card flex items-center gap-3 bg-app-panel p-4 text-sm text-app-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> 正在读取 WebDAV 同步状态…
      </section>
    );
  }

  return (
    <section className="card bg-app-panel p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-app-panel2 p-2 text-app-accent">
            <Cloud className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-app-text">WebDAV 双向同步</h2>
            <p className="mt-1 text-xs text-app-muted">
              {status.configured
                ? status.enabled
                  ? status.interval_seconds > 0
                    ? `已启用 · 每 ${Math.max(1, Math.round(status.interval_seconds / 60))} 分钟自动同步`
                    : "连接已启用，定时同步已暂停"
                  : "连接参数已保存，自动同步已暂停"
                : "尚未配置，请填写 WebDAV 地址、用户名和密码"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline text-xs" onClick={testConnection} disabled={busy || !status.configured}>
            测试连接
          </button>
          <button className="btn-primary text-xs" onClick={runSync} disabled={busy || !status.configured}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            立即同步
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1 text-xs text-app-muted sm:flex-row sm:items-center sm:justify-between">
        <span>{reportText(status)}</span>
        <span>冲突策略：{status.conflict_policy}</span>
      </div>
      {(message || status.last_error) && (
        <div className="mt-3 rounded-lg border border-app-border bg-app-panel2 px-3 py-2 text-xs text-app-muted">
          {message || status.last_error}
        </div>
      )}
    </section>
  );
}
