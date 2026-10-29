export type FileKind = "text" | "image" | "video" | "audio" | "other";

export interface FileItem {
  id: number;
  group_id: number;
  name: string;
  size: number;
  mime_type: string;
  kind: FileKind;
  created_at: string;
  updated_at: string;
}

export interface Group {
  id: number;
  name: string;
  description: string;
  share_token: string;
  allow_edit: boolean;
  created_at: string;
  file_count: number;
  total_size: number;
}

export interface ShareInfo {
  name: string;
  description: string;
  share_token: string;
  allow_edit: boolean;
}

export interface TextContent {
  name: string;
  content: string;
  updated_at: string;
}

export interface FileShareInfo {
  share_token: string;
  allow_edit: boolean;
  created_at: string;
  file: FileItem;
}

export interface PublicFileShare {
  share_token: string;
  allow_edit: boolean;
  file: FileItem;
}

export interface DirectInfo {
  group_id: number;
  files: FileItem[];
}

export interface UpdateInfo {
  current: string;
  latest: string | null;
  update_available: boolean;
  can_apply: boolean;
  reason: string | null;
  tag: string | null;
  url: string | null;
  notes: string | null;
  published_at: string | null;
  error: string | null;
  cached: boolean;
}

export type UpdateEvent =
  | { event: "log"; message: string }
  | { event: "done"; changed?: boolean; version?: string; restarted?: boolean; log?: string }
  | { event: "error"; message: string };

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  deleted_local: number;
  deleted_remote: number;
  renamed: number;
  conflicts: number;
  skipped: number;
  errors: string[];
}

export interface SyncStatus {
  configured: boolean;
  enabled: boolean;
  running: boolean;
  interval_seconds: number;
  conflict_policy: string;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_report: SyncReport | null;
  last_error: string | null;
}

export interface WebDavSettings {
  enabled: boolean;
  url: string;
  username: string;
  password_configured: boolean;
  root: string;
  interval_seconds: number;
  conflict_policy: "keep_both" | "local_wins" | "remote_wins";
  verify_tls: boolean;
  timeout: number;
}

const LEGACY_TOKEN_KEY = "cryovault.adminToken";

/** Remove the legacy localStorage token left by older versions. */
export function clearLegacyToken(): void {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (res.status === 401) {
    window.dispatchEvent(new Event("cryovault:unauthorized"));
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function uploadWithProgress<T>(
  path: string,
  files: File[],
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    files.forEach((file) => form.append("files", file));

    const abort = () => xhr.abort();
    signal?.addEventListener("abort", abort, { once: true });
    xhr.open("POST", `/api${path}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      signal?.removeEventListener("abort", abort);
      if (xhr.status === 401) {
        window.dispatchEvent(new Event("cryovault:unauthorized"));
      }
      let data: unknown;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        data = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
      } else {
        const detail =
          typeof (data as { detail?: unknown } | undefined)?.detail === "string"
            ? (data as { detail: string }).detail
            : xhr.statusText || "上传失败";
        reject(new ApiError(xhr.status, detail));
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("网络连接失败，上传未完成"));
    };
    xhr.onabort = () => {
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("上传已取消", "AbortError"));
    };
    xhr.send(form);
  });
}

export const adminApi = {
  authStatus: () => request<{ auth_required: boolean }>("/admin/status"),
  verify: () => request<{ ok: boolean }>("/admin/verify"),
  login: (token: string) =>
    request<{ ok: boolean }>("/admin/session", {
      method: "POST",
      headers: { "X-Admin-Token": token },
    }),
  logout: () => request<{ ok: boolean }>("/admin/session", { method: "DELETE" }),

  syncStatus: () => request<SyncStatus>("/admin/sync/status"),
  getWebDavSettings: () => request<WebDavSettings>("/admin/sync/settings"),
  saveWebDavSettings: (payload: WebDavSettings & { password?: string; clear_password?: boolean }) =>
    request<WebDavSettings>("/admin/sync/settings", { method: "PUT", body: JSON.stringify(payload) }),
  testSyncConnection: () => request<{ ok: boolean }>("/admin/sync/test", { method: "POST" }),
  runSync: () => request<{ ok: boolean; report: SyncReport }>("/admin/sync/run", { method: "POST" }),

  listGroups: () => request<Group[]>("/groups"),
  createGroup: (payload: { name: string; description?: string; allow_edit?: boolean }) =>
    request<Group>("/groups", { method: "POST", body: JSON.stringify(payload) }),
  getGroup: (id: number) => request<Group>(`/groups/${id}`),
  updateGroup: (
    id: number,
    payload: Partial<{ name: string; description: string; allow_edit: boolean; regenerate_token: boolean }>
  ) => request<Group>(`/groups/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteGroup: (id: number) => request<void>(`/groups/${id}`, { method: "DELETE" }),

  listFiles: (groupId: number) => request<FileItem[]>(`/groups/${groupId}/files`),
  uploadFiles: (
    groupId: number,
    files: File[],
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ) =>
    uploadWithProgress<FileItem[]>(
      `/groups/${groupId}/files`,
      files,
      onProgress,
      signal
    ),

  renameFile: (fileId: number, name: string) =>
    request<FileItem>(`/files/${fileId}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteFile: (fileId: number) => request<void>(`/files/${fileId}`, { method: "DELETE" }),
  downloadArchive: async (fileIds: number[]): Promise<Blob> => {
    const res = await fetch("/api/files/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ file_ids: fileIds }),
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const data = await res.json();
        if (typeof data?.detail === "string") detail = data.detail;
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, detail);
    }
    return res.blob();
  },
  getContent: (fileId: number) => request<TextContent>(`/files/${fileId}/content`),
  saveContent: (fileId: number, content: string) =>
    request<TextContent>(`/files/${fileId}/content`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),

  getFileShare: async (fileId: number): Promise<FileShareInfo | null> => {
    try {
      return await request<FileShareInfo | null>(`/files/${fileId}/share`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  createFileShare: (fileId: number, allowEdit = false) =>
    request<FileShareInfo>(`/files/${fileId}/share`, {
      method: "POST",
      body: JSON.stringify({ allow_edit: allowEdit }),
    }),
  deleteFileShare: (fileId: number) =>
    request<void>(`/files/${fileId}/share`, { method: "DELETE" }),

  directInfo: () => request<DirectInfo>("/direct"),
  uploadDirectFiles: (
    files: File[],
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ) => uploadWithProgress<FileItem[]>("/direct/files", files, onProgress, signal),
  importDirectLink: (url: string, name = "") =>
    request<FileItem>("/direct/import", { method: "POST", body: JSON.stringify({ url, name }) }),

  checkUpdate: (force = false) =>
    request<UpdateInfo>(`/admin/update${force ? "?force=true" : ""}`),

  /** Stream the in-place update; resolves after the final SSE event. */
  applyUpdate: async (onEvent: (event: UpdateEvent) => void): Promise<void> => {
    const res = await fetch("/api/admin/update/stream", {
      credentials: "same-origin",
      headers: { Accept: "text/event-stream" },
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const data = await res.json();
        if (typeof data?.detail === "string") detail = data.detail;
      } catch {
        /* ignore */
      }
      if (res.status === 401) {
        window.dispatchEvent(new Event("cryovault:unauthorized"));
      }
      throw new ApiError(res.status, detail);
    }
    if (!res.body) throw new Error("当前浏览器不支持流式更新输出");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf("\n\n");
      while (index !== -1) {
        const chunk = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          try {
            onEvent(JSON.parse(line.slice(5).trim()) as UpdateEvent);
          } catch {
            /* ignore malformed frame */
          }
        }
        index = buffer.indexOf("\n\n");
      }
    }
  },
};

export const shareApi = {
  info: (token: string) => request<ShareInfo>(`/share/${token}`),
  listFiles: (token: string) => request<FileItem[]>(`/share/${token}/files`),
  getContent: (token: string, fileId: number) =>
    request<TextContent>(`/share/${token}/files/${fileId}/content`),
  saveContent: (token: string, fileId: number, content: string) =>
    request<TextContent>(`/share/${token}/files/${fileId}/content`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
};

export const fileShareApi = {
  info: (token: string) => request<PublicFileShare>(`/file-share/${token}`),
  getContent: (token: string) => request<TextContent>(`/file-share/${token}/content`),
  saveContent: (token: string, content: string) =>
    request<TextContent>(`/file-share/${token}/content`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
};

export const urls = {
  adminRaw: (fileId: number) => `/api/files/${fileId}/raw`,
  adminDownload: (fileId: number) => `/api/files/${fileId}/download`,
  shareRaw: (token: string, fileId: number) => `/api/share/${token}/files/${fileId}/raw`,
  shareDownload: (token: string, fileId: number) =>
    `/api/share/${token}/files/${fileId}/download`,
  fileShareRaw: (token: string) => `/api/file-share/${token}/raw`,
  fileShareDownload: (token: string) => `/api/file-share/${token}/download`,
};

export function shareLink(token: string): string {
  return `${window.location.origin}/s/${token}`;
}

export function fileShareLink(token: string): string {
  return `${window.location.origin}/f/${token}`;
}
