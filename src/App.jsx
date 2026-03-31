import { Navigate, Route, Routes } from "react-router-dom";

import { PortalLayout } from "./components/layout/PortalLayout";
import { AspirantProgressProvider } from "./context/AspirantProgressContext";
import { AuthProvider, useAuthContext } from "./context/AuthContext";
import { NewsProvider } from "./context/NewsContext";
import { AdminConsolePage } from "./pages/AdminConsolePage";
import { AdminGeneratedDetailPage } from "./pages/AdminGeneratedDetailPage";
import { AspirantNewsPage } from "./pages/AspirantNewsPage";
import { AspirantQuizFlowPage } from "./pages/AspirantQuizFlowPage";
import { AspirantStaticGKPage } from "./pages/AspirantStaticGKPage";
import { LoginPage } from "./pages/LoginPage";

function HomeRedirect() {
  const { isAuthenticated, user } = useAuthContext();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={`/${user.role}`} replace />;
}

function ProtectedRoute({ role, children }) {
  const { isAuthenticated, user } = useAuthContext();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (role && user?.role !== role) {
    return <Navigate to={`/${user.role}`} replace />;
  }
  return children;
}

function LoginRoute() {
  const { isAuthenticated, user } = useAuthContext();
  if (isAuthenticated) {
    return <Navigate to={`/${user.role}`} replace />;
  }
  return <LoginPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <PortalLayout role="admin">
              <AdminConsolePage />
            </PortalLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/content/:itemId"
        element={
          <ProtectedRoute role="admin">
            <PortalLayout role="admin">
              <AdminGeneratedDetailPage />
            </PortalLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/aspirant"
        element={
          <ProtectedRoute role="aspirant">
            <PortalLayout role="aspirant">
              <AspirantNewsPage />
            </PortalLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/aspirant/static-gk"
        element={
          <ProtectedRoute role="aspirant">
            <PortalLayout role="aspirant">
              <AspirantStaticGKPage />
            </PortalLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/aspirant/quiz"
        element={
          <ProtectedRoute role="aspirant">
            <PortalLayout role="aspirant">
              <AspirantQuizFlowPage />
            </PortalLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <NewsProvider>
        <AspirantProgressProvider>
          <AppRoutes />
        </AspirantProgressProvider>
      </NewsProvider>
    </AuthProvider>
  );
}

export default App;
