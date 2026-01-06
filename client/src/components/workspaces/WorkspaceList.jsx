import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

function WorkspaceList() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const data = await api.getWorkspaces();
      setWorkspaces(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const workspace = await api.createWorkspace(newWorkspaceName);
      setWorkspaces([...workspaces, workspace]);
      setShowCreate(false);
      setNewWorkspaceName('');
      navigate(`/workspace/${workspace.id}`);
    } catch (err) {
      setError(err.message);
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
    <div className="min-h-screen bg-slack-purple">
      <header className="bg-slack-purple-dark p-4 flex justify-between items-center">
        <h1 className="text-white text-xl font-bold">BandChat</h1>
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

      <main className="max-w-2xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-white">Your Workspaces</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowJoin(true)}
              className="btn btn-secondary"
            >
              Join Workspace
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary"
            >
              Create Workspace
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

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
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                onClick={() => navigate(`/workspace/${workspace.id}`)}
                className="w-full bg-white rounded-lg p-4 flex items-center justify-between hover:shadow-lg transition-shadow text-left"
              >
                <div>
                  <h3 className="font-semibold text-lg text-gray-900">
                    {workspace.name}
                  </h3>
                  <p className="text-gray-500 text-sm">
                    {workspace._count?.members || 0} members · {workspace._count?.channels || 0} channels
                  </p>
                </div>
                <span className="text-gray-400">→</span>
              </button>
            ))}
          </div>
        )}

        {/* Create Workspace Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Create a Workspace</h3>
              <form onSubmit={handleCreateWorkspace}>
                <div className="mb-4">
                  <label className="block text-gray-700 font-medium mb-2">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded"
                    placeholder="e.g., The Rockers"
                    required
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(false);
                      setNewWorkspaceName('');
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Join Workspace Modal */}
        {showJoin && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Join a Workspace</h3>
              <form onSubmit={handleJoinWorkspace}>
                <div className="mb-4">
                  <label className="block text-gray-700 font-medium mb-2">
                    Invite Code
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2 border border-gray-300 rounded font-mono text-lg tracking-wider"
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
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default WorkspaceList;
