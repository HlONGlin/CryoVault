import type {
  Listing,
  ShareCreateInput,
  TextContent,
  TreeItem,
  UnifiedShare,
  UploadResult,
} from "../../api";

export interface ListingOptions {
  folderId: number | null;
  page: number;
  query: string;
  sort: string;
  order: "asc" | "desc";
}

export interface FileBrowseSource {
  list(options: ListingOptions): Promise<Listing>;
  content(fileId: number): Promise<TextContent>;
  saveContent?: (fileId: number, content: string, etag: string) => Promise<TextContent>;
  rawUrl: (fileId: number) => string;
  downloadUrl: (fileId: number) => string;
  archive?: (items: TreeItem[]) => Promise<void>;
  upload?: (files: File[], folderId: number | null, onProgress?: (percent: number) => void) => Promise<UploadResult[]>;
  createFolder?: (name: string, parentId: number | null) => Promise<unknown>;
  importLink?: (url: string, folderId: number | null, name?: string) => Promise<unknown>;
  rename?: (item: TreeItem, name: string) => Promise<unknown>;
  move?: (item: TreeItem, parentId: number | null) => Promise<unknown>;
  remove?: (item: TreeItem) => Promise<void>;
  createShare?: (item: TreeItem, input: ShareCreateInput) => Promise<UnifiedShare>;
}

export function itemKey(item: TreeItem): string {
  return `${item.type}:${item.id}`;
}