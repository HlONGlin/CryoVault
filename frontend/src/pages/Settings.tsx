import { Check, Cloud, Loader2, Save, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

import { adminApi, type WebDavSettings } from "../api";
import { WebDavSyncCard } from "../components/WebDavSyncCard";

const defaults: WebDavSettings = {
  enabled: false,
  url: "",
  username: "",
  password_configured: false,
  root: "/CryoVault",
  interval_seconds: 900,
  conflict_policy: "keep_both",
  verify_tls: true,
  timeout: 60,
};

export function Settings() {
  const [form, setForm] = useState(defaults);
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getWebDavSettings().then(setForm).catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
    }).finally(() => setLoading(false));
  }, []);

  function update<K extends keyof WebDavSettings>(key: K, value: WebDavSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await adminApi.saveWebDavSettings({
        ...form,
        password,
        clear_password: clearPassword,
      });
      setForm(saved);
      setPassword("");
      setClearPassword(false);
      setMessage("设置已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-app-muted"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-app-text"><Settings2 className="h-5 w-5" /> 设置</h1>
        <p className="mt-1 text-sm text-app-muted">配置云端同步与文件导入</p>
      </header>

      {error && <div className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-app-danger">{error}</div>}

      <section className="space-y-5 border-y border-app-border py-5" aria-labelledby="webdav-heading">
        <div className="flex items-start gap-3">
          <Cloud className="mt-0.5 h-5 w-5 text-app-accent" />
          <div>
            <h2 id="webdav-heading" className="text-base font-semibold text-app-text">WebDAV 双向同步</h2>
            <p className="mt-1 text-xs text-app-muted">凭据保存在服务端并加密；密码不会从服务端返回。</p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-app-text">
          <input type="checkbox" className="h-4 w-4 rounded accent-blue-600" checked={form.enabled} onChange={(e) => update("enabled", e.target.checked)} />
          启用定时双向同步
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-app-muted">WebDAV 地址</span>
            <input className="input" type="url" value={form.url} onChange={(e) => update("url", e.target.value)} placeholder="https://cloud.example.com/remote.php/dav/files/user" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-app-muted">用户名</span>
            <input className="input" autoComplete="username" value={form.username} onChange={(e) => update("username", e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-app-muted">{form.password_configured ? "密码（留空表示不变）" : "密码或应用密码"}</span>
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setClearPassword(false); }} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-app-muted">远端根目录</span>
            <input className="input" value={form.root} onChange={(e) => update("root", e.target.value)} placeholder="/CryoVault" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-app-muted">同步间隔（秒，0 关闭定时）</span>
            <input className="input" type="number" min={0} max={604800} value={form.interval_seconds} onChange={(e) => update("interval_seconds", Number(e.target.value))} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-app-muted">冲突处理</span>
            <select className="input" value={form.conflict_policy} onChange={(e) => update("conflict_policy", e.target.value as WebDavSettings["conflict_policy"])}>
              <option value="keep_both">保留两份</option>
              <option value="local_wins">本地覆盖远端</option>
              <option value="remote_wins">远端覆盖本地</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-app-muted">请求超时（秒）</span>
            <input className="input" type="number" min={5} max={600} value={form.timeout} onChange={(e) => update("timeout", Number(e.target.value))} />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-app-border pt-4">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs text-app-muted">
              <input type="checkbox" className="h-4 w-4 rounded accent-blue-600" checked={form.verify_tls} onChange={(e) => update("verify_tls", e.target.checked)} /> 验证 HTTPS 证书
            </label>
            {form.password_configured && <label className="flex items-center gap-2 text-xs text-app-muted"><input type="checkbox" className="h-4 w-4 rounded accent-blue-600" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} /> 清除已保存密码</label>}
          </div>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存设置
          </button>
        </div>
        {message && <p className="flex items-center gap-2 text-sm text-emerald-600"><Check className="h-4 w-4" />{message}</p>}
      </section>

      <WebDavSyncCard />
    </div>
  );
}
