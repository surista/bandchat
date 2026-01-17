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
  const [showImportModal, setShowImportModal] = useState(false);
  const [importName, setImportName] = useState('');
  const [importText, setImportText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [viewingSetlist, setViewingSetlist] = useState(null);

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

  const parseSongLine = (line) => {
    let title, artist;
    if (line.includes(' - ')) {
      [title, artist] = line.split(' - ').map(s => s.trim());
    } else if (line.includes(' | ')) {
      [title, artist] = line.split(' | ').map(s => s.trim());
    } else if (line.includes('\t')) {
      [title, artist] = line.split('\t').map(s => s.trim());
    } else {
      // Remove leading numbers like "1. " or "1) "
      title = line.replace(/^\d+[\.\)]\s*/, '').trim();
      artist = null;
    }
    return { title, artist };
  };

  const parseImportText = (text) => {
    const lines = text.split('\n').filter(line => line.trim());

    // Detect set markers (e.g., "Set 1", "SET 1:", "--- Set 1 ---", "First Set", etc.)
    const setMarkerRegex = /^[-=]*\s*(set\s*(\d+)|first\s+set|second\s+set|third\s+set|encore)[\s:]*[-=]*$/i;
    const sets = [];
    let currentSet = { setNumber: 1, songs: [] };

    for (const line of lines) {
      const markerMatch = line.match(setMarkerRegex);
      if (markerMatch) {
        // Save current set if it has songs
        if (currentSet.songs.length > 0) {
          sets.push(currentSet);
        }

        // Determine set number
        let setNumber;
        const numMatch = markerMatch[2];
        if (numMatch) {
          setNumber = parseInt(numMatch);
        } else if (/first/i.test(line)) {
          setNumber = 1;
        } else if (/second/i.test(line)) {
          setNumber = 2;
        } else if (/third/i.test(line)) {
          setNumber = 3;
        } else if (/encore/i.test(line)) {
          setNumber = sets.length + 2; // Encore is usually after all sets
        } else {
          setNumber = sets.length + 1;
        }

        currentSet = { setNumber, songs: [] };
      } else {
        const song = parseSongLine(line);
        if (song.title) {
          currentSet.songs.push(song);
        }
      }
    }

    // Add final set
    if (currentSet.songs.length > 0) {
      sets.push(currentSet);
    }

    return sets;
  };

  const handleImportSetlist = async (e) => {
    e.preventDefault();
    const sets = parseImportText(importText);
    const totalSongs = sets.reduce((sum, s) => sum + s.songs.length, 0);

    if (totalSongs === 0) {
      alert('No songs found. Enter one song per line.');
      return;
    }

    setImportLoading(true);
    setImportResults(null);

    try {
      // Check if it's a multi-set import
      const isMultiSet = sets.length > 1;

      if (isMultiSet) {
        const result = await api.importMultiSetlist(workspaceId, importName, sets);
        setImportResults({ ...result.results, isMultiSet: true });

        // Add the created setlist (now returns single setlist with SET_BREAK markers)
        setSetlists(prev => [result.setlist, ...prev]);

        if (result.results.totalNotFound === 0) {
          setShowImportModal(false);
          setImportName('');
          setImportText('');
          setImportResults(null);
          setEditingSetlist(result.setlist);
          setShowBuilder(true);
        }
      } else {
        // Single set import
        const result = await api.importSetlist(workspaceId, importName, sets[0].songs);
        setImportResults(result.results);
        setSetlists(prev => [result.setlist, ...prev]);

        if (result.results.notFound.length === 0) {
          setShowImportModal(false);
          setImportName('');
          setImportText('');
          setImportResults(null);
          setEditingSetlist(result.setlist);
          setShowBuilder(true);
        }
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const calculateDuration = (setlistSongs) => {
    const totalSeconds = setlistSongs.reduce((acc, ss) => {
      if (ss.type === 'SET_BREAK') return acc;
      if (ss.type === 'MC') return acc + (ss.duration || 60);
      return acc + (ss.song?.duration || 0);
    }, 0);
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
          <div className="flex gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="btn btn-secondary"
            >
              Import Setlist
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              + New Setlist
            </button>
          </div>
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
                onClick={() => setViewingSetlist(setlist)}
                className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors border border-gray-700 cursor-pointer"
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
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSetlist(setlist);
                        setShowBuilder(true);
                      }}
                      className="p-1 text-gray-400 hover:text-white"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSetlist(setlist.id);
                      }}
                      className="p-1 text-gray-400 hover:text-red-400"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs mb-3">
                  {(() => {
                    const actualSongs = setlist.songs?.filter(s => s.type !== 'SET_BREAK' && s.type !== 'MC') || [];
                    const setBreaks = setlist.songs?.filter(s => s.type === 'SET_BREAK') || [];
                    return (
                      <>
                        <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded">
                          {actualSongs.length} songs
                        </span>
                        {setBreaks.length > 1 && (
                          <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded">
                            {setBreaks.length} sets
                          </span>
                        )}
                      </>
                    );
                  })()}
                  {setlist.songs?.length > 0 && (
                    <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded">
                      {calculateDuration(setlist.songs)}
                    </span>
                  )}
                </div>

                {/* Song Preview */}
                <div className="space-y-1">
                  {(() => {
                    const previewItems = setlist.songs?.filter(s => s.type !== 'MC') || [];
                    let songNum = 0;
                    return previewItems.slice(0, 4).map((ss) => {
                      if (ss.type === 'SET_BREAK') {
                        return (
                          <div key={ss.id} className="text-sm text-blue-400 font-medium truncate">
                            📋 {ss.label || 'Set Break'}
                          </div>
                        );
                      }
                      songNum++;
                      return (
                        <div key={ss.id} className="text-sm text-gray-400 truncate">
                          {songNum}. {ss.song?.title}
                        </div>
                      );
                    });
                  })()}
                  {(() => {
                    const actualSongs = setlist.songs?.filter(s => s.type !== 'SET_BREAK' && s.type !== 'MC') || [];
                    return actualSongs.length > 3 && (
                      <div className="text-sm text-gray-500">
                        +{actualSongs.length - 3} more...
                      </div>
                    );
                  })()}
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
                  className="btn bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {createLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Import Setlist</h3>

            {!importResults ? (
              <form onSubmit={handleImportSetlist}>
                <div className="mb-4">
                  <label className="block text-gray-700 font-medium mb-1">
                    Setlist Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                    placeholder="e.g., Saturday Night Set"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-gray-700 font-medium mb-1">
                    Songs (one per line)
                  </label>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={"Set 1\nSong Title - Artist\nAnother Song\n\nSet 2\nMore Songs...\n\n(Or just songs without set markers)"}
                    className="w-full h-48 px-3 py-2 border border-gray-300 rounded text-gray-900 font-mono text-sm"
                    required
                  />
                  <p className="text-gray-500 text-xs mt-1">
                    Use "Set 1", "Set 2" markers for multi-set gigs. Songs matched to your library.
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportModal(false);
                      setImportName('');
                      setImportText('');
                    }}
                    className="btn btn-secondary"
                    disabled={importLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={importLoading || !importName.trim() || !importText.trim()}
                    className="btn bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-300 disabled:text-gray-500"
                  >
                    {importLoading ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="mb-4">
                  {importResults.isMultiSet ? (
                    // Multi-set results
                    <>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                        <h4 className="font-medium text-green-800 mb-2">
                          Setlist created with {importResults.sets?.length || 0} sets • {importResults.totalMatched} songs matched
                        </h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {importResults.sets?.map((setResult, i) => (
                            <div key={i} className="text-sm">
                              <span className="font-medium text-green-700">Set {setResult.setNumber}:</span>
                              <span className="text-green-600 ml-2">{setResult.matched.length} songs</span>
                              {setResult.notFound.length > 0 && (
                                <span className="text-yellow-600 ml-2">({setResult.notFound.length} not found)</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {importResults.totalNotFound > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <h4 className="font-medium text-yellow-800 mb-2">
                            {importResults.totalNotFound} songs not found
                          </h4>
                          <p className="text-sm text-yellow-700">
                            Add missing songs to your library first.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    // Single set results
                    <>
                      {importResults.matched?.length > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                          <h4 className="font-medium text-green-800 mb-2">
                            {importResults.matched.length} songs matched
                          </h4>
                          <ul className="text-sm text-green-700 max-h-32 overflow-y-auto">
                            {importResults.matched.map((m, i) => (
                              <li key={i}>{m.song.title}{m.song.artist && ` - ${m.song.artist}`}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {importResults.notFound?.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <h4 className="font-medium text-yellow-800 mb-2">
                            {importResults.notFound.length} songs not found
                          </h4>
                          <p className="text-sm text-yellow-700 mb-2">
                            These songs are not in your library.
                          </p>
                          <ul className="text-sm text-yellow-700 max-h-32 overflow-y-auto">
                            {importResults.notFound.map((s, i) => (
                              <li key={i}>{s.title}{s.artist && ` - ${s.artist}`}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportName('');
                      setImportText('');
                      setImportResults(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportName('');
                      setImportText('');
                      setImportResults(null);
                      const newSetlist = setlists[0];
                      if (newSetlist) {
                        setEditingSetlist(newSetlist);
                        setShowBuilder(true);
                      }
                    }}
                    className="btn bg-green-600 hover:bg-green-700 text-white"
                  >
                    Edit Setlist
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View Setlist Modal */}
      {viewingSetlist && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setViewingSetlist(null)}
        >
          <div
            className="bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-gray-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">{viewingSetlist.name}</h3>
                {viewingSetlist.description && (
                  <p className="text-gray-400 text-sm">{viewingSetlist.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingSetlist(viewingSetlist);
                    setShowBuilder(true);
                    setViewingSetlist(null);
                  }}
                  className="btn btn-secondary text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => setViewingSetlist(null)}
                  className="text-gray-400 hover:text-white text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Stats */}
              <div className="flex flex-wrap gap-2 text-xs mb-4">
                {(() => {
                  const actualSongs = viewingSetlist.songs?.filter(s => s.type !== 'SET_BREAK' && s.type !== 'MC') || [];
                  const setBreaks = viewingSetlist.songs?.filter(s => s.type === 'SET_BREAK') || [];
                  return (
                    <>
                      <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded">
                        {actualSongs.length} songs
                      </span>
                      {setBreaks.length > 1 && (
                        <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded">
                          {setBreaks.length} sets
                        </span>
                      )}
                      <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded">
                        {calculateDuration(viewingSetlist.songs || [])}
                      </span>
                    </>
                  );
                })()}
              </div>

              {/* Song List */}
              <div className="space-y-1">
                {(() => {
                  let songNum = 0;
                  return viewingSetlist.songs?.map((item) => {
                    if (item.type === 'SET_BREAK') {
                      songNum = 0; // Reset numbering for each set
                      return (
                        <div key={item.id} className="py-2 mt-3 first:mt-0 border-b border-blue-500/30">
                          <span className="text-blue-400 font-bold">📋 {item.label || 'Set Break'}</span>
                        </div>
                      );
                    }
                    if (item.type === 'MC') {
                      return (
                        <div key={item.id} className="flex items-center gap-3 py-2 text-yellow-400">
                          <span className="w-8 text-right text-gray-500">•</span>
                          <span>🎤 {item.label || 'MC'}</span>
                          <span className="text-yellow-600 text-sm ml-auto">
                            {item.duration ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}` : '1:00'}
                          </span>
                        </div>
                      );
                    }
                    songNum++;
                    const song = item.song;
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-2 hover:bg-gray-700/50 rounded px-2 -mx-2">
                        <span className="w-8 text-right text-gray-500">{songNum}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-white truncate">{song?.title || 'Unknown'}</div>
                          {song?.artist && (
                            <div className="text-gray-400 text-sm truncate">{song.artist}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          {song?.key && (
                            <span className="px-1.5 py-0.5 bg-purple-900/50 rounded">{song.key}</span>
                          )}
                          {song?.bpm && (
                            <span className="px-1.5 py-0.5 bg-orange-900/50 rounded">{song.bpm}</span>
                          )}
                          {song?.duration && (
                            <span>{Math.floor(song.duration / 60)}:{String(song.duration % 60).padStart(2, '0')}</span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SetlistList;
