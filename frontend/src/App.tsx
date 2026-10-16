import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { GroupDetail } from "./pages/GroupDetail";
import { NotFound } from "./pages/NotFound";
import { SharePage } from "./pages/SharePage";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/s/:token" element={<SharePage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
