import { ApiError, request, requestBlob, responseMessage, uploadWithProgress } from "./client";
import type {
  Listing,
  PublicShareInfo,
  ShareCreateInput,
  ShareUpdateInput,
  SyncReport,
  SyncStatus,
  TextContent,
  TreeItem,
  TreeStats,
  UnifiedShare,
  UpdateEvent,
  UpdateInfo,
  UploadResponse,
  WebDavSettings,
} from "./types";

export * from "./types";
export { ApiError };

export const filesApi = {
  list(folderId: number | null, page = 1, query = "", sort = "name", order: "asc" | "desc" = "asc") {
    const params = new URLSearchParams({
      page: String(page),
      page_size: "100",
      q: query,
      sort,
      order,
      ...(folderId === null ? {} : { parent_id: String(folderId) }),
    });
    return request<Listing>(`/folders?${params}`);
  },
  folder(id: number) {
    return request<TreeItem>(`/folders/${id}`) as Promise<Extract<TreeItem, { type: "folder" }>>;
  },
  createFolder(name: string, parentId: number | null) {
    return request<TreeItem>("/folders", {
      method: "POST",
      body: JSON.stringify({ name, parent_id: parentId }),
    }) as Promise<Extract<TreeItem, { type: "folder" }>>;
  },
  rename(item: TreeItem, name: string) {
    return request(`/${item.type === "folder" ? "folders" : "files"}/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },
  move(item: TreeItem, parentId: number | null) {
    return request(`/${item.type === "folder" ? "folders" : "files"}/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify(item.type === "folder" ? { parent_id: parentId } : { folder_id: parentId }),
    });
  },
  remove(item: TreeItem) {
    return request<void>(`/${item.type === "folder" ? "folders" : "files"}/${item.id}`, {
      method: "DELETE",
    });
  },
  upload(files: File[], folderId: number | null, onProgress?: (percent: number) => void, signal?: AbortSignal) {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    if (folderId !== null) form.append("folder_id", String(folderId));
    return uploadWithProgress<UploadResponse>("/files", form, onProgress, signal);
  },
  importLink(url: string, folderId: number | null, name = "") {
    return request<TreeItem>("/files/import", {
      method: "POST",
      body: JSON.stringify({ url, name, folder_id: folderId }),
    });
  },
  async downloadArchive(items: TreeItem[]) {
    const blob = await requestBlob("/files/archive", {
      method: "POST",
      body: JSON.stringify({
        file_ids: items.filter((item) => item.type === "file").map((item) => item.id),
        folder_ids: items.filter((item) => item.type === "folder").map((item) => item.id),
      }),
    });
    saveBlob(blob, "cryovault-files.zip");
  },
  stats() {
    return request<TreeStats>("/stats");
  },
  content(fileId: number) {
    return request<TextContent>(`/files/${fileId}/content`);
  },
  saveContent(fileId: number, content: string, etag: string) {
    return request<TextContent>(`/files/${fileId}/content`, {
      method: "PUT",
      body: JSON.stringify({ content, etag }),
    });
  },
  downloadUrl(fileId: number) {
    return `/api/files/${fileId}/download`;
  },
  rawUrl(fileId: number) {
    return `/api/files/${fileId}/raw`;
  },
};

export const sharesApi = {
  list() {
    return request<UnifiedShare[]>("/shares");
  },
  create(input: ShareCreateInput) {
    return request<UnifiedShare>("/shares", { method: "POST", body: JSON.stringify(input) });
  },
  update(id: number, input: ShareUpdateInput) {
    return request<UnifiedShare>(`/shares/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  remove(id: number) {
    return request<void>(`/shares/${id}`, { method: "DELETE" });
  },
  link(token: string) {
    return `${window.location.origin}/s/${token}`;
  },
};

export const publicSharesApi = {
  info(token: string) {
    return request<PublicShareInfo>(`/public/shares/${encodeURIComponent(token)}`);
  },
  unlock(token: string, password: string) {
    return request<{ ok: boolean }>(`/public/shares/${encodeURIComponent(token)}/unlock`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },
  list(token: string, folderId: number | null, page = 1, query = "", sort = "name", order: "asc" | "desc" = "asc") {
    const params = new URLSearchParams({
      page: String(page),
      page_size: "100",
      q: query,
      sort,
      order,
      ...(folderId === null ? {} : { folder_id: String(folderId) }),
    });
    return request<Listing>(`/public/shares/${encodeURIComponent(token)}/folders?${params}`);
  },
  content(token: string, fileId: number) {
    return request<TextContent>(`/public/shares/${encodeURIComponent(token)}/files/${fileId}/content`);
  },
  saveContent(token: string, fileId: number, content: string, etag: string) {
    return request<TextContent>(`/public/shares/${encodeURIComponent(token)}/files/${fileId}/content`, {
      method: "PUT",
      body: JSON.stringify({ content, etag }),
    });
  },
  rawUrl(token: string, fileId: number) {
    return `/api/public/shares/${encodeURIComponent(token)}/files/${fileId}/raw`;
  },
  downloadUrl(token: string, fileId: number) {
    return `/api/public/shares/${encodeURIComponent(token)}/files/${fileId}/download`;
  },
};

export const adminApi = {
  authStatus() {
    return request<{ auth_required: boolean }>("/admin/status");
  },
  verify() {
    return request<{ ok: boolean }>("/admin/verify");
  },
  login(token: string) {
    return request<{ ok: boolean }>("/admin/session", {
      method: "POST",
      headers: { "X-Admin-Token": token },
    });
  },
  logout() {
    return request<{ ok: boolean }>("/admin/session", { method: "DELETE" });
  },
  syncStatus() {
    return request<SyncStatus>("/admin/sync/status");
  },
  getWebDavSettings() {
    return request<WebDavSettings>("/admin/sync/settings");
  },
  saveWebDavSettings(payload: WebDavSettings & { password?: string; clear_password?: boolean }) {
    return request<WebDavSettings>("/admin/sync/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  testSyncConnection() {
    return request<{ ok: boolean }>("/admin/sync/test", { method: "POST" });
  },
  runSync() {
    return request<{ ok: boolean; report: SyncReport }>("/admin/sync/run", { method: "POST" });
  },
  checkUpdate(force = false) {
    return request<UpdateInfo>(`/admin/update${force ? "?force=true" : ""}`);
  },
  async applyUpdate(onEvent: (event: UpdateEvent) => void) {
    const response = await fetch("/api/admin/update/stream", {
      credentials: "same-origin",
      headers: { Accept: "text/event-stream" },
    });
    if (!response.ok) {
      let payload: unknown;
      try { payload = await response.json(); } catch { payload = undefined; }
      if (response.status === 401) window.dispatchEvent(new Event("cryovault:unauthorized"));
      throw new ApiError(response.status, responseMessage(payload, response.statusText || "更新失败"));
    }
    if (!response.body) throw new Error("当前浏览器不支持流式更新输出");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          try { onEvent(JSON.parse(line.slice(5).trim()) as UpdateEvent); } catch { /* ignore bad frame */ }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  },
};

export function clearLegacyToken(): void {
  try { localStorage.removeItem("cryovault.adminToken"); } catch { /* storage unavailable */ }
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}