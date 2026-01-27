import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

function GigArchive({ workspaceId }) {
  const [setlists, setSetlists] = useState([]);
  const [gigs, setGigs] = useState([]);
  const [bandMembers, setBandMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGig, setSelectedGig] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [showAddGig, setShowAddGig] = useState(false);
  const [showEditPerformers, setShowEditPerformers] = useState(false);
  const [selectedPerformerIds, setSelectedPerformerIds] = useState([]);
  const [newGigTitle, setNewGigTitle] = useState('');
  const [newGigDate, setNewGigDate] = useState('');
  const [newGigVenue, setNewGigVenue] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCaption, setMediaCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'past', 'upcoming'
  const [lightboxImage, setLightboxImage] = useState(null); // For image lightbox
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [editFee, setEditFee] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDate, setEditDate] = useState('');

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  // Close modal on ESC key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (lightboxImage) {
          setLightboxImage(null);
        } else if (showEditDetails) {
          setShowEditDetails(false);
        } else if (showEditPerformers) {
          setShowEditPerformers(false);
        } else if (showAddMedia) {
          setShowAddMedia(false);
        } else if (selectedEntry) {
          setSelectedEntry(null);
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [lightboxImage, showEditDetails, showEditPerformers, showAddMedia, selectedEntry]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Auto-link any unlinked gigs to matching setlists (runs silently)
      try {
        await api.autoLinkSetlists(workspaceId);
      } catch (e) {
        // Ignore errors - this is just a data fix
      }
      const [setlistsData, gigsData, membersData] = await Promise.all([
        api.getSetlists(workspaceId),
        api.getGigs(workspaceId),
        api.getBandMembers(workspaceId)
      ]);
      setSetlists(setlistsData);
      setGigs(gigsData);
      setBandMembers(membersData.all || []);
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

  // Build archive entries from setlists AND standalone gigs
  // Track which gigs have been associated with setlists
  const usedGigIds = new Set();

  const setlistEntries = setlists.map(setlist => {
    // Use setlist's performedAt/venue fields first, then fall back to parsing name
    const parsed = parseSetlistName(setlist.name);
    const setlistDate = setlist.performedAt ? new Date(setlist.performedAt) : parsed.date;
    const setlistVenue = setlist.venue || parsed.venue;

    // Find formal gig that uses this setlist (by setlistId link)
    let associatedGig = gigs.find(g =>
      g.type === 'GIG' && (
        g.setlistId === setlist.id ||
        (g.setlists && g.setlists.some(gs => gs.setlistId === setlist.id))
      )
    );

    // Fallback: match by date/venue if no direct link exists
    // This handles cases where gig and setlist were created separately
    if (!associatedGig && setlistDate) {
      const setlistDateStr = setlistDate.toDateString();
      associatedGig = gigs.find(g => {
        if (g.type !== 'GIG' || usedGigIds.has(g.id)) return false;
        const gigDateStr = new Date(g.date).toDateString();
        if (gigDateStr !== setlistDateStr) return false;
        // Match by venue or title
        const venueMatch = g.venue && setlistVenue &&
          g.venue.toLowerCase().includes(setlistVenue.toLowerCase());
        const titleMatch = g.title && setlist.name &&
          (g.title.toLowerCase().includes(setlist.name.toLowerCase()) ||
           setlist.name.toLowerCase().includes(g.title.toLowerCase()));
        return venueMatch || titleMatch;
      });
    }

    if (associatedGig) {
      usedGigIds.add(associatedGig.id);
    }

    return {
      id: `setlist-${setlist.id}`,
      setlist,
      gig: associatedGig,
      title: setlist.name,
      venue: setlistVenue || associatedGig?.venue,
      date: associatedGig ? new Date(associatedGig.date) : setlistDate,
      status: associatedGig?.status || (setlistDate && setlistDate < new Date() ? 'COMPLETED' : 'SCHEDULED'),
      hasFormalGig: !!associatedGig
    };
  }).filter(entry => entry.date || entry.hasFormalGig);

  // Add standalone gigs (gigs not associated with any setlist entry)
  const standaloneGigs = gigs
    .filter(g => g.type === 'GIG' && !usedGigIds.has(g.id))
    .map(gig => ({
      id: `gig-${gig.id}`,
      setlist: null,
      gig,
      title: gig.title,
      venue: gig.venue,
      date: new Date(gig.date),
      status: gig.status,
      hasFormalGig: true
    }));

  const archiveEntries = [...setlistEntries, ...standaloneGigs]
    .sort((a, b) => {
      if (a.date && b.date) return b.date - a.date;
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

  const [uploadProgress, setUploadProgress] = useState('');

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !selectedGig) return;

    // Check file sizes
    const oversizedFiles = files.filter(f => f.size > 50 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setError(`${oversizedFiles.length} file(s) exceed 50MB limit`);
      return;
    }

    setUploading(true);
    try {
      const newMediaItems = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Uploading ${i + 1} of ${files.length}...`);
        const result = await api.uploadFile(file);
        const newMedia = await api.addGigMedia(selectedGig.id, {
          type: file.type.startsWith('video') ? 'video' : 'image',
          url: result.url,
          caption: file.name
        });
        newMediaItems.push(newMedia);
      }
      // Update selectedEntry immediately with new media
      setSelectedEntry(prev => {
        if (!prev?.gig) return prev;
        return {
          ...prev,
          gig: {
            ...prev.gig,
            media: [...(prev.gig.media || []), ...newMediaItems]
          }
        };
      });
      setShowAddMedia(false);
      setMediaCaption('');
      setUploadProgress('');
      // Refresh data in background
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      setUploadProgress('');
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

      const newMedia = await api.addGigMedia(selectedGig.id, {
        type,
        url: mediaUrl,
        caption: mediaCaption
      });
      // Update selectedEntry immediately with new media
      setSelectedEntry(prev => {
        if (!prev?.gig) return prev;
        return {
          ...prev,
          gig: {
            ...prev.gig,
            media: [...(prev.gig.media || []), newMedia]
          }
        };
      });
      setShowAddMedia(false);
      setMediaUrl('');
      setMediaCaption('');
      // Refresh data in background
      loadData();
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
      // Update selectedEntry immediately by removing the deleted media
      setSelectedEntry(prev => {
        if (!prev?.gig) return prev;
        return {
          ...prev,
          gig: {
            ...prev.gig,
            media: (prev.gig.media || []).filter(m => m.id !== mediaId)
          }
        };
      });
      // Refresh data in background
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOpenEditPerformers = (entry) => {
    if (!entry.setlist) return;
    const currentPerformerIds = entry.setlist.performers?.map(p => p.id) || [];
    setSelectedPerformerIds(currentPerformerIds);
    setShowEditPerformers(true);
  };

  const handleSavePerformers = async () => {
    if (!selectedEntry?.setlist) return;
    setUploading(true);
    try {
      const updatedPerformers = await api.updateSetlistPerformers(selectedEntry.setlist.id, selectedPerformerIds);
      // Update selectedEntry immediately with the API response
      setSelectedEntry(prev => ({
        ...prev,
        setlist: { ...prev.setlist, performers: updatedPerformers }
      }));
      setShowEditPerformers(false);
      // Also refresh the full data in background
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const togglePerformer = (memberId) => {
    setSelectedPerformerIds(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  // Open edit details modal
  const handleOpenEditDetails = async (entry) => {
    const gig = await ensureGigExists(entry);
    if (gig) {
      setEditFee(gig.pay?.toString() || '');
      setEditNotes(gig.notes || '');
      setEditDate(gig.date ? new Date(gig.date).toISOString().split('T')[0] : '');
      setSelectedGig(gig);
      setShowEditDetails(true);
    }
  };

  // Save gig details (date, fee and notes)
  const handleSaveDetails = async () => {
    if (!selectedGig) return;
    setUploading(true);
    try {
      await api.updateGig(selectedGig.id, {
        date: editDate || undefined,
        pay: editFee ? parseFloat(editFee) : null,
        notes: editNotes || null
      });
      await loadData();
      setShowEditDetails(false);
      // Update selectedEntry with new data
      if (selectedEntry?.gig?.id === selectedGig.id) {
        setSelectedEntry(prev => ({
          ...prev,
          gig: { ...prev.gig, date: editDate, pay: editFee ? parseFloat(editFee) : null, notes: editNotes || null }
        }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Delete gig
  const handleDeleteGig = async () => {
    if (!selectedGig) return;
    if (!confirm('Are you sure you want to delete this gig? This cannot be undone.')) return;

    setUploading(true);
    try {
      await api.deleteGig(selectedGig.id);
      await loadData();
      setShowEditDetails(false);
      setSelectedEntry(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Ensure a gig exists for this entry (either find existing or create new)
  const ensureGigExists = async (entry) => {
    if (entry.hasFormalGig && entry.gig) {
      return entry.gig;
    }

    // First, look for an existing unlinked gig with matching date/title
    // This prevents creating duplicates when gig was created separately from setlist
    const entryDate = entry.date ? new Date(entry.date).toDateString() : null;
    const existingGig = gigs.find(g => {
      if (g.type !== 'GIG') return false;
      // Already linked to a setlist - skip
      if (g.setlistId || (g.setlists && g.setlists.length > 0)) return false;
      // Match by date (same day) and title or venue
      const gigDate = new Date(g.date).toDateString();
      if (gigDate !== entryDate) return false;
      // Match by title or venue
      return (g.title && entry.title && g.title.toLowerCase() === entry.title.toLowerCase()) ||
             (g.venue && entry.venue && g.venue.toLowerCase() === entry.venue.toLowerCase());
    });

    if (existingGig) {
      // Link existing gig to this setlist
      try {
        await api.updateGig(existingGig.id, { setlistId: entry.setlist.id });
        await loadData();
        return { ...existingGig, setlistId: entry.setlist.id };
      } catch (err) {
        setError(err.message);
        return null;
      }
    }

    // No existing gig found - create a new one linked to this setlist
    try {
      const gigData = {
        title: entry.title,
        date: entry.date?.toISOString() || new Date().toISOString(),
        venue: entry.venue || null,
        type: 'GIG',
        status: entry.date && entry.date < new Date() ? 'COMPLETED' : 'SCHEDULED',
        setlistId: entry.setlist.id
      };
      const newGig = await api.createGig(workspaceId, gigData);
      await loadData();
      return newGig;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  // Handle adding media - ensure gig exists first
  const handleOpenAddMedia = async (entry) => {
    const gig = await ensureGigExists(entry);
    if (gig) {
      setSelectedGig(gig);
      setShowAddMedia(true);
    }
  };

  // Create a new standalone gig
  const handleCreateGig = async (e) => {
    e.preventDefault();
    if (!newGigTitle || !newGigDate) return;

    setUploading(true);
    try {
      await api.createGig(workspaceId, {
        title: newGigTitle,
        date: new Date(newGigDate).toISOString(),
        venue: newGigVenue || null,
        type: 'GIG',
        status: new Date(newGigDate) < new Date() ? 'COMPLETED' : 'SCHEDULED'
      });
      await loadData();
      setShowAddGig(false);
      setNewGigTitle('');
      setNewGigDate('');
      setNewGigVenue('');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const getYouTubeEmbedUrl = (url) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  // Extract YouTube video ID from URL
  const getYouTubeVideoId = (url) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  };

  // Get YouTube thumbnail URL from video URL
  const getYouTubeThumbnail = (url) => {
    const videoId = getYouTubeVideoId(url);
    return videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
  };

  // Close lightbox on ESC key
  const handleLightboxKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setLightboxImage(null);
    }
  }, []);

  useEffect(() => {
    if (lightboxImage) {
      document.addEventListener('keydown', handleLightboxKeyDown);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleLightboxKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [lightboxImage, handleLightboxKeyDown]);

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format total duration as Xh Xm
  const formatTotalDuration = (seconds) => {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
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
          <button
            onClick={() => setShowAddGig(true)}
            className="btn bg-green-600 hover:bg-green-700 text-white"
          >
            + Add Gig
          </button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEntries.map((entry) => {
              const { setlist, gig, title, venue, date, hasFormalGig } = entry;
              const { songCount, totalDuration } = getSetlistStats(setlist);
              const songs = setlist?.songs?.filter(s => s.type === 'SONG' || !s.type) || [];
              const displaySongs = songs.slice(0, 3);
              const remainingSongs = songs.length - 3;

              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className="bg-gray-900 rounded-lg border border-gray-700 p-4 hover:border-gray-500 hover:bg-gray-850 transition-colors cursor-pointer"
                >
                  {/* Header with title and date */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium truncate">{title}</h3>
                      {date && (
                        <p className="text-gray-400 text-sm">
                          {date.toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: '2-digit'
                          }).replace(/ /g, '-')}
                        </p>
                      )}
                    </div>
                    {gig?.media?.length > 0 && (
                      <span className="text-blue-400 text-sm">📸 {gig.media.length}</span>
                    )}
                  </div>

                  {/* Stats badges */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded">
                      {songCount} songs
                    </span>
                    {totalDuration > 0 && (
                      <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">
                        {formatTotalDuration(totalDuration)}
                      </span>
                    )}
                    {gig?.pay > 0 && (
                      <span className="px-2 py-0.5 bg-yellow-600/20 text-yellow-400 text-xs rounded">
                        ¥{gig.pay.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Performer avatars */}
                  {setlist?.performers?.length > 0 && (
                    <div className="flex items-center gap-1 mb-3">
                      <div className="flex -space-x-2">
                        {setlist.performers.slice(0, 6).map((member) => (
                          member.imageUrl ? (
                            <img
                              key={member.id}
                              src={member.imageUrl}
                              alt={member.name}
                              title={member.name}
                              className="w-7 h-7 rounded-full object-cover border-2 border-gray-900"
                            />
                          ) : (
                            <div
                              key={member.id}
                              title={member.name}
                              className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-white text-xs font-medium border-2 border-gray-900"
                            >
                              {member.name?.charAt(0).toUpperCase()}
                            </div>
                          )
                        ))}
                      </div>
                      {setlist.performers.length > 6 && (
                        <span className="text-gray-500 text-xs ml-1">+{setlist.performers.length - 6}</span>
                      )}
                    </div>
                  )}

                  {/* Song preview */}
                  {displaySongs.length > 0 && (
                    <div className="text-sm text-gray-400">
                      <ol className="list-decimal list-inside space-y-0.5">
                        {displaySongs.map((item, idx) => (
                          <li key={item.id || idx} className="truncate">
                            {item.song?.title || item.label || 'Unknown'}
                          </li>
                        ))}
                      </ol>
                      {remainingSongs > 0 && (
                        <p className="text-gray-500 text-xs mt-1">+{remainingSongs} more...</p>
                      )}
                    </div>
                  )}

                  {/* Media thumbnails if any */}
                  {gig?.media?.length > 0 && (
                    <div className="flex gap-1 mt-3 pt-3 border-t border-gray-700">
                      {gig.media.slice(0, 4).map((item) => (
                        <div key={item.id} className="w-10 h-10 rounded overflow-hidden bg-gray-800 flex-shrink-0 relative">
                          {item.type === 'image' ? (
                            <img src={item.url} alt="" className="w-full h-full object-cover" />
                          ) : item.type === 'youtube' ? (
                            <div className="relative w-full h-full">
                              <img
                                src={getYouTubeThumbnail(item.url)}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-4 h-4 bg-red-600 rounded-sm flex items-center justify-center">
                                  <span className="text-white text-[8px]">▶</span>
                                </div>
                              </div>
                            </div>
                          ) : item.type === 'video' ? (
                            <div className="w-full h-full flex items-center justify-center bg-gray-700">
                              <span className="text-blue-400 text-xs">▶</span>
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500">🔗</div>
                          )}
                        </div>
                      ))}
                      {gig.media.length > 4 && (
                        <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center text-gray-500 text-xs">
                          +{gig.media.length - 4}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Gig Detail Modal */}
      {selectedEntry && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="bg-gray-900 rounded-xl w-full max-w-3xl max-h-modal overflow-hidden border border-gray-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-purple-900/50 to-blue-900/50 p-6">
              <button
                onClick={() => setSelectedEntry(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
              >
                &times;
              </button>
              <h2 className="text-2xl font-bold text-white mb-1">
                {selectedEntry.title}
              </h2>
              {selectedEntry.date && (
                <p className="text-purple-200 text-lg">
                  {selectedEntry.date.toLocaleDateString('en-GB', { weekday: 'long' })}, {selectedEntry.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).replace(/ /g, '-')}
                </p>
              )}
              {selectedEntry.gig?.notes && (
                <p className="text-gray-300 mt-2 text-sm">{selectedEntry.gig.notes}</p>
              )}
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-180px)]">
              {/* Stats Row */}
              <div className="flex items-center gap-4 px-6 py-3 bg-gray-800/50 border-b border-gray-700 flex-wrap">
                {(() => {
                  const { songCount, totalDuration } = getSetlistStats(selectedEntry.setlist);
                  return (
                    <>
                      <span className="px-3 py-1 bg-green-600/20 text-green-400 text-sm rounded-full">
                        {songCount} songs
                      </span>
                      {totalDuration > 0 && (
                        <span className="px-3 py-1 bg-blue-600/20 text-blue-400 text-sm rounded-full">
                          {formatTotalDuration(totalDuration)}
                        </span>
                      )}
                      {selectedEntry.gig?.media?.length > 0 && (
                        <span className="px-3 py-1 bg-purple-600/20 text-purple-400 text-sm rounded-full">
                          {selectedEntry.gig.media.length} photos/videos
                        </span>
                      )}
                      {selectedEntry.gig?.pay > 0 && (
                        <span className="px-3 py-1 bg-yellow-600/20 text-yellow-400 text-sm rounded-full">
                          ¥{selectedEntry.gig.pay.toLocaleString()}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="p-6 space-y-6">
                {/* Fee & Notes Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                      <span className="text-xl">📝</span> Details
                    </h3>
                    <button
                      onClick={() => handleOpenEditDetails(selectedEntry)}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Date</span>
                      <span className="text-white font-medium">
                        {selectedEntry.date
                          ? selectedEntry.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).replace(/ /g, '-')
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Fee</span>
                      <span className="text-white font-medium">
                        {selectedEntry.gig?.pay ? `¥${selectedEntry.gig.pay.toLocaleString()}` : '—'}
                      </span>
                    </div>
                    {selectedEntry.gig?.notes && (
                      <div>
                        <span className="text-gray-400 text-sm">Notes</span>
                        <p className="text-white mt-1">{selectedEntry.gig.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Performers */}
                {selectedEntry.setlist && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-semibold flex items-center gap-2">
                        <span className="text-xl">👥</span> Who Played
                      </h3>
                      <button
                        onClick={() => handleOpenEditPerformers(selectedEntry)}
                        className="text-sm text-blue-400 hover:text-blue-300"
                      >
                        Edit
                      </button>
                    </div>
                    {selectedEntry.setlist.performers?.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedEntry.setlist.performers.map(member => {
                          const instruments = [...new Set(member.stints?.flatMap(s => s.instruments || (s.instrument ? [s.instrument] : [])) || [])];
                          return (
                          <div
                            key={member.id}
                            className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-full"
                          >
                            {member.imageUrl ? (
                              <img
                                src={member.imageUrl}
                                alt={member.name}
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-medium">
                                {member.name?.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="text-white text-sm">{member.name}</span>
                            {member.isGuest ? (
                              <span className="text-purple-400 text-xs">(Guest)</span>
                            ) : (
                              <span className="text-gray-400 text-xs">({instruments.join(', ') || 'Unknown'})</span>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleOpenEditPerformers(selectedEntry)}
                        className="w-full py-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-sm"
                      >
                        + Tag band members who played this gig
                      </button>
                    )}
                  </div>
                )}

                {/* Setlist */}
                {selectedEntry.setlist && (
                  <div>
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <span className="text-xl">📋</span> Setlist
                    </h3>
                    <div className="bg-gray-800 rounded-lg p-4">
                      {selectedEntry.setlist.songs?.filter(s => s.type === 'SONG' || !s.type).length > 0 ? (
                        <ol className="space-y-1">
                          {selectedEntry.setlist.songs
                            .filter(s => s.type === 'SONG' || !s.type)
                            .map((item, idx) => (
                              <li key={item.id || idx} className="flex items-center gap-3 py-1">
                                <span className="text-gray-500 text-sm w-6 text-right">{idx + 1}.</span>
                                <span className="text-white">{item.song?.title || item.label || 'Unknown'}</span>
                                {item.song?.artist && (
                                  <span className="text-gray-500">— {item.song.artist}</span>
                                )}
                                {item.song?.duration && (
                                  <span className="text-gray-600 text-sm ml-auto">{formatDuration(item.song.duration)}</span>
                                )}
                              </li>
                            ))}
                        </ol>
                      ) : (
                        <p className="text-gray-500 text-center py-4">No songs in setlist</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Media Gallery */}
                {selectedEntry.gig?.media?.length > 0 && (
                  <div>
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                      <span className="text-xl">📸</span> Photos & Videos
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {selectedEntry.gig.media.map((item) => (
                        <div key={item.id} className="relative group">
                          {/* Thumbnail container with aspect ratio */}
                          <div className="relative rounded-lg overflow-hidden bg-gray-800 aspect-video">
                            {item.type === 'image' ? (
                              <button
                                onClick={() => setLightboxImage({ url: item.url, caption: item.caption })}
                                className="w-full h-full block cursor-zoom-in"
                              >
                                <img
                                  src={item.url}
                                  alt={item.caption || 'Gig photo'}
                                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                                />
                              </button>
                            ) : item.type === 'youtube' ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full h-full block relative"
                              >
                                <img
                                  src={getYouTubeThumbnail(item.url)}
                                  alt={item.caption || 'YouTube video'}
                                  className="w-full h-full object-cover"
                                />
                                {/* YouTube play button overlay */}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors">
                                  <div className="w-12 h-9 bg-red-600 rounded-lg flex items-center justify-center shadow-lg">
                                    <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                  </div>
                                </div>
                              </a>
                            ) : item.type === 'video' ? (
                              <video
                                src={item.url}
                                className="w-full h-full object-cover"
                                controls
                              />
                            ) : (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center w-full h-full bg-gray-800 hover:bg-gray-700 transition-colors"
                              >
                                <span className="text-4xl">🔗</span>
                              </a>
                            )}
                            {/* Delete button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                handleDeleteMedia(selectedEntry.gig.id, item.id);
                              }}
                              className="absolute top-2 right-2 w-7 h-7 bg-red-600 hover:bg-red-700 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-sm flex items-center justify-center shadow-lg"
                            >
                              ×
                            </button>
                          </div>
                          {/* Caption below thumbnail */}
                          <div className="mt-2 px-1">
                            <p className="text-gray-300 text-sm truncate">
                              {item.caption || (item.type === 'youtube' ? 'YouTube Video' : item.type === 'video' ? 'Video' : item.type === 'link' ? 'Link' : '')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Media Button - works for any entry */}
                <button
                  onClick={() => handleOpenAddMedia(selectedEntry)}
                  className="w-full py-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                >
                  + Add Photos, Videos, or Links
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Gig Modal */}
      {showAddGig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">Add Past Gig</h3>
              <button
                onClick={() => {
                  setShowAddGig(false);
                  setNewGigTitle('');
                  setNewGigDate('');
                  setNewGigVenue('');
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateGig} className="p-4 space-y-4">
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Gig Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newGigTitle}
                  onChange={(e) => setNewGigTitle(e.target.value)}
                  placeholder="e.g., Ruby Room Show"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={newGigDate}
                  onChange={(e) => setNewGigDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Venue
                </label>
                <input
                  type="text"
                  value={newGigVenue}
                  onChange={(e) => setNewGigVenue(e.target.value)}
                  placeholder="e.g., The Den"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddGig(false);
                    setNewGigTitle('');
                    setNewGigDate('');
                    setNewGigVenue('');
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !newGigTitle || !newGigDate}
                  className="btn bg-green-600 hover:bg-green-700 text-white"
                >
                  {uploading ? 'Adding...' : 'Add Gig'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Media Modal */}
      {showAddMedia && selectedGig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">Add Media</h3>
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
              {/* Upload Files */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Upload Images or Videos
                </label>
                <label className="block">
                  <span className="btn btn-secondary w-full cursor-pointer text-center">
                    {uploadProgress || (uploading ? 'Uploading...' : 'Choose Files')}
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                <p className="text-gray-500 text-xs mt-1">Max 50MB per file. Select multiple files at once.</p>
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
                  className="btn bg-green-600 hover:bg-green-700 text-white w-full"
                >
                  {uploading ? 'Adding...' : 'Add Link'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Performers Modal */}
      {showEditPerformers && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">Who Played This Gig?</h3>
              <button
                onClick={() => setShowEditPerformers(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              {bandMembers.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <p className="mb-2">No band members found.</p>
                  <p className="text-sm">Add band members in Settings first.</p>
                </div>
              ) : (
                <>
                {/* Quick-add current members button */}
                {(() => {
                  const currentMemberIds = bandMembers
                    .filter(m => !m.isGuest && m.stints?.some(s => !s.endDate))
                    .map(m => m.id);
                  const allCurrentSelected = currentMemberIds.every(id => selectedPerformerIds.includes(id));
                  return currentMemberIds.length > 0 && !allCurrentSelected ? (
                    <button
                      onClick={() => {
                        setSelectedPerformerIds(prev => {
                          const newIds = new Set([...prev, ...currentMemberIds]);
                          return [...newIds];
                        });
                      }}
                      className="w-full mb-3 py-2 px-3 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/50 rounded-lg text-purple-300 text-sm transition-colors"
                    >
                      + Add all current members ({currentMemberIds.length})
                    </button>
                  ) : null;
                })()}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {[...bandMembers]
                    .sort((a, b) => {
                      // Current members first (non-guest with stint without endDate)
                      const aIsCurrent = !a.isGuest && (a.stints?.some(s => !s.endDate) || false);
                      const bIsCurrent = !b.isGuest && (b.stints?.some(s => !s.endDate) || false);
                      if (aIsCurrent && !bIsCurrent) return -1;
                      if (!aIsCurrent && bIsCurrent) return 1;
                      // Then sort by name
                      return a.name.localeCompare(b.name);
                    })
                    .map(member => {
                    const instruments = [...new Set(member.stints?.flatMap(s => s.instruments || (s.instrument ? [s.instrument] : [])) || [])];
                    const isFormer = member.stints?.length > 0 && member.stints.every(s => s.endDate);
                    return (
                    <label
                      key={member.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedPerformerIds.includes(member.id)
                          ? 'bg-purple-600/20 border border-purple-500'
                          : 'bg-gray-900 border border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPerformerIds.includes(member.id)}
                        onChange={() => togglePerformer(member.id)}
                        className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500"
                      />
                      {member.imageUrl ? (
                        <img
                          src={member.imageUrl}
                          alt={member.name}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-medium flex-shrink-0">
                          {member.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{member.name}</span>
                          {member.isGuest && (
                            <span className="px-1.5 py-0.5 text-xs bg-purple-600/30 text-purple-300 rounded">Guest</span>
                          )}
                        </div>
                        <div className="text-gray-400 text-sm">
                          {instruments.length > 0 ? instruments.join(', ') : (member.isGuest ? 'Guest musician' : 'Unknown')}
                        </div>
                      </div>
                      {isFormer && (
                        <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">Former</span>
                      )}
                    </label>
                    );
                  })}
                </div>
                </>
              )}
              <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowEditPerformers(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePerformers}
                  disabled={uploading}
                  className="btn bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {uploading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Details Modal */}
      {showEditDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">Edit Gig Details</h3>
              <button
                onClick={() => setShowEditDetails(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Fee (¥)
                </label>
                <input
                  type="number"
                  value={editFee}
                  onChange={(e) => setEditFee(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Notes
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes about the gig..."
                  rows={4}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white resize-none"
                />
              </div>
              <div className="flex gap-2 justify-between pt-2">
                <button
                  type="button"
                  onClick={handleDeleteGig}
                  disabled={uploading}
                  className="btn bg-red-600 hover:bg-red-700 text-white"
                >
                  Delete Gig
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditDetails(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveDetails}
                    disabled={uploading}
                    className="btn bg-green-600 hover:bg-green-700 text-white"
                  >
                    {uploading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[70]"
          onClick={() => setLightboxImage(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-gray-800 hover:bg-gray-700 text-white rounded-full flex items-center justify-center text-2xl transition-colors z-10"
            aria-label="Close lightbox"
          >
            ×
          </button>

          {/* ESC hint */}
          <div className="absolute top-4 left-4 text-gray-500 text-sm">
            Press ESC to close
          </div>

          {/* Image container */}
          <div
            className="relative max-w-[90vw] max-h-modal flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage.url}
              alt={lightboxImage.caption || 'Gig photo'}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            {/* Caption below image */}
            {lightboxImage.caption && (
              <div className="mt-4 text-white text-center text-lg max-w-2xl">
                {lightboxImage.caption}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GigArchive;
