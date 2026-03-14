import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import WorkspaceList from './components/workspaces/WorkspaceList';
import WorkspaceView from './components/workspaces/WorkspaceView';
import UpdatePrompt from './components/common/UpdatePrompt';

// Lazy-loaded pages (only loaded when navigating to their routes)
function lazyRetry(importFn) {
  return lazy(() =>
    importFn().catch(() =>
      new Promise((resolve) => setTimeout(resolve, 500))
        .then(() => importFn())
        .catch(() => ({ default: () => (
          <div className="min-h-screen bg-slack-purple flex items-center justify-center">
            <div className="text-center text-white">
              <p className="mb-4">Failed to load page.</p>
              <button onClick={() => window.location.reload()} className="px-4 py-2 bg-white/20 rounded hover:bg-white/30">
                Refresh Page
              </button>
            </div>
          </div>
        )}))
    )
  );
}

const Login = lazyRetry(() => import('./components/auth/Login'));
const Signup = lazyRetry(() => import('./components/auth/Signup'));
const ForgotPassword = lazyRetry(() => import('./components/auth/ForgotPassword'));
const ResetPassword = lazyRetry(() => import('./components/auth/ResetPassword'));
const VerifyEmailChange = lazyRetry(() => import('./components/auth/VerifyEmailChange'));
const JoinWorkspace = lazyRetry(() => import('./components/workspaces/JoinWorkspace'));
const PrivacyPolicy = lazyRetry(() => import('./components/legal/PrivacyPolicy'));
const TermsOfService = lazyRetry(() => import('./components/legal/TermsOfService'));
const Support = lazyRetry(() => import('./components/legal/Support'));
const LandingPage = lazyRetry(() => import('./components/landing/LandingPage'));

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slack-purple flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" state={{ from: location.pathname }} />;
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slack-purple flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  const redirectTo = location.state?.from || '/';
  return !isAuthenticated ? children : <Navigate to={redirectTo} />;
}

function HomeRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slack-purple flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return isAuthenticated ? <WorkspaceList /> : <LandingPage />;
}

function App() {
  return (
    <>
      <UpdatePrompt />
      <Suspense fallback={
        <div className="min-h-screen bg-slack-purple flex items-center justify-center">
          <div className="text-white text-xl">Loading...</div>
        </div>
      }>
      <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <Signup />
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPassword />
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <ResetPassword />
          </PublicRoute>
        }
      />
      <Route
        path="/verify-email-change"
        element={<VerifyEmailChange />}
      />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/support" element={<Support />} />
      <Route
        path="/join/:inviteCode"
        element={
          <PrivateRoute>
            <JoinWorkspace />
          </PrivateRoute>
        }
      />
      <Route
        path="/workspace/:workspaceId/*"
        element={
          <PrivateRoute>
            <WorkspaceView />
          </PrivateRoute>
        }
      />
      <Route
        path="/"
        element={<HomeRoute />}
      />
    </Routes>
    </Suspense>
    </>
  );
}

export default App;
