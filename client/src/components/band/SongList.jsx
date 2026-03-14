import { isSafeUrl } from '../../utils/urlSafety';
import { useState, useEffect, useCallback, memo } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import SongForm from './SongForm';
import ConfirmDialog from '../common/ConfirmDialog';
import ContextMenu from '../common/ContextMenu';
import useLongPress from '../../hooks/useLongPress';
import Skeleton from '../common/Skeleton';

function PracticeIndicator({ songId, practiceSummary }) {
  const stat = practiceSummary?.songStats?.find(s => s.songId === songId);
  if (!stat?.lastPracticedAt) return null;
  const days = Math.floor((Date.now() - new Date(stat.lastPracticedAt).getTime()) / (1000 * 60 * 60 * 24));
  return (
    <span className="text-xs text-[var(--color-text-muted)]">
      {days === 0 ? 'Practiced today' : `Practiced ${days}d ago`}
    </span>
  );
}

const SongCard = memo(function SongCard({ song, onEdit, onDelete, onContextMenu, practiceSummary }) {
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const longPress = useLongPress({
    onLongPress: (pos) => onContextMenu(pos),
  });

  return (
    <div
      className="bg-[var(--color-bg-secondary)] rounded-lg p-4 hover:bg-gray-750 transition-colors border border-[var(--color-border)] group"
      {...longPress}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-[var(--color-text-primary)] font-medium truncate">{song.title}</h3>
          {song.artist && (
            <p className="text-[var(--color-text-muted)] text-sm truncate">{song.artist}</p>
          )}
          {song.shortName && (
            <p className="text-gray-500 text-xs truncate">aka "{song.shortName}"</p>
          )}
        </div>
        <div className="hidden sm:flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            title="Edit"
          >
            ✏️
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-[var(--color-text-muted)] hover:text-red-400"
            title="Delete"
          >
            🗑️
          </button>
        </div>
        <div className="relative sm:hidden ml-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMobileMenu(!showMobileMenu); }}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-lg"
            aria-label="More actions"
          >
            ...
          </button>
          {showMobileMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowMobileMenu(false); }} />
              <div className="absolute right-0 top-full mt-1 bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border)] py-1 z-50 min-w-[140px]">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowMobileMenu(false); onEdit(); }}
                  className="w-full px-4 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowMobileMenu(false); onDelete(); }}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-[var(--color-bg-tertiary)] hover:text-red-300"
                >
                  🗑️ Delete
                </button>
              </div>
            </>
          )}
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
          <span className="px-2 py-1 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded">
            {Math.floor(song.duration / 60)}:{String(song.duration % 60).padStart(2, '0')}
          </span>
        )}
      </div>

      {(song.youtubeUrl || song.spotifyUrl) && (
        <div className="flex gap-2 mt-3">
          {song.youtubeUrl && isSafeUrl(song.youtubeUrl) && (
            <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:text-red-300 text-sm">
              YouTube
            </a>
          )}
          {song.spotifyUrl && isSafeUrl(song.spotifyUrl) && (
            <a href={song.spotifyUrl} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300 text-sm">
              Spotify
            </a>
          )}
        </div>
      )}

      {song._count && song._count.setlistSongs > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] text-xs text-gray-500">
          In {song._count.setlistSongs} setlist{song._count.setlistSongs !== 1 ? 's' : ''}
        </div>
      )}

      {practiceSummary && (
        <div className={`${song._count?.setlistSongs > 0 ? 'mt-1' : 'mt-3 pt-3 border-t border-[var(--color-border)]'}`}>
          <PracticeIndicator songId={song.id} practiceSummary={practiceSummary} />
        </div>
      )}
    </div>
  );
});

function SongList({ workspaceId, onSelectSong }) {
  const toast = useToast();
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
  const [deleteSongId, setDeleteSongId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { songId, x, y }
  const [showEnrichConfirm, setShowEnrichConfirm] = useState(null); // count of songs needing data
  const [practiceSummary, setPracticeSummary] = useState(null);

  useEffect(() => {
    loadSongs();
    api.getPracticeSummary(workspaceId).then(setPracticeSummary).catch(() => {});
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
    try {
      await api.deleteSong(songId);
      setSongs(prev => prev.filter(s => s.id !== songId));
      setDeleteSongId(null);
    } catch (err) {
      toast.error(err.message);
      setDeleteSongId(null);
    }
  };

  const parseBulkText = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => {
      // Try different separators: " - ", " | ", tab, or just the title
      // Support format: "Title - ShortName - Artist" or "Title - Artist" or just "Title"
      let title, shortName, artist;

      if (line.includes(' - ')) {
        const parts = line.split(' - ').map(s => s.trim());
        if (parts.length >= 3) {
          // Title - ShortName - Artist
          title = parts[0];
          shortName = parts[1];
          artist = parts.slice(2).join(' - '); // In case artist has " - " in it
        } else {
          // Title - Artist
          [title, artist] = parts;
          shortName = null;
        }
      } else if (line.includes(' | ')) {
        const parts = line.split(' | ').map(s => s.trim());
        if (parts.length >= 3) {
          [title, shortName, artist] = parts;
        } else {
          [title, artist] = parts;
          shortName = null;
        }
      } else if (line.includes('\t')) {
        const parts = line.split('\t').map(s => s.trim());
        if (parts.length >= 3) {
          [title, shortName, artist] = parts;
        } else {
          [title, artist] = parts;
          shortName = null;
        }
      } else {
        title = line.trim();
        shortName = null;
        artist = null;
      }

      return { title, shortName: shortName || null, artist: artist || null };
    }).filter(song => song.title);
  };

  const handleBulkImport = async () => {
    const songsToImport = parseBulkText(bulkText);

    if (songsToImport.length === 0) {
      toast.warning('No valid songs found. Enter one song per line in format: "Title - Artist"');
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
      toast.error('Import failed: ' + err.message);
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
      toast('All songs already have complete metadata!');
      return;
    }

    setShowEnrichConfirm(songsNeedingData.length);
  };

  const doEnrichSongs = async () => {
    setShowEnrichConfirm(null);
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
      toast.error('Enrich failed: ' + err.message);
    } finally {
      setEnriching(false);
    }
  };

  const filteredSongs = songs
    .filter(song => {
      const query = searchQuery.toLowerCase();
      return song.title.toLowerCase().includes(query) ||
        (song.artist && song.artist.toLowerCase().includes(query)) ||
        (song.shortName && song.shortName.toLowerCase().includes(query));
    })
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'artist') return (a.artist || '').localeCompare(b.artist || '');
      if (sortBy === 'recent') return new Date(b.createdAt) - new Date(a.createdAt);
      return 0;
    });

  // Memoized callbacks for SongCard to prevent unnecessary re-renders
  const handleEditSong = useCallback((song) => {
    setEditingSong(song);
    setShowForm(true);
  }, []);

  const confirmDeleteSong = useCallback((songId) => {
    setDeleteSongId(songId);
  }, []);

  const handleContextMenu = useCallback((songId, pos) => {
    setContextMenu({ songId, ...pos });
  }, []);

  if (loading) {
    return (
      <div className="h-full flex flex-col p-4">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-8 w-24" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton.Card key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Songs</h2>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setBulkText('');
                setBulkResults(null);
                setShowBulkImport(true);
                // Check if metadata service is configured
                try {
                  const status = await api.getMetadataStatus();
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
              className="btn bg-green-600 hover:bg-green-700 text-white"
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
            className="flex-1 px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] placeholder-gray-400"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)]"
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4">{searchQuery ? '🔍' : '🎵'}</div>
            <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
              {searchQuery ? 'No songs found' : 'No songs yet'}
            </h3>
            <p className="text-[var(--color-text-muted)] max-w-sm mb-4">
              {searchQuery
                ? 'Try a different search term or clear your filters.'
                : 'Build your repertoire by adding songs one at a time, or use Bulk Import to add many at once.'}
            </p>
            {!searchQuery && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditingSong(null); setShowForm(true); }}
                  className="btn bg-green-600 hover:bg-green-700 text-white"
                >
                  + Add Song
                </button>
                <button
                  onClick={async () => {
                    setBulkText('');
                    setBulkResults(null);
                    setShowBulkImport(true);
                    try {
                      const status = await api.getMetadataStatus();
                      setMetadataConfigured(status.configured);
                      setFetchMetadata(status.configured);
                    } catch {
                      setMetadataConfigured(false);
                      setFetchMetadata(false);
                    }
                  }}
                  className="btn btn-secondary"
                >
                  Bulk Import
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSongs.map(song => (
              <SongCard
                key={song.id}
                song={song}
                practiceSummary={practiceSummary}
                onEdit={() => handleEditSong(song)}
                onDelete={() => confirmDeleteSong(song.id)}
                onContextMenu={(pos) => handleContextMenu(song.id, pos)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Song Form Modal */}
      {showForm && (
        <SongForm
          song={editingSong}
          workspaceId={workspaceId}
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
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-modal overflow-y-auto">
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
                    <li>• <code className="bg-gray-100 px-1 rounded">Full Title - Short Name - Artist</code></li>
                    <li>• <code className="bg-gray-100 px-1 rounded">Title - Artist</code></li>
                    <li>• <code className="bg-gray-100 px-1 rounded">Title</code> (no artist)</li>
                  </ul>

                  <textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder="Enter songs here...

Example:
Even Flow - Flow - Pearl Jam
Bohemian Rhapsody - Queen
Hotel California - Eagles"
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
                      className="btn bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-300 disabled:text-gray-500"
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
                      className="btn bg-green-600 hover:bg-green-700 text-white"
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

      <ConfirmDialog
        isOpen={deleteSongId !== null}
        title="Delete Song"
        message="Delete this song? It will be removed from all setlists."
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDeleteSong(deleteSongId)}
        onCancel={() => setDeleteSongId(null)}
      />

      <ConfirmDialog
        isOpen={showEnrichConfirm !== null}
        title="Fetch Metadata"
        message={`Fetch missing metadata for ${showEnrichConfirm} songs? This may take a while.`}
        confirmText="Fetch"
        onConfirm={doEnrichSongs}
        onCancel={() => setShowEnrichConfirm(null)}
      />

      <ContextMenu
        isOpen={contextMenu !== null}
        position={contextMenu || { x: 0, y: 0 }}
        onClose={() => setContextMenu(null)}
        items={[
          {
            label: 'Edit Song',
            icon: '✏️',
            onClick: () => {
              const song = songs.find(s => s.id === contextMenu?.songId);
              if (song) {
                setEditingSong(song);
                setShowForm(true);
              }
            }
          },
          {
            label: 'Delete Song',
            icon: '🗑️',
            variant: 'danger',
            onClick: () => setDeleteSongId(contextMenu?.songId)
          }
        ]}
      />
    </div>
  );
}

export default SongList;
