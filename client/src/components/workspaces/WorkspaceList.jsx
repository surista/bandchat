import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme, themes } from '../../context/ThemeContext';
import api from '../../services/api';
import Footer from '../common/Footer';
import Modal from '../common/Modal';
import ErrorMessage from '../common/ErrorMessage';
import OnboardingWizard from './OnboardingWizard';
import WorkspaceImportWizard from './WorkspaceImportWizard';

function WorkspaceList() {
  const { user, logout } = useAuth();
  const { getWorkspaceTheme, globalTheme } = useTheme();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    setError('');
    try {
      const data = await api.getWorkspaces();
      setWorkspaces(data);

      // Auto-navigate if user has exactly one workspace
      if (data.length === 1) {
        navigate(`/workspace/${data[0].id}`, { replace: true });
        return;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinWorkspace = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const workspace = await api.joinWorkspace(inviteCode);
      setWorkspaces([...workspaces, workspace]);
      setShowJoin(false);
      setInviteCode('');
      navigate(`/workspace/${workspace.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slack-purple flex items-center justify-center">
        <div className="text-white text-xl">Loading workspaces...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slack-purple flex flex-col">
      <header className="bg-slack-purple-dark p-4 flex justify-between items-center safe-area-top">
        <div className="flex items-center gap-3">
          <img src="/bc_icon_06.png" alt="BandChat" className="w-8 h-8 rounded" />
          <h1 className="text-white text-xl font-bold">BandChat</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-300">{user?.displayName}</span>
          <button
            onClick={logout}
            className="text-gray-300 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto p-8 w-full">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-white">Your Workspaces</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="btn btn-secondary"
            >
              Import Workspace
            </button>
            <button
              onClick={() => setShowJoin(true)}
              className="btn btn-secondary"
            >
              Join Workspace
            </button>
            <button
              onClick={() => setShowOnboarding(true)}
              className="btn btn-primary"
            >
              Create Workspace
            </button>
          </div>
        </div>

        {error && workspaces.length === 0 && !showJoin ? (
          <ErrorMessage message={error} onRetry={loadWorkspaces} className="py-16" />
        ) : error ? (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-4">
            {error}
          </div>
        ) : null}

        {workspaces.length === 0 ? (
          <div className="bg-white/10 rounded-lg p-8 text-center">
            <p className="text-gray-300 mb-4">
              You're not a member of any workspaces yet.
            </p>
            <p className="text-gray-400">
              Create a new workspace for your band or join an existing one with an invite code.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaces.map((workspace) => {
              const wsThemeId = getWorkspaceTheme(workspace.id) || globalTheme;
              const wsTheme = themes[wsThemeId] || themes.default;
              return (
              <button
                key={workspace.id}
                onClick={() => {
                  setWorkspaces(prev => prev.map(w => w.id === workspace.id ? { ...w, unreadCount: 0 } : w));
                  api.markWorkspaceRead(workspace.id).catch(() => {});
                  navigate(`/workspace/${workspace.id}`);
                }}
                className="w-full bg-[var(--color-bg-secondary)] rounded-lg p-4 flex items-center justify-between hover:bg-[var(--color-bg-tertiary)] transition-colors text-left"
                style={{ borderLeft: `4px solid ${wsTheme.primary}`, borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}
              >
                <div>
                  <h3 className="font-semibold text-lg text-[var(--color-text-primary)]">
                    {workspace.name}
                  </h3>
                  <p className="text-[var(--color-text-muted)] text-sm">
                    {workspace._count?.members || 0} member{workspace._count?.members !== 1 ? 's' : ''} · {workspace._count?.channels || 0} channel{workspace._count?.channels !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {workspace.unreadCount > 0 && (
                    <span
                      className="text-xs font-bold text-white px-2 py-0.5 rounded-full min-w-[20px] text-center"
                      style={{ backgroundColor: wsTheme.primary }}
                    >
                      {workspace.unreadCount > 99 ? '99+' : workspace.unreadCount}
                    </span>
                  )}
                  <span className="text-[var(--color-text-muted)]">→</span>
                </div>
              </button>
              );
            })}
          </div>
        )}

        {/* Join Workspace Modal */}
        <Modal
          isOpen={showJoin}
          onClose={() => { setShowJoin(false); setInviteCode(''); }}
          title="Join a Workspace"
        >
          <form onSubmit={handleJoinWorkspace} className="p-6">
            <div className="mb-4">
              <label className="block text-[var(--color-text-secondary)] font-medium mb-2">
                Invite Code
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="modal-input w-full font-mono text-lg tracking-wider"
                placeholder="ABC123"
                maxLength={8}
                required
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowJoin(false);
                  setInviteCode('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Join
              </button>
            </div>
          </form>
        </Modal>
      </main>
      <Footer theme="dark" />

      {showOnboarding && (
        <OnboardingWizard
          onComplete={(workspace) => {
            setWorkspaces(prev => [...prev, workspace]);
            setShowOnboarding(false);
            navigate(`/workspace/${workspace.id}`);
          }}
          onClose={() => setShowOnboarding(false)}
        />
      )}

      {showImport && (
        <WorkspaceImportWizard
          onComplete={(workspaceId) => {
            setShowImport(false);
            navigate(`/workspace/${workspaceId}`);
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

export default WorkspaceList;
