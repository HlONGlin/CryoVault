export type FileKind = "text" | "image" | "video" | "audio" | "other";

export interface FileItem {
  type: "file";
  id: number;
  group_id?: number | null;
  folder_id: number | null;
  name: string;
  size: number;
  mime_type: string;
  kind: FileKind;
  created_at: string;
  updated_at: string;
}

export interface FolderItem {
  type: "folder";
  id: number;
  parent_id: number | null;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  file_count: number;
  total_size: number;
}

export type TreeItem = FolderItem | FileItem;

export interface Listing {
  items: TreeItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface TextContent {
  name: string;
  content: string;
  updated_at: string;
  etag: string;
}

export interface TreeStats {
  file_count: number;
  total_size: number;
}

export interface UploadResult {
  name: string;
  file: FileItem | null;
  error: string | null;
}

export interface UploadResponse {
  results: UploadResult[];
}

export type ShareTargetType = "file" | "folder";

export interface UnifiedShare {
  id: number;
  token: string;
  target_type: ShareTargetType;
  file_id: number | null;
  folder_id: number | null;
  name: string;
  allow_edit: boolean;
  expires_at: string | null;
  password_required: boolean;
  created_at: string;
}

export interface LockedPublicShare {
  password_required: true;
}

export type PublicShareInfo =
  | LockedPublicShare
  | (UnifiedShare & { password_required: false; file: FileItem | null });

export interface ShareCreateInput {
  target_type: ShareTargetType;
  file_id?: number;
  folder_id?: number;
  allow_edit?: boolean;
  expires_at?: string | null;
  password?: string | null;
}

export interface ShareUpdateInput {
  allow_edit?: boolean;
  expires_at?: string | null;
  password?: string | null;
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