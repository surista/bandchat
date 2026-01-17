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
  const [filter, setFilter] = useState('all'); // 'all', 'past', 'upcoming'

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

  // Try to parse venue and date from setlist name (e.g., "Ruby Room - 21 May 2024")
  const parseSetlistName = (name) => {
    // Common patterns: "Venue - Date", "Venue, Date", "Date - Venue"
    const patterns = [
      // "Ruby Room - 21 May 2024" or "The Den - 1 Dec 2024"
      /^(.+?)\s*[-–]\s*(\d{1,2}\s+\w+\s+\d{4})$/i,
      // "Dickens, 14 July 2024"
      /^(.+?)\s*,\s*(\d{1,2}\s+\w+\s+\d{4})$/i,
      // "28 Feb - Gamuso" (date first)
      /^(\d{1,2}\s+\w+(?:\s+\d{4})?)\s*[-–]\s*(.+)$/i,
      // "Ruby Room 28 Feb 2025"
      /^(.+?)\s+(\d{1,2}\s+\w+\s+\d{4})$/i,
    ];

    for (const pattern of patterns) {
      const match = name.match(pattern);
      if (match) {
        let venue, dateStr;
        // Check if first group looks like a date
        if (/^\d{1,2}\s+\w+/.test(match[1])) {
          dateStr = match[1];
          venue = match[2];
        } else {
          venue = match[1];
          dateStr = match[2];
        }

        // Try to parse the date
        const parsedDate = parseDate(dateStr);
        if (parsedDate) {
          return { venue: venue.trim(), date: parsedDate, title: name };
        }
      }
    }

    return { venue: null, date: null, title: name };
  };

  // Parse date string like "21 May 2024" or "28 Feb"
  const parseDate = (dateStr) => {
    const months = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11
    };

    const match = dateStr.match(/(\d{1,2})\s+(\w+)(?:\s+(\d{4}))?/i);
    if (match) {
      const day = parseInt(match[1]);
      const monthStr = match[2].toLowerCase();
      const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
      const month = months[monthStr];

      if (month !== undefined && day >= 1 && day <= 31) {
        return new Date(year, month, day);
      }
    }
    return null;
  };

  // Build archive entries - each setlist becomes a gig entry
  const archiveEntries = setlists.map(setlist => {
    // Find formal gig that uses this setlist
    const associatedGig = gigs.find(g =>
      g.setlistId === setlist.id ||
      (g.setlists && g.setlists.some(gs => gs.setlistId === setlist.id))
    );

    // If no formal gig, try to parse setlist name for gig info
    const parsed = parseSetlistName(setlist.name);

    return {
      setlist,
      gig: associatedGig,
      // Use formal gig info if available, otherwise use parsed info
      title: associatedGig?.title || parsed.title,
      venue: associatedGig?.venue || parsed.venue,
      date: associatedGig ? new Date(associatedGig.date) : parsed.date,
      status: associatedGig?.status || (parsed.date && parsed.date < new Date() ? 'COMPLETED' : 'SCHEDULED'),
      hasFormalGig: !!associatedGig
    };
  }).filter(entry => entry.date || entry.hasFormalGig) // Only show entries with a date or formal gig
    .sort((a, b) => {
      // Sort by date descending
      if (a.date && b.date) {
        return b.date - a.date;
      }
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });

  const now = new Date();
  const filteredEntries = archiveEntries.filter(entry => {
    if (filter === 'past') return entry.date && entry.date < now;
    if (filter === 'upcoming') return entry.date && entry.date >= now;
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

  const pastCount = archiveEntries.filter(e => e.date && e.date < now).length;
  const upcomingCount = archiveEntries.filter(e => e.date && e.date >= now).length;

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-bold text-white">Gig Archive</h2>
            <p className="text-gray-400 text-sm mt-1">Photos, videos, and memories from your gigs</p>
          </div>
        </div>
        {/* Filter tabs */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-sm ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            All ({archiveEntries.length})
          </button>
          <button
            onClick={() => setFilter('past')}
            className={`px-3 py-1 rounded text-sm ${filter === 'past' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            Past ({pastCount})
          </button>
          <button
            onClick={() => setFilter('upcoming')}
            className={`px-3 py-1 rounded text-sm ${filter === 'upcoming' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
          >
            Upcoming ({upcomingCount})
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
        {archiveEntries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-6xl mb-4">📸</div>
            <p className="text-lg mb-2">No gigs yet</p>
            <p className="text-sm">Create setlists with dates in the name (e.g., "Venue - 21 May 2024") or schedule gigs in Calendar</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p>No {filter === 'past' ? 'past' : 'upcoming'} gigs found</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredEntries.map((entry) => {
              const { setlist, gig, title, venue, date, status, hasFormalGig } = entry;
              const { songCount, totalDuration } = getSetlistStats(setlist);
              const isPast = date && date < now;

              return (
                <div key={setlist.id} className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
                  {/* Gig Header */}
                  <div className="p-4 border-b border-gray-700">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-medium text-white">{title}</h3>
                          {isPast ? (
                            <span className="px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded">Completed</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-purple-600/20 text-purple-400 text-xs rounded">Upcoming</span>
                          )}
                          {!hasFormalGig && (
                            <span className="px-2 py-0.5 bg-gray-600/30 text-gray-400 text-xs rounded">From Setlist</span>
                          )}
                        </div>

                        {/* Gig Info */}
                        <div className="text-gray-400 text-sm">
                          {date && (
                            <>
                              {date.toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </>
                          )}
                          {venue && ` • ${venue}`}
                        </div>

                        {/* Setlist Stats */}
                        <div className="mt-2 p-2 bg-gray-800 rounded flex items-center gap-4 text-sm">
                          <span className="text-gray-400">📋</span>
                          <span className="text-white font-medium">{setlist.name}</span>
                          <span className="text-gray-500">•</span>
                          <span className="text-gray-400">{songCount} songs</span>
                          {totalDuration > 0 && (
                            <>
                              <span className="text-gray-500">•</span>
                              <span className="text-gray-400">{formatDuration(totalDuration)}</span>
                            </>
                          )}
                        </div>

                        {setlist.description && (
                          <p className="mt-2 text-sm text-gray-500 italic">{setlist.description}</p>
                        )}
                      </div>

                      {hasFormalGig && gig && (
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

                  {/* Media Grid - only for formal gigs */}
                  {hasFormalGig && gig && (
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

                  {/* For setlists without formal gigs, show placeholder */}
                  {!hasFormalGig && (
                    <div className="p-4">
                      <div className="text-center py-6 text-gray-500 bg-gray-800/30 rounded-lg">
                        <div className="text-2xl mb-2">📸</div>
                        <p className="text-sm">Create a gig in Calendar and link this setlist to add media</p>
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
