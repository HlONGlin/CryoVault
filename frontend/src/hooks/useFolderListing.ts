import { useEffect, useState } from "react";
import type { Listing, TreeItem } from "../api";
import type { FileBrowseSource } from "../components/files/source";

interface Options {
  source: FileBrowseSource;
  folderId: number | null;
  page: number;
  query: string;
  sort: string;
  order: "asc" | "desc";
}

export function useFolderListing({ source, folderId, page, query, sort, order }: Options) {
  const [items, setItems] = useState<TreeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    source
      .list({ folderId, page, query, sort, order })
      .then((listing: Listing) => {
        if (!active) return;
        setItems(listing.items);
        setTotal(listing.total);
        setPageSize(listing.page_size);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [folderId, order, page, query, revision, sort, source]);

  return {
    items,
    total,
    pageSize,
    loading,
    error,
    refresh: () => setRevision((value) => value + 1),
  };
}