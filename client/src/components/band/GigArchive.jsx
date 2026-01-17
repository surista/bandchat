import { useState, useEffect } from 'react';
import api from '../../services/api';

function GigArchive({ workspaceId }) {
  const [setlists, setSetlists] = useState([]);
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGig, setSelectedGig] = useState(null);
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'with-gig', 'no-gig'

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [setlistsData, gigsData] = await Promise.all([
        api.getSetlists(workspaceId),
        api.getGigs(workspaceId)
      ]);
      setSetlists(setlistsData);
      setGigs(gigsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Build archive entries from setlists with associated gig info
  const archiveEntries = setlists.map(setlist => {
    // Find gigs that use this setlist (either legacy single or multi-set)
    const associatedGigs = gigs.filter(g =>
      g.setlistId === setlist.id ||
      (g.setlists && g.setlists.some(gs => gs.setlistId === setlist.id))
    ).sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get the most recent gig for display
    const primaryGig = associatedGigs[0];

    return {
      setlist,
      gig: primaryGig,
      allGigs: associatedGigs,
      hasGig: associatedGigs.length > 0
    };
  }).sort((a, b) => {
    // Sort: gigs with dates first (by date desc), then setlists without gigs (by creation date desc)
    if (a.hasGig && b.hasGig) {
      return new Date(b.gig.date) - new Date(a.gig.date);
    }
    if (a.hasGig) return -1;
    if (b.hasGig) return 1;
    return new Date(b.setlist.createdAt) - new Date(a.setlist.createdAt);
  });

  const filteredEntries = archiveEntries.filter(entry => {
    if (filter === 'with-gig') return entry.hasGig;
    if (filter === 'no-gig') return !entry.hasGig;
    return true;
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedGig) return;

    if (file.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB');
      return;
    }

    setUploading(true);
    try {
      const result = await api.uploadFile(file);
      await api.addGigMedia(selectedGig.id, {
        type: file.type.startsWith('video') ? 'video' : 'image',
        url: result.url,
        caption: mediaCaption || file.name
      });
      await loadData();
      setShowAddMedia(false);
      setMediaCaption('');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = async (e) => {
    e.preventDefault();
    if (!mediaUrl || !selectedGig) return;

    setUploading(true);
    try {
      let type = 'link';
      if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) {
        type = 'youtube';
      } else if (mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        type = 'image';
      }

      await api.addGigMedia(selectedGig.id, {
        type,
        url: mediaUrl,
        caption: mediaCaption
      });
      await loadData();
      setShowAddMedia(false);
      setMediaUrl('');
      setMediaCaption('');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMedia = async (gigId, mediaId) => {
    if (!confirm('Delete this media?')) return;
    try {
      await api.deleteGigMedia(gigId, mediaId);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const getYouTubeEmbedUrl = (url) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSetlistStats = (setlist) => {
    if (!setlist?.songs) return { songCount: 0, totalDuration: 0 };
    const songs = setlist.songs.filter(s => s.type === 'SONG' || !s.type);
    const songCount = songs.length;
    const totalDuration = songs.reduce((sum, s) => sum + (s.song?.duration || s.duration || 0), 0);
    return { songCount, totalDuration };
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading archive...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-bold text-white">Setlist Archive</h2>
            <p className="text-gray-400 text-sm mt-1">Your setlists, gig history, and memories</p>
          </div>
        </div>
        {/* Filter tabs */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-sm ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            All Setlists ({archiveEntries.length})
          </button>
          <button
            onClick={() => setFilter('with-gig')}
            className={`px-3 py-1 rounded text-sm ${filter === 'with-gig' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            With Gigs ({archiveEntries.filter(e => e.hasGig).length})
          </button>
          <button
            onClick={() => setFilter('no-gig')}
            className={`px-3 py-1 rounded text-sm ${filter === 'no-gig' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            Unscheduled ({archiveEntries.filter(e => !e.hasGig).length})
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded">
          {error}
          <button onClick={() => setError(null)} className="float-right">&times;</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {setlists.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-lg mb-2">No setlists yet</p>
            <p className="text-sm">Create a setlist in Set Lists to start building your archive!</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>No {filter === 'with-gig' ? 'setlists with gigs' : filter === 'no-gig' ? 'unscheduled setlists' : 'setlists'} found</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredEntries.map(({ setlist, gig, allGigs, hasGig }) => {
              const { songCount, totalDuration } = getSetlistStats(setlist);

              return (
                <div key={setlist.id} className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
                  {/* Setlist Header */}
                  <div className="p-4 border-b border-gray-700">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-medium text-white">{setlist.name}</h3>
                          {hasGig ? (
                            gig.status === 'COMPLETED' ? (
                              <span className="px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded">Played</span>
                            ) : new Date(gig.date) < new Date() ? (
                              <span className="px-2 py-0.5 bg-yellow-600/20 text-yellow-400 text-xs rounded">Pending Review</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-purple-600/20 text-purple-400 text-xs rounded">Scheduled</span>
                            )
                          ) : (
                            <span className="px-2 py-0.5 bg-gray-600/30 text-gray-400 text-xs rounded">Not Scheduled</span>
                          )}
                          {allGigs.length > 1 && (
                            <span className="px-2 py-0.5 bg-indigo-600/30 text-indigo-300 text-xs rounded font-medium">
                              {allGigs.length} gigs
                            </span>
                          )}
                        </div>

                        {/* Gig Info */}
                        {hasGig ? (
                          <div className="text-gray-400 text-sm">
                            <span className="text-white font-medium">{gig.title}</span>
                            {' • '}
                            {new Date(gig.date).toLocaleDateString('en-US', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                            {gig.venue && ` • ${gig.venue}`}
                          </div>
                        ) : (
                          <div className="text-gray-500 text-sm italic">
                            No gig scheduled for this setlist
                          </div>
                        )}

                        {/* Setlist Stats */}
                        <div className="mt-2 p-2 bg-gray-800 rounded flex items-center gap-4 text-sm">
                          <span className="text-gray-400">📋</span>
                          <span className="text-gray-400">{songCount} songs</span>
                          {totalDuration > 0 && (
                            <>
                              <span className="text-gray-500">•</span>
                              <span className="text-gray-400">{formatDuration(totalDuration)}</span>
                            </>
                          )}
                          {setlist.description && (
                            <>
                              <span className="text-gray-500">•</span>
                              <span className="text-gray-500 truncate">{setlist.description}</span>
                            </>
                          )}
                        </div>

                        {/* Show other gigs if multiple */}
                        {allGigs.length > 1 && (
                          <div className="mt-2 text-xs text-gray-500">
                            Also used in: {allGigs.slice(1, 4).map(g => g.title).join(', ')}
                            {allGigs.length > 4 && ` and ${allGigs.length - 4} more`}
                          </div>
                        )}
                      </div>

                      {hasGig && (
                        <button
                          onClick={() => {
                            setSelectedGig(gig);
                            setShowAddMedia(true);
                          }}
                          className="btn btn-primary text-sm flex-shrink-0"
                        >
                          + Add Media
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Media Grid - only for gigs */}
                  {hasGig && (
                    <div className="p-4">
                      {gig.media?.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {gig.media.map((item) => (
                            <div key={item.id} className="relative group">
                              {item.type === 'image' ? (
                                <a href={item.url} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={item.url}
                                    alt={item.caption || 'Gig photo'}
                                    className="w-full h-32 object-cover rounded-lg"
                                  />
                                </a>
                              ) : item.type === 'youtube' ? (
                                <div className="relative">
                                  <iframe
                                    src={getYouTubeEmbedUrl(item.url)}
                                    className="w-full h-32 rounded-lg"
                                    allowFullScreen
                                  />
                                </div>
                              ) : item.type === 'video' ? (
                                <video
                                  src={item.url}
                                  className="w-full h-32 object-cover rounded-lg"
                                  controls
                                />
                              ) : (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-center w-full h-32 bg-gray-800 rounded-lg hover:bg-gray-700"
                                >
                                  <span className="text-4xl">🔗</span>
                                </a>
                              )}
                              {item.caption && (
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 rounded-b-lg truncate">
                                  {item.caption}
                                </div>
                              )}
                              <button
                                onClick={() => handleDeleteMedia(gig.id, item.id)}
                                className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500 bg-gray-800/50 rounded-lg border border-dashed border-gray-700">
                          <div className="text-3xl mb-2">📸</div>
                          <p>No media yet</p>
                          <button
                            onClick={() => {
                              setSelectedGig(gig);
                              setShowAddMedia(true);
                            }}
                            className="text-blue-400 hover:underline text-sm mt-1"
                          >
                            Add photos, videos, or YouTube links
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* For setlists without gigs, show a simple call-to-action */}
                  {!hasGig && (
                    <div className="p-4">
                      <div className="text-center py-6 text-gray-500 bg-gray-800/30 rounded-lg">
                        <p className="text-sm">Schedule this setlist for a gig to add photos and videos</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Media Modal */}
      {showAddMedia && selectedGig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">Add Media to {selectedGig.title}</h3>
              <button
                onClick={() => {
                  setShowAddMedia(false);
                  setMediaUrl('');
                  setMediaCaption('');
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Upload File */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Upload Image or Video
                </label>
                <label className="block">
                  <span className="btn btn-secondary w-full cursor-pointer text-center">
                    {uploading ? 'Uploading...' : 'Choose File'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                <p className="text-gray-500 text-xs mt-1">Max 50MB. Images and videos supported.</p>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-gray-800 px-2 text-gray-500 text-sm">or add a link</span>
                </div>
              </div>

              {/* Add URL */}
              <form onSubmit={handleAddUrl}>
                <div className="mb-3">
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    URL (YouTube, image link, etc.)
                  </label>
                  <input
                    type="url"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    Caption (optional)
                  </label>
                  <input
                    type="text"
                    value={mediaCaption}
                    onChange={(e) => setMediaCaption(e.target.value)}
                    placeholder="Add a caption..."
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!mediaUrl || uploading}
                  className="btn btn-primary w-full"
                >
                  {uploading ? 'Adding...' : 'Add Link'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GigArchive;
