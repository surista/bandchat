import { useState, useEffect, useCallback } from 'react';
import { isSafeUrl } from '../../utils/urlSafety';
import { format } from 'date-fns';
import api from '../../services/api';
import { getCurrencySymbol } from '../../utils/currencies';
import ConfirmDialog from '../common/ConfirmDialog';
import ImageLightbox from '../common/ImageLightbox';
import Modal from '../common/Modal';
import { formatDuration, formatTotalDuration } from '../../utils/formatDuration';
import getInitial from '../../utils/getInitial';
import ErrorMessage from '../common/ErrorMessage';

function GigArchive({ workspaceId, isAdmin, workspace }) {
  const [setlists, setSetlists] = useState([]);
  const [gigs, setGigs] = useState([]);
  const [bandMembers, setBandMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGig, setSelectedGig] = useState(null);
  const [deleteMediaId, setDeleteMediaId] = useState(null); // { gigId, mediaId }
  const [showDeleteGigConfirm, setShowDeleteGigConfirm] = useState(false);
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
  const [dragActive, setDragActive] = useState(false);
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editFee, setEditFee] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDate, setEditDate] = useState('');
  const [showSetlistPicker, setShowSetlistPicker] = useState(false);
  const [availableSetlists, setAvailableSetlists] = useState([]);
  const [setlistSearch, setSetlistSearch] = useState('');

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  // Close modal on ESC key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (lightboxImage) {
          setLightboxImage(null);
        } else if (showSetlistPicker) {
          setShowSetlistPicker(false);
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
  }, [lightboxImage, showSetlistPicker, showEditDetails, showEditPerformers, showAddMedia, selectedEntry]);

  const loadData = async () => {
    setError(null);
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
        const result = await api.uploadFile(file, workspaceId);
        const newMedia = await api.addGigMedia(selectedGig.id, {
          type: file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : 'image',
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

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer?.files;
    if (files?.length > 0) {
      // Simulate file input change event
      handleFileUpload({ target: { files } });
    }
  }, [selectedGig]);

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
    try {
      await api.deleteGigMedia(gigId, mediaId);
      setDeleteMediaId(null);
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
      setDeleteMediaId(null);
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
      setEditTitle(gig.title || '');
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
        title: editTitle || undefined,
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
          title: editTitle || prev.title,
          gig: { ...prev.gig, title: editTitle || prev.gig?.title, date: editDate, pay: editFee ? parseFloat(editFee) : null, notes: editNotes || null }
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
    setShowDeleteGigConfirm(false);

    setUploading(true);
    try {
      await api.deleteGig(selectedGig.id);
      await loadData();
      setSelectedGig(null);
      setShowEditDetails(false);
      setSelectedEntry(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Open setlist picker and fetch available setlists
  const openSetlistPicker = async () => {
    setShowSetlistPicker(true);
    setSetlistSearch('');
    try {
      const data = await api.getSetlists(workspaceId);
      setAvailableSetlists(data);
    } catch (err) {
      setError(err.message);
    }
  };

  // Link an existing setlist to the current gig
  const handleLinkSetlist = async (setlistId) => {
    setShowSetlistPicker(false);
    setUploading(true);
    try {
      let gig = selectedEntry.gig;
      if (!selectedEntry.hasFormalGig || !gig) {
        gig = await ensureGigExists(selectedEntry);
        if (!gig) return;
      }
      await api.updateGig(gig.id, { setlistId });
      await loadData();
      // Update selectedEntry to reflect the change
      setSelectedEntry(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Create a new blank setlist and link it to the current gig
  const handleCreateAndLinkSetlist = async () => {
    setUploading(true);
    try {
      let gig = selectedEntry.gig;
      if (!selectedEntry.hasFormalGig || !gig) {
        gig = await ensureGigExists(selectedEntry);
        if (!gig) return;
      }
      const newSetlist = await api.createSetlist(workspaceId, {
        name: selectedEntry.title || 'New Setlist',
        performedAt: selectedEntry.date?.toISOString()
      });
      await api.updateGig(gig.id, { setlistId: newSetlist.id });
      await loadData();
      setSelectedEntry(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Unlink setlist from the current gig
  const handleUnlinkSetlist = async () => {
    if (!selectedEntry.gig) return;
    setUploading(true);
    try {
      await api.updateGig(selectedEntry.gig.id, { setlistId: null });
      await loadData();
      setSelectedEntry(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Ensure a gig exists for this entry (either find existing or create new)
  const ensureGigExists = async (entry) => {
    // If this entry already has a gig, always use it
    if (entry.gig?.id) {
      return entry.gig;
    }

    // Look for an existing gig with matching date/title (linked or unlinked)
    const entryDate = entry.date ? new Date(entry.date).toDateString() : null;
    const existingGig = entryDate && gigs.find(g => {
      if (g.type !== 'GIG') return false;
      const gigDate = new Date(g.date).toDateString();
      if (gigDate !== entryDate) return false;
      return (g.title && entry.title && g.title.toLowerCase() === entry.title.toLowerCase()) ||
             (g.venue && entry.venue && g.venue.toLowerCase() === entry.venue.toLowerCase());
    });

    if (existingGig) {
      // Link existing gig to this setlist if it has one
      if (entry.setlist?.id) {
        try {
          await api.updateGig(existingGig.id, { setlistId: entry.setlist.id });
          await loadData();
        } catch (err) {
          setError(err.message);
        }
      }
      return existingGig;
    }

    // No existing gig found - create a new one
    try {
      const gigData = {
        title: entry.title,
        date: entry.date?.toISOString() || new Date().toISOString(),
        venue: entry.venue || null,
        type: 'GIG',
        status: entry.date && entry.date < new Date() ? 'COMPLETED' : 'SCHEDULED',
        ...(entry.setlist?.id ? { setlistId: entry.setlist.id } : {})
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

  // Note: lightbox keyboard handling is done by ImageLightbox component



  const getSetlistStats = (setlist) => {
    if (!setlist?.songs) return { songCount: 0, totalDuration: 0 };
    const songs = setlist.songs.filter(s => s.type === 'SONG' || !s.type);
    const songCount = songs.length;
    const totalDuration = songs.reduce((sum, s) => sum + (s.song?.duration || s.duration || 0), 0);
    return { songCount, totalDuration };
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[var(--color-text-muted)]">Loading archive...</div>;
  }

  const pastCount = archiveEntries.filter(e => e.date && e.date < now).length;
  const upcomingCount = archiveEntries.filter(e => e.date && e.date >= now).length;

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Gig Archive</h2>
            <p className="text-[var(--color-text-muted)] text-sm mt-1">Photos, videos, and memories from your gigs</p>
          </div>
          <button
            onClick={() => setShowAddGig(true)}
            className="btn btn-primary"
          >
            + Add Gig
          </button>
        </div>
        {/* Filter tabs */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-sm ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'}`}
          >
            All ({archiveEntries.length})
          </button>
          <button
            onClick={() => setFilter('past')}
            className={`px-3 py-1 rounded text-sm ${filter === 'past' ? 'bg-green-600 text-white' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'}`}
          >
            Past ({pastCount})
          </button>
          <button
            onClick={() => setFilter('upcoming')}
            className={`px-3 py-1 rounded text-sm ${filter === 'upcoming' ? 'bg-purple-600 text-white' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'}`}
          >
            Upcoming ({upcomingCount})
          </button>
        </div>
      </div>

      {error && (
        <ErrorMessage message={error} onRetry={loadData} className="mx-4 mt-4" />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {archiveEntries.length === 0 ? (
          <div className="text-center py-12 text-[var(--color-text-muted)]">
            <div className="text-6xl mb-4">📸</div>
            <p className="text-lg mb-2">No gigs yet</p>
            <p className="text-sm">Create setlists with dates in the name (e.g., "Venue - 21 May 2024") or schedule gigs in Calendar</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-12 text-[var(--color-text-muted)]">
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
                  className="group bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border)] p-4 hover:border-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer"
                >
                  {/* Header with title and date */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[var(--color-text-primary)] font-medium truncate">{title}</h3>
                      {date && (
                        <p className="text-[var(--color-text-muted)] text-sm">
                          {format(date, 'dd-MMM-yyyy')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {gig?.media?.length > 0 && (
                        <span className="text-blue-400 text-sm">📸 {gig.media.length}</span>
                      )}
                      {isAdmin && hasFormalGig && gig && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedGig(gig); setShowDeleteGigConfirm(true); }}
                          className="text-[var(--color-text-muted)] hover:text-red-400 text-sm px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete gig"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stats badges */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="px-2 py-0.5 bg-green-600/20 text-green-400 text-xs rounded">
                      {songCount} songs
                    </span>
                    {totalDuration > 0 && (
                      <span className="px-2 py-0.5 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] text-xs rounded">
                        {formatTotalDuration(totalDuration)}
                      </span>
                    )}
                    {Number(gig?.pay) > 0 && (
                      <span className="px-2 py-0.5 bg-yellow-600/20 text-yellow-400 text-xs rounded">
                        {getCurrencySymbol(workspace?.currency)}{Number(gig.pay).toLocaleString()}
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
                              className="w-7 h-7 rounded-full object-cover border-2 border-[var(--color-bg-primary)]"
                            />
                          ) : (
                            <div
                              key={member.id}
                              title={member.name}
                              className="w-7 h-7 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-[var(--color-text-primary)] text-xs font-medium border-2 border-[var(--color-bg-primary)]"
                            >
                              {getInitial(member.name)}
                            </div>
                          )
                        ))}
                      </div>
                      {setlist.performers.length > 6 && (
                        <span className="text-[var(--color-text-muted)] text-xs ml-1">+{setlist.performers.length - 6}</span>
                      )}
                    </div>
                  )}

                  {/* Song preview */}
                  {displaySongs.length > 0 && (
                    <div className="text-sm text-[var(--color-text-muted)]">
                      <ol className="list-decimal list-inside space-y-0.5">
                        {displaySongs.map((item, idx) => (
                          <li key={item.id || idx} className="truncate">
                            {item.song?.title || item.label || 'Unknown'}
                          </li>
                        ))}
                      </ol>
                      {remainingSongs > 0 && (
                        <p className="text-[var(--color-text-muted)] text-xs mt-1">+{remainingSongs} more...</p>
                      )}
                    </div>
                  )}

                  {/* Media thumbnails if any */}
                  {gig?.media?.length > 0 && (
                    <div className="flex gap-1 mt-3 pt-3 border-t border-[var(--color-border)]">
                      {gig.media.slice(0, 4).map((item) => (
                        <div key={item.id} className="w-10 h-10 rounded overflow-hidden bg-[var(--color-bg-secondary)] flex-shrink-0 relative">
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
                            <div className="w-full h-full flex items-center justify-center bg-[var(--color-bg-tertiary)]">
                              <span className="text-blue-400 text-xs">▶</span>
                            </div>
                          ) : item.type === 'audio' ? (
                            <div className="w-full h-full flex items-center justify-center bg-[var(--color-bg-tertiary)]">
                              <span className="text-[var(--color-text-muted)] text-sm">♫</span>
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)]">🔗</div>
                          )}
                        </div>
                      ))}
                      {gig.media.length > 4 && (
                        <div className="w-10 h-10 rounded bg-[var(--color-bg-secondary)] flex items-center justify-center text-[var(--color-text-muted)] text-xs">
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
      <Modal isOpen={!!selectedEntry} onClose={() => setSelectedEntry(null)} maxWidth="max-w-3xl">
        {selectedEntry && (
          <>
            {/* Header */}
            <div className="relative bg-gradient-to-r from-purple-900/50 to-blue-900/50 p-6 rounded-t-lg">
              <button
                onClick={() => setSelectedEntry(null)}
                className="absolute top-4 right-4 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-2xl"
                aria-label="Close"
              >
                &times;
              </button>
              <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-1">
                {selectedEntry.title}
              </h2>
              {selectedEntry.date && (
                <p className="text-purple-200 text-lg">
                  {format(selectedEntry.date, 'EEEE, dd-MMM-yyyy')}
                </p>
              )}
              {selectedEntry.gig?.notes && (
                <p className="text-[var(--color-text-secondary)] mt-2 text-sm">{selectedEntry.gig.notes}</p>
              )}
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-180px)]">
              {/* Stats Row */}
              <div className="flex items-center gap-4 px-6 py-3 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] flex-wrap">
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
                      {Number(selectedEntry.gig?.pay) > 0 && (
                        <span className="px-3 py-1 bg-yellow-600/20 text-yellow-400 text-sm rounded-full">
                          {getCurrencySymbol(workspace?.currency)}{Number(selectedEntry.gig.pay).toLocaleString()}
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
                    <h3 className="text-[var(--color-text-primary)] font-semibold flex items-center gap-2">
                      <span className="text-xl">📝</span> Details
                    </h3>
                    <button
                      onClick={() => handleOpenEditDetails(selectedEntry)}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-text-muted)]">Date</span>
                      <span className="text-[var(--color-text-primary)] font-medium">
                        {selectedEntry.date
                          ? format(selectedEntry.date, 'dd-MMM-yyyy')
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-text-muted)]">Fee</span>
                      <span className="text-[var(--color-text-primary)] font-medium">
                        {selectedEntry.gig?.pay ? `${getCurrencySymbol(workspace?.currency)}${Number(selectedEntry.gig.pay).toLocaleString()}` : '—'}
                      </span>
                    </div>
                    {selectedEntry.gig?.notes && (
                      <div>
                        <span className="text-[var(--color-text-muted)] text-sm">Notes</span>
                        <p className="text-[var(--color-text-primary)] mt-1">{selectedEntry.gig.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Performers */}
                {selectedEntry.setlist && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[var(--color-text-primary)] font-semibold flex items-center gap-2">
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
                        {selectedEntry.setlist.performers.map(member => (
                          <div
                            key={member.id}
                            className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-bg-secondary)] rounded-full"
                          >
                            {member.imageUrl ? (
                              <img
                                src={member.imageUrl}
                                alt={member.name}
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-[var(--color-text-primary)] text-xs font-medium">
                                {getInitial(member.name)}
                              </div>
                            )}
                            <span className="text-[var(--color-text-primary)] text-sm">{member.name}</span>
                            {member.isGuest && (
                              <span className="text-purple-400 text-xs">(Guest)</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleOpenEditPerformers(selectedEntry)}
                        className="w-full py-3 border-2 border-dashed border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] transition-colors text-sm"
                      >
                        + Tag band members who played this gig
                      </button>
                    )}
                  </div>
                )}

                {/* Setlist */}
                <div>
                  <h3 className="text-[var(--color-text-primary)] font-semibold mb-3 flex items-center gap-2">
                    <span className="text-xl">📋</span> Setlist
                    {selectedEntry.setlist && selectedEntry.gig && (
                      <button
                        onClick={() => showSetlistPicker ? setShowSetlistPicker(false) : openSetlistPicker()}
                        className="ml-auto text-xs text-[var(--color-primary)] hover:underline"
                      >
                        {showSetlistPicker ? 'Cancel' : 'Change'}
                      </button>
                    )}
                  </h3>

                  {/* Setlist picker */}
                  {showSetlistPicker && (
                    <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3 mb-3">
                      <input
                        type="text"
                        value={setlistSearch}
                        onChange={(e) => setSetlistSearch(e.target.value)}
                        placeholder="Search setlists..."
                        className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] text-sm mb-2"
                        autoFocus
                      />
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {availableSetlists
                          .filter(s => !setlistSearch || s.name.toLowerCase().includes(setlistSearch.toLowerCase()))
                          .sort((a, b) => new Date(b.performedAt || b.createdAt) - new Date(a.performedAt || a.createdAt))
                          .map(s => {
                            const songCount = s.songs?.filter(sg => sg.type === 'SONG' || !sg.type).length || 0;
                            return (
                              <button
                                key={s.id}
                                onClick={() => handleLinkSetlist(s.id)}
                                className="w-full text-left px-3 py-2 rounded hover:bg-[var(--color-bg-tertiary)] transition-colors flex items-center justify-between"
                              >
                                <span className="text-[var(--color-text-primary)] text-sm truncate">{s.name}</span>
                                <span className="text-[var(--color-text-muted)] text-xs ml-2 flex-shrink-0">{songCount} songs</span>
                              </button>
                            );
                          })}
                        {availableSetlists.filter(s => !setlistSearch || s.name.toLowerCase().includes(setlistSearch.toLowerCase())).length === 0 && (
                          <p className="text-[var(--color-text-muted)] text-sm text-center py-2">No setlists found</p>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedEntry.setlist ? (
                    <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
                      {selectedEntry.setlist.songs?.filter(s => s.type === 'SONG' || !s.type).length > 0 ? (
                        <ol className="space-y-1">
                          {selectedEntry.setlist.songs
                            .filter(s => s.type === 'SONG' || !s.type)
                            .map((item, idx) => (
                              <li key={item.id || idx} className="flex items-center gap-3 py-1">
                                <span className="text-[var(--color-text-muted)] text-sm w-6 text-right">{idx + 1}.</span>
                                <span className="text-[var(--color-text-primary)]">{item.song?.title || item.label || 'Unknown'}</span>
                                {item.song?.artist && (
                                  <span className="text-[var(--color-text-muted)]">— {item.song.artist}</span>
                                )}
                                {item.song?.duration && (
                                  <span className="text-[var(--color-text-muted)] text-sm ml-auto">{formatDuration(item.song.duration)}</span>
                                )}
                              </li>
                            ))}
                        </ol>
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-[var(--color-text-muted)] mb-3">No songs in setlist</p>
                          {selectedEntry.gig && (
                            <button
                              onClick={handleUnlinkSetlist}
                              className="text-xs text-red-400 hover:underline"
                            >
                              Unlink setlist
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
                      <p className="text-[var(--color-text-muted)] text-center mb-3">No setlist linked</p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={openSetlistPicker}
                          className="px-3 py-1.5 bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] text-sm rounded hover:bg-[var(--color-border)] transition-colors"
                          disabled={uploading}
                        >
                          Link Existing Setlist
                        </button>
                        <button
                          onClick={handleCreateAndLinkSetlist}
                          className="px-3 py-1.5 bg-[var(--color-primary)] text-white text-sm rounded hover:opacity-90 transition-opacity"
                          disabled={uploading}
                        >
                          + Create New Setlist
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Media Gallery */}
                {selectedEntry.gig?.media?.length > 0 && (
                  <div>
                    <h3 className="text-[var(--color-text-primary)] font-semibold mb-3 flex items-center gap-2">
                      <span className="text-xl">📸</span> Photos & Videos
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {selectedEntry.gig.media.map((item) => (
                        <div key={item.id} className="relative group">
                          {/* Thumbnail container with aspect ratio */}
                          <div className="relative rounded-lg overflow-hidden bg-[var(--color-bg-secondary)] aspect-video">
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
                                href={isSafeUrl(item.url) ? item.url : "#"}
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
                            ) : item.type === 'audio' ? (
                              <div className="flex flex-col items-center justify-center w-full h-full bg-[var(--color-bg-secondary)] p-3">
                                <svg className="w-8 h-8 text-[var(--color-text-muted)] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                </svg>
                                <audio src={item.url} controls preload="metadata" className="w-full" style={{ height: 32 }} />
                              </div>
                            ) : (
                              <a
                                href={isSafeUrl(item.url) ? item.url : "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center w-full h-full bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                              >
                                <span className="text-4xl">🔗</span>
                              </a>
                            )}
                            {/* Delete button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setDeleteMediaId({ gigId: selectedEntry.gig.id, mediaId: item.id });
                              }}
                              className="absolute top-2 right-2 w-7 h-7 bg-red-600 hover:bg-red-700 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-sm flex items-center justify-center shadow-lg"
                            >
                              ×
                            </button>
                          </div>
                          {/* Caption below thumbnail */}
                          <div className="mt-2 px-1">
                            <p className="text-[var(--color-text-secondary)] text-sm truncate">
                              {item.caption || (item.type === 'youtube' ? 'YouTube Video' : item.type === 'video' ? 'Video' : item.type === 'audio' ? 'Audio' : item.type === 'link' ? 'Link' : '')}
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
                  className="w-full py-3 border-2 border-dashed border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] transition-colors"
                >
                  + Add Photos, Videos, or Links
                </button>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* Add Gig Modal */}
      <Modal isOpen={showAddGig} onClose={() => {
        setShowAddGig(false);
        setNewGigTitle('');
        setNewGigDate('');
        setNewGigVenue('');
      }} title="Add Past Gig">
        <form onSubmit={handleCreateGig} className="p-6 pt-0 space-y-4">
          <div>
            <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-2">
              Gig Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newGigTitle}
              onChange={(e) => setNewGigTitle(e.target.value)}
              placeholder="e.g., Ruby Room Show"
              className="modal-input"
              required
            />
          </div>
          <div>
            <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-2">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={newGigDate}
              onChange={(e) => setNewGigDate(e.target.value)}
              className="modal-input"
              required
            />
          </div>
          <div>
            <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-2">
              Venue
            </label>
            <input
              type="text"
              value={newGigVenue}
              onChange={(e) => setNewGigVenue(e.target.value)}
              placeholder="e.g., The Den"
              className="modal-input"
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
              className="btn btn-primary"
            >
              {uploading ? 'Adding...' : 'Add Gig'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Media Modal */}
      <Modal isOpen={showAddMedia && !!selectedGig} onClose={() => {
        setShowAddMedia(false);
        setMediaUrl('');
        setMediaCaption('');
      }} title="Add Media">
        <div className="p-6 pt-0 space-y-4">
          {/* Upload Files with Drag & Drop */}
          <div>
            <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-2">
              Upload Images or Videos
            </label>
            <label
              className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="text-3xl mb-2">{dragActive ? '\uD83D\uDCE5' : '\uD83D\uDCF7'}</div>
              <span className="text-[var(--color-text-secondary)] text-sm">
                {uploadProgress || (uploading ? 'Uploading...' : dragActive ? 'Drop files here' : 'Drag & drop files here, or click to browse')}
              </span>
              <input
                type="file"
                accept="image/*,video/*,audio/*"
                multiple
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <p className="text-[var(--color-text-muted)] text-xs mt-1">Max 50MB per file. Select multiple files at once.</p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--color-border)]"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[var(--color-modal-bg)] px-2 text-[var(--color-text-muted)] text-sm">or add a link</span>
            </div>
          </div>

          {/* Add URL */}
          <form onSubmit={handleAddUrl}>
            <div className="mb-3">
              <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-2">
                URL (YouTube, image link, etc.)
              </label>
              <input
                type="url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://..."
                className="modal-input"
              />
            </div>
            <div className="mb-3">
              <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-2">
                Caption (optional)
              </label>
              <input
                type="text"
                value={mediaCaption}
                onChange={(e) => setMediaCaption(e.target.value)}
                placeholder="Add a caption..."
                className="modal-input"
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
      </Modal>

      {/* Edit Performers Modal */}
      <Modal isOpen={showEditPerformers} onClose={() => setShowEditPerformers(false)} title="Who Played This Gig?">
        <div className="p-6 pt-0">
          {bandMembers.length === 0 ? (
            <div className="text-center py-6 text-[var(--color-text-muted)]">
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
                  const aIsCurrent = !a.isGuest && (a.stints?.some(s => !s.endDate) || false);
                  const bIsCurrent = !b.isGuest && (b.stints?.some(s => !s.endDate) || false);
                  if (aIsCurrent && !bIsCurrent) return -1;
                  if (!aIsCurrent && bIsCurrent) return 1;
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
                      : 'bg-[var(--color-bg-primary)] border border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPerformerIds.includes(member.id)}
                    onChange={() => togglePerformer(member.id)}
                    className="w-5 h-5 rounded border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-purple-500 focus:ring-purple-500"
                  />
                  {member.imageUrl ? (
                    <img
                      src={member.imageUrl}
                      alt={member.name}
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-[var(--color-text-primary)] font-medium flex-shrink-0">
                      {getInitial(member.name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--color-text-primary)] font-medium">{member.name}</span>
                      {member.isGuest && (
                        <span className="px-1.5 py-0.5 text-xs bg-purple-600/30 text-purple-300 rounded">Guest</span>
                      )}
                    </div>
                    <div className="text-[var(--color-text-muted)] text-sm">
                      {instruments.length > 0 ? instruments.join(', ') : (member.isGuest ? 'Guest musician' : 'Unknown')}
                    </div>
                  </div>
                  {isFormer && (
                    <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 rounded">Former</span>
                  )}
                </label>
                );
              })}
            </div>
            </>
          )}
          <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-[var(--color-border)]">
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
      </Modal>

      {/* Edit Details Modal */}
      <Modal isOpen={showEditDetails} onClose={() => setShowEditDetails(false)} title="Edit Gig Details">
        <div className="p-6 pt-0 space-y-4">
          <div>
            <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-2">
              Name
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Gig name"
              className="modal-input"
            />
          </div>
          <div>
            <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-2">
              Date
            </label>
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="modal-input"
            />
          </div>
          <div>
            <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-2">
              Fee ({getCurrencySymbol(workspace?.currency)})
            </label>
            <input
              type="number"
              value={editFee}
              onChange={(e) => setEditFee(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              className="modal-input"
            />
          </div>
          <div>
            <label className="block text-[var(--color-text-secondary)] text-sm font-medium mb-2">
              Notes
            </label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Add notes about the gig..."
              rows={4}
              className="modal-input resize-none"
            />
          </div>
          <div className="flex gap-2 justify-between pt-2">
            <button
              type="button"
              onClick={() => setShowDeleteGigConfirm(true)}
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
      </Modal>

      {/* Image Lightbox */}
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.url}
          alt={lightboxImage.caption || 'Gig photo'}
          onClose={() => setLightboxImage(null)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteMediaId !== null}
        title="Delete Media"
        message="Delete this media?"
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDeleteMedia(deleteMediaId?.gigId, deleteMediaId?.mediaId)}
        onCancel={() => setDeleteMediaId(null)}
      />

      <ConfirmDialog
        isOpen={showDeleteGigConfirm}
        title="Delete Gig"
        message="Are you sure you want to delete this gig? This cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={handleDeleteGig}
        onCancel={() => { setShowDeleteGigConfirm(false); setSelectedGig(null); }}
      />
    </div>
  );
}

export default GigArchive;
