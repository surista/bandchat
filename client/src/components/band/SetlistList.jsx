import { useState, useEffect } from 'react';
import api from '../../services/api';
import SetlistBuilder from './SetlistBuilder';

function SetlistList({ workspaceId }) {
  const [setlists, setSetlists] = useState([]);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingSetlist, setEditingSetlist] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState('');
  const [newSetlistDesc, setNewSetlistDesc] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [setlistsData, songsData] = await Promise.all([
        api.getSetlists(workspaceId),
        api.getSongs(workspaceId)
      ]);
      setSetlists(setlistsData);
      setSongs(songsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSetlist = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const created = await api.createSetlist(workspaceId, {
        name: newSetlistName,
        description: newSetlistDesc || null
      });
      setSetlists(prev => [created, ...prev]);
      setShowCreateModal(false);
      setNewSetlistName('');
      setNewSetlistDesc('');
      setEditingSetlist(created);
      setShowBuilder(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteSetlist = async (setlistId) => {
    if (!confirm('Delete this setlist?')) return;
    try {
      await api.deleteSetlist(setlistId);
      setSetlists(prev => prev.filter(s => s.id !== setlistId));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSetlistUpdated = (updatedSetlist) => {
    setSetlists(prev => prev.map(s => s.id === updatedSetlist.id ? updatedSetlist : s));
  };

  const calculateDuration = (setlistSongs) => {
    const totalSeconds = setlistSongs.reduce((acc, ss) => acc + (ss.song?.duration || 0), 0);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading setlists...</div>;
  }

  if (showBuilder && editingSetlist) {
    return (
      <SetlistBuilder
        setlist={editingSetlist}
        allSongs={songs}
        onBack={() => {
          setShowBuilder(false);
          setEditingSetlist(null);
          loadData();
        }}
        onUpdate={handleSetlistUpdated}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Setlists</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            + New Setlist
          </button>
        </div>
      </div>

      {/* Setlist Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}

        {setlists.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            No setlists yet. Create your first setlist!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {setlists.map(setlist => (
              <div
                key={setlist.id}
                className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors border border-gray-700"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate">{setlist.name}</h3>
                    {setlist.description && (
                      <p className="text-gray-400 text-sm truncate">{setlist.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={() => {
                        setEditingSetlist(setlist);
                        setShowBuilder(true);
                      }}
                      className="p-1 text-gray-400 hover:text-white"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteSetlist(setlist.id)}
                      className="p-1 text-gray-400 hover:text-red-400"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs mb-3">
                  <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded">
                    {setlist.songs?.length || 0} songs
                  </span>
                  {setlist.songs?.length > 0 && (
                    <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded">
                      {calculateDuration(setlist.songs)}
                    </span>
                  )}
                </div>

                {/* Song Preview */}
                <div className="space-y-1">
                  {setlist.songs?.slice(0, 3).map((ss, idx) => (
                    <div key={ss.id} className="text-sm text-gray-400 truncate">
                      {idx + 1}. {ss.song?.title}
                    </div>
                  ))}
                  {setlist.songs?.length > 3 && (
                    <div className="text-sm text-gray-500">
                      +{setlist.songs.length - 3} more...
                    </div>
                  )}
                </div>

                {setlist._count?.gigs > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
                    Used in {setlist._count.gigs} gig{setlist._count.gigs !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-900 mb-4">New Setlist</h3>
            <form onSubmit={handleCreateSetlist}>
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newSetlistName}
                  onChange={(e) => setNewSetlistName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="e.g., Friday Night Set"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={newSetlistDesc}
                  onChange={(e) => setNewSetlistDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="Optional description"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewSetlistName('');
                    setNewSetlistDesc('');
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="btn btn-primary"
                >
                  {createLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SetlistList;
