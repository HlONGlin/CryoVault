import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, RequireAuth } from "./auth";
import { PANEL_BASE, panelPath } from "./base";
import { Layout } from "./components/Layout";

const Files = lazy(() => import("./pages/Files").then((m) => ({ default: m.Files })));
const Shares = lazy(() => import("./pages/Shares").then((m) => ({ default: m.Shares })));
const Login = lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.Login }))
);
const NotFound = lazy(() =>
  import("./pages/NotFound").then((m) => ({ default: m.NotFound }))
);
const UnifiedSharePage = lazy(() => import("./pages/UnifiedShare").then((m) => ({ default: m.UnifiedSharePage })));
const Settings = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.Settings }))
);

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center text-app-muted">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

function AdminRoutes() {
  return (
    <Routes>
      <Route
        index
        element={
          <RequireAuth>
            <Navigate to={panelPath("/files")} replace />
          </RequireAuth>
        }
      />
      <Route path="login" element={<Login />} />
      <Route
        path="files/:folderId?"
        element={
          <RequireAuth>
            <Files />
          </RequireAuth>
        }
      />
      <Route
        path="settings"
        element={
          <RequireAuth>
            <Settings />
          </RequireAuth>
        }
      />
      <Route
        path="shares"
        element={
          <RequireAuth>
            <Shares />
          </RequireAuth>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/s/:token" element={<UnifiedSharePage />} />
            <Route path="/f/:token" element={<UnifiedSharePage />} />
            <Route path={`${PANEL_BASE}/*`} element={<AdminRoutes />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Layout>
    </AuthProvider>
  );
}
