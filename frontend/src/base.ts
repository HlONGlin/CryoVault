declare global {
  interface Window {
    __CRYOVAULT_BASE__?: string;
  }
}

function readBase(): string {
  const raw = window.__CRYOVAULT_BASE__;
  if (!raw || !raw.startsWith("/")) return "";
  if (raw.includes("__CRYOVAULT_PANEL_BASE__")) return "";
  return raw.replace(/\/+$/, "");
}

/** Secret path prefix of the admin console, e.g. "/panel/9f3c…". */
export const PANEL_BASE = readBase();

/** Prefix an admin route with the panel base. */
export function panelPath(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${PANEL_BASE}${suffix}` || "/";
}

/** Public share routes never live under the panel base. */
export const publicPath = {
  groupShare: (token: string) => `/s/${token}`,
  fileShare: (token: string) => `/f/${token}`,
};
