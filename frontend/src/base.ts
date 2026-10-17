declare global {
  interface Window {
    __CRYOVAULT_BASE__?: string;
  }
}

const PANEL_SEGMENT = /^(\/panel\/[0-9A-Za-z._-]+)/;

function readBase(): string {
  const raw = window.__CRYOVAULT_BASE__;
  if (raw && raw.startsWith("/") && !raw.includes("__CRYOVAULT_PANEL_BASE__")) {
    return raw.replace(/\/+$/, "");
  }
  // Fallback for a stale build or when the page is served outside the backend
  // template: infer the secret prefix from the current URL.
  const match = window.location.pathname.match(PANEL_SEGMENT);
  return match ? match[1] : "";
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
