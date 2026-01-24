import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import VerifyEmailChange from './components/auth/VerifyEmailChange';
import WorkspaceList from './components/workspaces/WorkspaceList';
import WorkspaceView from './components/workspaces/WorkspaceView';
import JoinWorkspace from './components/workspaces/JoinWorkspace';

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slack-purple flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slack-purple flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return !isAuthenticated ? children : <Navigate to="/" />;
}

function App() {
  return (
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
        element={
          <PrivateRoute>
            <WorkspaceList />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

export default App;
