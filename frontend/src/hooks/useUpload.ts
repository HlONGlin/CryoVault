import { useState } from "react";
import type { FileBrowseSource } from "../components/files/source";

export function useUpload(source: FileBrowseSource, folderId: number | null, onComplete: () => void) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function start(files: FileList | File[]) {
    if (!source.upload || busy) return;
    const selected = Array.from(files);
    if (!selected.length) return;
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      const results = await source.upload(selected, folderId, setProgress);
      const failures = results.filter((result) => result.error);
      if (failures.length) {
        setError(failures.map((result) => `${result.name}：${result.error}`).join("；"));
      }
      onComplete();
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      setBusy(false);
    }
  }

  return { busy, progress, error, start };
}