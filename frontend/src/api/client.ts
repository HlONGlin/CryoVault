export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function responseMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const value = data as { detail?: unknown; error?: { message?: unknown } | string };
  if (typeof value.error === "string") return value.error;
  if (value.error && typeof value.error === "object" && typeof value.error.message === "string") {
    return value.error.message;
  }
  if (typeof value.detail === "string") return value.detail;
  if (Array.isArray(value.detail)) {
    return value.detail
      .map((entry) => {
        if (!entry || typeof entry !== "object") return String(entry);
        return typeof (entry as { msg?: unknown }).msg === "string"
          ? (entry as { msg: string }).msg
          : JSON.stringify(entry);
      })
      .join("；");
  }
  return fallback;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event("cryovault:unauthorized"));
  }
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    throw new ApiError(response.status, responseMessage(payload, response.statusText || "请求失败"));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal?.addEventListener("abort", abort, { once: true });
    xhr.open("POST", `/api${path}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      signal?.removeEventListener("abort", abort);
      let payload: unknown;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        payload = undefined;
      }
      if (xhr.status === 401) window.dispatchEvent(new Event("cryovault:unauthorized"));
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as T);
      } else {
        reject(new ApiError(xhr.status, responseMessage(payload, xhr.statusText || "上传失败")));
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
export async function requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin" });
  if (response.status === 401) window.dispatchEvent(new Event("cryovault:unauthorized"));
  if (!response.ok) {
    let payload: unknown;
    try { payload = await response.json(); } catch { payload = undefined; }
    throw new ApiError(response.status, responseMessage(payload, response.statusText || "请求失败"));
  }
  return response.blob();
}