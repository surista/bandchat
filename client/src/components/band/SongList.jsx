import { useState, useEffect } from 'react';
import api from '../../services/api';
import SongForm from './SongForm';

function SongList({ workspaceId, onSelectSong }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSong, setEditingSong] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('title');

  useEffect(() => {
    loadSongs();
  }, [workspaceId]);

  const loadSongs = async () => {
    try {
      setLoading(true);
      const data = await api.getSongs(workspaceId);
      setSongs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSong = async (songData) => {
    try {
      if (editingSong) {
        const updated = await api.updateSong(editingSong.id, songData);
        setSongs(prev => prev.map(s => s.id === updated.id ? updated : s));
      } else {
        const created = await api.createSong(workspaceId, songData);
        setSongs(prev => [...prev, created]);
      }
      setShowForm(false);
      setEditingSong(null);
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteSong = async (songId) => {
    if (!confirm('Delete this song? It will be removed from all setlists.')) return;
    try {
      await api.deleteSong(songId);
      setSongs(prev => prev.filter(s => s.id !== songId));
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredSongs = songs
    .filter(song => {
      const query = searchQuery.toLowerCase();
      return song.title.toLowerCase().includes(query) ||
        (song.artist && song.artist.toLowerCase().includes(query));
    })
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'artist') return (a.artist || '').localeCompare(b.artist || '');
      if (sortBy === 'recent') return new Date(b.createdAt) - new Date(a.createdAt);
      return 0;
    });

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading songs...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Songs</h2>
          <button
            onClick={() => {
              setEditingSong(null);
              setShowForm(true);
            }}
            className="btn btn-primary"
          >
            + Add Song
          </button>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search songs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
          >
            <option value="title">Sort by Title</option>
            <option value="artist">Sort by Artist</option>
            <option value="recent">Sort by Recent</option>
          </select>
        </div>
      </div>

      {/* Song Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}

        {filteredSongs.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            {searchQuery ? 'No songs found matching your search.' : 'No songs yet. Add your first song!'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSongs.map(song => (
              <div
                key={song.id}
                className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors border border-gray-700"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate">{song.title}</h3>
                    {song.artist && (
                      <p className="text-gray-400 text-sm truncate">{song.artist}</p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={() => {
                        setEditingSong(song);
                        setShowForm(true);
                      }}
                      className="p-1 text-gray-400 hover:text-white"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteSong(song.id)}
                      className="p-1 text-gray-400 hover:text-red-400"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  {song.key && (
                    <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded">
                      Key: {song.key}
                    </span>
                  )}
                  {song.bpm && (
                    <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded">
                      {song.bpm} BPM
                    </span>
                  )}
                  {song.duration && (
                    <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded">
                      {Math.floor(song.duration / 60)}:{String(song.duration % 60).padStart(2, '0')}
                    </span>
                  )}
                </div>

                {(song.youtubeUrl || song.spotifyUrl) && (
                  <div className="flex gap-2 mt-3">
                    {song.youtubeUrl && (
                      <a
                        href={song.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        YouTube
                      </a>
                    )}
                    {song.spotifyUrl && (
                      <a
                        href={song.spotifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-400 hover:text-green-300 text-sm"
                      >
                        Spotify
                      </a>
                    )}
                  </div>
                )}

                {song._count && (
                  <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
                    In {song._count.setlistSongs} setlist{song._count.setlistSongs !== 1 ? 's' : ''} •
                    Played {song._count.gigSongs} time{song._count.gigSongs !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Song Form Modal */}
      {showForm && (
        <SongForm
          song={editingSong}
          onSave={handleSaveSong}
          onClose={() => {
            setShowForm(false);
            setEditingSong(null);
          }}
        />
      )}
    </div>
  );
}

export default SongList;
