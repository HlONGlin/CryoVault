import { Loader2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";

import { adminApi, clearLegacyToken } from "./api";
import { panelPath } from "./base";

type AuthStatus = "loading" | "locked" | "unlocked";

interface AuthContextValue {
  status: AuthStatus;
  authRequired: boolean;
  unlock: (token: string) => Promise<void>;
  lock: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [authRequired, setAuthRequired] = useState(true);

  useEffect(() => {
    clearLegacyToken();
  }, []);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await adminApi.authStatus();
      setAuthRequired(result.auth_required);
      if (!result.auth_required) {
        setStatus("unlocked");
        return;
      }
      try {
        await adminApi.verify();
        setStatus("unlocked");
      } catch {
        setStatus("locked");
      }
    } catch {
      setStatus("locked");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => setStatus("locked");
    window.addEventListener("cryovault:unauthorized", onUnauthorized);
    return () => window.removeEventListener("cryovault:unauthorized", onUnauthorized);
  }, []);

  const unlock = useCallback(async (token: string) => {
    try {
      await adminApi.login(token.trim());
      await adminApi.verify();
      setStatus("unlocked");
    } catch (e) {
      setStatus("locked");
      throw e;
    }
  }, []);

  const lock = useCallback(async () => {
    try {
      await adminApi.logout();
    } catch {
      /* cookie may already be gone */
    }
    setStatus("locked");
  }, []);

  const value = useMemo(
    () => ({ status, authRequired, unlock, lock, refresh }),
    [status, authRequired, unlock, lock, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="flex h-64 items-center justify-center text-app-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (status === "locked") {
    return <Navigate to={panelPath("/login")} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
