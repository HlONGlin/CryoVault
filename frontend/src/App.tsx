import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { AuthProvider, RequireAuth } from "./auth";
import { PANEL_BASE } from "./base";
import { Layout } from "./components/Layout";

const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.Dashboard }))
);
const DirectShare = lazy(() =>
  import("./pages/DirectShare").then((m) => ({ default: m.DirectShare }))
);
const GroupDetail = lazy(() =>
  import("./pages/GroupDetail").then((m) => ({ default: m.GroupDetail }))
);
const Login = lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.Login }))
);
const NotFound = lazy(() =>
  import("./pages/NotFound").then((m) => ({ default: m.NotFound }))
);
const PublicFile = lazy(() =>
  import("./pages/PublicFile").then((m) => ({ default: m.PublicFile }))
);
const SharePage = lazy(() =>
  import("./pages/SharePage").then((m) => ({ default: m.SharePage }))
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
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route path="login" element={<Login />} />
      <Route
        path="groups/:id"
        element={
          <RequireAuth>
            <GroupDetail />
          </RequireAuth>
        }
      />
      <Route
        path="direct"
        element={
          <RequireAuth>
            <DirectShare />
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
            <Route path="/s/:token" element={<SharePage />} />
            <Route path="/f/:token" element={<PublicFile />} />
            <Route path={`${PANEL_BASE}/*`} element={<AdminRoutes />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Layout>
    </AuthProvider>
  );
}
