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

export const adminApi = {
  authStatus: () => request<{ auth_required: boolean }>("/admin/status"),
  verify: () => request<{ ok: boolean }>("/admin/verify"),
  login: (token: string) =>
    request<{ ok: boolean }>("/admin/session", {
      method: "POST",
      headers: { "X-Admin-Token": token },
    }),
  logout: () => request<{ ok: boolean }>("/admin/session", { method: "DELETE" }),

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
  uploadFiles: (groupId: number, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return request<FileItem[]>(`/groups/${groupId}/files`, { method: "POST", body: form });
  },

  renameFile: (fileId: number, name: string) =>
    request<FileItem>(`/files/${fileId}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteFile: (fileId: number) => request<void>(`/files/${fileId}`, { method: "DELETE" }),
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
  uploadDirectFiles: (files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return request<FileItem[]>("/direct/files", { method: "POST", body: form });
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
