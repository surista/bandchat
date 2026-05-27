import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import WorkspaceList from './components/workspaces/WorkspaceList';
import UpdatePrompt from './components/common/UpdatePrompt';
import WhatsNewModal from './components/common/WhatsNewModal';

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

// WorkspaceView is the largest component in the app (full chat surface, sidebar,
// 80+ subroutes). Lazy-loading it shrinks the initial home/auth route bundles
// significantly — a logged-out user hitting /login no longer downloads the
// entire chat client.
const WorkspaceView = lazyRetry(() => import('./components/workspaces/WorkspaceView'));
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
const ShowPage = lazyRetry(() => import('./components/public/ShowPage'));
const BookingForm = lazyRetry(() => import('./components/public/BookingForm'));

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

  // Preserve search + hash so push-notification deep links like
  // /workspace/X?channel=Y&msg=Z survive a redirect through /login. Storing
  // just pathname (the old behavior) silently dropped query strings — clicking
  // a notification while signed out would land on the workspace shell with
  // no channel/msg selected.
  return isAuthenticated ? children : <Navigate to="/login" state={{ from: location.pathname + location.search + location.hash }} />;
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
      {/* Auto-opens after a version bump for already-authenticated users.
          Component internally guards on isAuthenticated, so it's a no-op
          while sitting on /login, /landing, etc. */}
      <WhatsNewModal />
      {/* WCAG 2.4.1: skip link lets keyboard users bypass repetitive navigation.
          Hidden until focused (sr-only -> focus:not-sr-only), then pinned at the
          top-left of the viewport so it's discoverable on first Tab. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:bg-blue-600 focus:text-white focus:px-3 focus:py-2 focus:rounded focus:shadow-lg focus:outline focus:outline-2 focus:outline-white"
      >
        Skip to main content
      </a>
      <Suspense fallback={
        <div className="min-h-screen bg-slack-purple flex items-center justify-center">
          <div className="text-white text-xl">Loading...</div>
        </div>
      }>
      <main id="main-content" tabIndex={-1}>
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
      <Route path="/show/:gigId" element={<ShowPage />} />
      <Route path="/book/:slug" element={<BookingForm />} />
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
    </main>
    </Suspense>
    </>
  );
}

export default App;
