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
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);
  const [metadataConfigured, setMetadataConfigured] = useState(false);
  const [fetchMetadata, setFetchMetadata] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichResults, setEnrichResults] = useState(null);

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

  const parseBulkText = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => {
      // Try different separators: " - ", " | ", tab, or just the title
      let title, artist;

      if (line.includes(' - ')) {
        [title, artist] = line.split(' - ').map(s => s.trim());
      } else if (line.includes(' | ')) {
        [title, artist] = line.split(' | ').map(s => s.trim());
      } else if (line.includes('\t')) {
        [title, artist] = line.split('\t').map(s => s.trim());
      } else {
        title = line.trim();
        artist = null;
      }

      return { title, artist };
    }).filter(song => song.title);
  };

  const handleBulkImport = async () => {
    const songsToImport = parseBulkText(bulkText);

    if (songsToImport.length === 0) {
      alert('No valid songs found. Enter one song per line in format: "Title - Artist"');
      return;
    }

    setBulkImporting(true);
    setBulkResults(null);

    try {
      const results = await api.bulkImportSongs(workspaceId, songsToImport, fetchMetadata);
      setBulkResults(results);

      // Add created songs to the list
      if (results.created.length > 0) {
        setSongs(prev => [...prev, ...results.created]);
      }
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      setBulkImporting(false);
    }
  };

  const handleEnrichSongs = async () => {
    // Count songs with missing data
    const songsNeedingData = songs.filter(s =>
      !s.bpm || !s.key || !s.duration || !s.youtubeUrl || !s.spotifyUrl
    );

    if (songsNeedingData.length === 0) {
      alert('All songs already have complete metadata!');
      return;
    }

    if (!confirm(`Fetch missing metadata for ${songsNeedingData.length} songs? This may take a while.`)) {
      return;
    }

    setEnriching(true);
    setEnrichResults(null);

    try {
      const results = await api.enrichSongs(workspaceId);
      setEnrichResults(results);

      // Reload songs to get updated data
      if (results.updated > 0) {
        await loadSongs();
      }
    } catch (err) {
      alert('Enrich failed: ' + err.message);
    } finally {
      setEnriching(false);
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
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setBulkText('');
                setBulkResults(null);
                setShowBulkImport(true);
                // Check if metadata service is configured
                try {
                  const status = await api.getMetadataStatus();
                  console.log('Metadata status:', status);
                  setMetadataConfigured(status.configured);
                  setFetchMetadata(status.configured);
                } catch (err) {
                  console.error('Metadata status check failed:', err);
                  setMetadataConfigured(false);
                  setFetchMetadata(false);
                }
              }}
              className="btn btn-secondary"
            >
              Bulk Import
            </button>
            <button
              onClick={handleEnrichSongs}
              disabled={enriching || songs.length === 0}
              className="btn btn-secondary"
              title="Fetch missing BPM, key, duration, and links for existing songs"
            >
              {enriching ? 'Fetching...' : 'Fetch Missing Data'}
            </button>
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

        {enrichResults && (
          <div className="bg-blue-900/50 border border-blue-500 text-blue-200 px-4 py-3 rounded mb-4">
            <div className="flex justify-between items-start">
              <div>
                <strong>Metadata fetch complete:</strong> Updated {enrichResults.updated} of {enrichResults.processed} songs
                {enrichResults.details.length > 0 && (
                  <ul className="mt-2 text-sm max-h-32 overflow-y-auto">
                    {enrichResults.details.slice(0, 10).map((d, i) => (
                      <li key={i}>
                        {d.title}: {d.fieldsUpdated.join(', ')}
                      </li>
                    ))}
                    {enrichResults.details.length > 10 && (
                      <li className="text-blue-400">...and {enrichResults.details.length - 10} more</li>
                    )}
                  </ul>
                )}
              </div>
              <button
                onClick={() => setEnrichResults(null)}
                className="text-blue-400 hover:text-blue-200"
              >
                &times;
              </button>
            </div>
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

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Bulk Import Songs
              </h3>

              {!bulkResults ? (
                <>
                  <p className="text-gray-600 mb-4">
                    Paste your song list below. One song per line in any of these formats:
                  </p>
                  <ul className="text-sm text-gray-500 mb-4 space-y-1">
                    <li>• <code className="bg-gray-100 px-1 rounded">Song Title - Artist Name</code></li>
                    <li>• <code className="bg-gray-100 px-1 rounded">Song Title | Artist Name</code></li>
                    <li>• <code className="bg-gray-100 px-1 rounded">Song Title</code> (no artist)</li>
                  </ul>

                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder="Enter songs here...

Example:
Bohemian Rhapsody - Queen
Hotel California - Eagles
Sweet Child O' Mine - Guns N' Roses"
                    className="w-full h-64 px-3 py-2 border border-gray-300 rounded text-gray-900 font-mono text-sm"
                    disabled={bulkImporting}
                  />

                  <div className="flex items-center justify-between mt-3">
                    <div className="text-sm text-gray-500">
                      {parseBulkText(bulkText).length} songs detected
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fetchMetadata}
                        onChange={(e) => setFetchMetadata(e.target.checked)}
                        disabled={bulkImporting}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm text-gray-700">
                        <span className="text-green-600">●</span> Auto-fill metadata (BPM, key, duration, links)
                      </span>
                    </label>
                  </div>

                  {bulkImporting && fetchMetadata && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                      Fetching metadata (BPM, key, duration, YouTube, Spotify)... This may take a moment.
                    </div>
                  )}

                  <div className="flex gap-2 justify-end mt-6">
                    <button
                      type="button"
                      onClick={() => setShowBulkImport(false)}
                      className="btn btn-secondary"
                      disabled={bulkImporting}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBulkImport}
                      disabled={bulkImporting || !bulkText.trim()}
                      className="btn btn-primary"
                    >
                      {bulkImporting ? 'Importing...' : 'Import Songs'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-4">
                    {bulkResults.created.length > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <h4 className="font-medium text-green-800 mb-2">
                          {bulkResults.created.length} songs imported successfully
                          {bulkResults.metadataMatches > 0 && (
                            <span className="font-normal text-green-600 ml-2">
                              ({bulkResults.metadataMatches} with metadata)
                            </span>
                          )}
                        </h4>
                        <ul className="text-sm text-green-700 max-h-32 overflow-y-auto">
                          {bulkResults.created.map((song, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <span>{song.title}{song.artist && ` - ${song.artist}`}</span>
                              {song.bpm && <span className="text-xs bg-green-200 px-1 rounded">BPM</span>}
                              {song.key && <span className="text-xs bg-green-200 px-1 rounded">Key</span>}
                              {song.duration && <span className="text-xs bg-green-200 px-1 rounded">Dur</span>}
                              {song.youtubeUrl && <span className="text-xs bg-red-200 px-1 rounded">YT</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {bulkResults.skipped.length > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h4 className="font-medium text-yellow-800 mb-2">
                          {bulkResults.skipped.length} songs skipped (already exist)
                        </h4>
                        <ul className="text-sm text-yellow-700 max-h-32 overflow-y-auto">
                          {bulkResults.skipped.map((song, i) => (
                            <li key={i}>{song.title}{song.artist && ` - ${song.artist}`}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {bulkResults.errors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h4 className="font-medium text-red-800 mb-2">
                          {bulkResults.errors.length} errors
                        </h4>
                        <ul className="text-sm text-red-700 max-h-32 overflow-y-auto">
                          {bulkResults.errors.map((err, i) => (
                            <li key={i}>{err.song?.title || 'Unknown'}: {err.error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 justify-end mt-6">
                    <button
                      onClick={() => {
                        setBulkText('');
                        setBulkResults(null);
                      }}
                      className="btn btn-secondary"
                    >
                      Import More
                    </button>
                    <button
                      onClick={() => setShowBulkImport(false)}
                      className="btn btn-primary"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SongList;
