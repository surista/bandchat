import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { format, formatDistanceToNow, differenceInHours } from 'date-fns';
import api from '../../services/api';
import Modal from '../common/Modal';
import ConfirmDialog from '../common/ConfirmDialog';
import { getCurrencySymbol } from '../../utils/currencies';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';

function formatCommentDate(iso) {
  try {
    const d = new Date(iso);
    if (differenceInHours(new Date(), d) < 24) {
      return formatDistanceToNow(d, { addSuffix: true });
    }
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const CommentItem = memo(function CommentItem({
  comment,
  isOwn,
  canDelete,
  isEditing,
  editingContent,
  submitting,
  onStartEdit,
  onChangeEditingContent,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}) {
  const authorName = comment.createdBy?.displayName || comment.removedCreatorName || 'Unknown';
  const edited = comment.updatedAt && comment.updatedAt !== comment.createdAt;
  const dateLabel = formatCommentDate(comment.createdAt);
  const groupedLabel = `Comment by ${authorName}, ${dateLabel}${edited ? ', edited' : ''}: ${comment.content}`;

  return (
    <div className="bg-[var(--color-bg-tertiary)] rounded-lg p-3 border border-[var(--color-border)]">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0" role="group" aria-label={groupedLabel}>
          {comment.createdBy?.avatarUrl ? (
            <img
              src={comment.createdBy.avatarUrl}
              alt=""
              aria-hidden="true"
              className="w-6 h-6 rounded-full flex-shrink-0"
            />
          ) : (
            <div aria-hidden="true" className="w-6 h-6 rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center text-xs text-[var(--color-text-muted)] flex-shrink-0">
              {authorName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
            {authorName}
          </span>
          <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">
            {dateLabel}
            {edited && ' (edited)'}
          </span>
        </div>
        {!isEditing && (isOwn || canDelete) && (
          <div className="flex gap-1 flex-shrink-0">
            {isOwn && (
              <button
                type="button"
                onClick={() => onStartEdit(comment)}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-1"
                aria-label="Edit comment"
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                className="text-xs text-[var(--color-text-muted)] hover:text-red-500 px-1"
                aria-label="Delete comment"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editingContent}
            onChange={(e) => onChangeEditingContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSaveEdit?.();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCancelEdit?.();
              }
            }}
            className="modal-input w-full"
            rows={2}
            maxLength={2000}
            autoFocus
            aria-label="Edit comment"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={submitting || !editingContent?.trim()}
              className="btn bg-[var(--color-primary)] hover:opacity-90 text-white text-xs disabled:opacity-50"
              aria-busy={submitting || undefined}
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="btn btn-secondary text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap break-words">
          {comment.content}
        </p>
      )}
    </div>
  );
});

// Generate Google Calendar URL
const getGoogleCalendarUrl = (gig, workspaceName) => {
  const formatGoogleDate = (date) => {
    // Use UTC format with Z suffix so Google Calendar interprets it correctly regardless of user's account timezone
    return format(new Date(date), "yyyyMMdd'T'HHmmss'Z'");
  };

  const startDate = formatGoogleDate(gig.date);
  const endDate = gig.endDate
    ? formatGoogleDate(gig.endDate)
    : formatGoogleDate(new Date(new Date(gig.date).getTime() + 2 * 60 * 60 * 1000));

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: workspaceName ? `(${workspaceName}) ${gig.title}` : gig.title,
    dates: `${startDate}/${endDate}`,
  });

  if (gig.venue || gig.address) {
    params.append('location', [gig.venue, gig.address].filter(Boolean).join(', '));
  }

  const details = [];
  if (gig.type) details.push(`Type: ${gig.type}`);
  if (gig.notes) details.push(gig.notes);
  if (details.length > 0) {
    params.append('details', details.join('\n'));
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

function getYouTubeThumbnail(url) {
  try {
    const u = new URL(url);
    let id;
    if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
    else id = u.searchParams.get('v');
    return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
  } catch { return null; }
}

const MEDIA_TYPE_META = {
  image: { icon: '📷', label: 'Photo', color: 'text-blue-400' },
  youtube: { icon: '▶', label: 'YouTube', color: 'text-red-400' },
  video: { icon: '🎬', label: 'Video', color: 'text-blue-400' },
  audio: { icon: '♫', label: 'Audio', color: 'text-purple-400' },
  link: { icon: '🔗', label: 'Link', color: 'text-cyan-400' },
};

function GigForm({ gig, defaultDate, setlists, onSave, onClose, onDelete, isAdmin, workspaceId, workspace, workspaceMembers = [], previousEvents = [], onMediaChange }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();
  const editingCommentIdRef = useRef(null);
  const commentsScrollRef = useRef(null);
  const commentsEndRef = useRef(null);
  // Read-only mode: locked events, OR shared events the user didn't create (non-admin)
  const isCreator = !gig || gig.createdById === user?.id;
  const readOnly = (gig?.isLocked && !isAdmin) || (gig && !isCreator && !isAdmin);

  const getDefaultDate = () => {
    if (gig?.date) return format(new Date(gig.date), 'yyyy-MM-dd');
    if (defaultDate) return format(defaultDate, 'yyyy-MM-dd');
    return format(new Date(), 'yyyy-MM-dd');
  };

  // Get time in HH:MM format from a date, or return default
  const getTimeFromDate = (dateVal, defaultTime) => {
    if (dateVal) {
      const d = new Date(dateVal);
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes();
      // Round to nearest half hour
      const roundedMins = mins < 15 ? '00' : mins < 45 ? '30' : '00';
      const finalHours = mins >= 45 ? ((d.getHours() + 1) % 24).toString().padStart(2, '0') : hours;
      return `${finalHours}:${roundedMins}`;
    }
    return defaultTime;
  };

  // Initialize selected sets from existing gig data (using GigSetlist only)
  const getInitialSets = () => {
    if (gig?.setlists && gig.setlists.length > 0) {
      return gig.setlists
        .sort((a, b) => a.setNumber - b.setNumber)
        .map(gs => gs.setlistId || gs.setlist?.id);
    }
    return [];
  };

  // Detect multi-day: endDate exists and is on a different day than date
  const isMultiDay = () => {
    if (!gig?.date || !gig?.endDate) return false;
    const start = format(new Date(gig.date), 'yyyy-MM-dd');
    const end = format(new Date(gig.endDate), 'yyyy-MM-dd');
    return start !== end;
  };

  const getEndDate = () => {
    if (gig?.endDate) return format(new Date(gig.endDate), 'yyyy-MM-dd');
    return '';
  };

  const [formData, setFormData] = useState({
    title: gig?.title || '',
    type: gig?.type || workspace?.defaultEventType || 'REHEARSAL',
    startDate: getDefaultDate(),
    endDate: getEndDate(),
    multiDay: isMultiDay(),
    startTime: getTimeFromDate(gig?.date, workspace?.defaultStartTime || '19:00'),
    endTime: getTimeFromDate(gig?.endDate, workspace?.defaultEndTime || '21:00'),
    soundCheckTime: gig?.soundCheckTime || '',
    eventStartTime: gig?.eventStartTime || '',
    performanceStartTime: gig?.performanceStartTime || '',
    venue: gig?.venue || (gig ? '' : workspace?.defaultVenue || ''),
    address: gig?.address || '',
    notes: gig?.notes || '',
    pay: gig?.pay || '',
    status: gig?.status || 'SCHEDULED',
    isLocked: gig?.isLocked || false,
    isPersonal: gig?.isPersonal || false
  });

  // Time dropdown visibility
  const [showStartTimeDropdown, setShowStartTimeDropdown] = useState(false);
  const [showEndTimeDropdown, setShowEndTimeDropdown] = useState(false);
  const [showSoundCheckDropdown, setShowSoundCheckDropdown] = useState(false);
  const [showEventStartDropdown, setShowEventStartDropdown] = useState(false);
  const [showPerformanceDropdown, setShowPerformanceDropdown] = useState(false);

  // Generate time options (00:00 to 23:30 in 30-min increments)
  const timeOptions = [];
  for (let h = 0; h < 24; h++) {
    timeOptions.push(`${h.toString().padStart(2, '0')}:00`);
    timeOptions.push(`${h.toString().padStart(2, '0')}:30`);
  }
  const [selectedSets, setSelectedSets] = useState(getInitialSets());
  const [selectedAttendees, setSelectedAttendees] = useState(
    gig?.attendees?.map(a => a.bandMemberId || a.bandMember?.id) || []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availabilitySummary, setAvailabilitySummary] = useState(null);
  const [bandMembers, setBandMembers] = useState({ current: [], former: [], guests: [] });
  const [showMoreAttendees, setShowMoreAttendees] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);
  const [venues, setVenues] = useState([]);
  const [selectedVenueId, setSelectedVenueId] = useState(gig?.venueId || null);
  const [customVenue, setCustomVenue] = useState(!gig?.venueId && !!(gig?.venue));
  const [media, setMedia] = useState(gig?.media || []);
  const [uploading, setUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [myPaddingBefore, setMyPaddingBefore] = useState(gig?.myPaddingBefore || 0);
  const [myPaddingAfter, setMyPaddingAfter] = useState(gig?.myPaddingAfter || 0);
  const [gigConflicts, setGigConflicts] = useState([]);

  // Comments
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');
  const [commentError, setCommentError] = useState('');
  const [commentLoadError, setCommentLoadError] = useState('');
  const [deletingCommentId, setDeletingCommentId] = useState(null);

  const loadComments = useCallback(() => {
    if (!gig?.id) {
      setComments([]);
      return () => {};
    }
    let cancelled = false;
    setCommentsLoading(true);
    setCommentLoadError('');
    api.getGigComments(gig.id)
      .then(data => { if (!cancelled) setComments(Array.isArray(data) ? data : []); })
      .catch((err) => {
        if (!cancelled) {
          setComments([]);
          setCommentLoadError(err?.message || 'Failed to load comments');
        }
      })
      .finally(() => { if (!cancelled) setCommentsLoading(false); });
    return () => { cancelled = true; };
  }, [gig?.id]);

  useEffect(() => {
    return loadComments();
  }, [loadComments]);

  useEffect(() => {
    editingCommentIdRef.current = editingCommentId;
  }, [editingCommentId]);

  // Auto-scroll the comment list to the newest comment when the count grows,
  // but only if the reader is already near the bottom (so we don't fight active scroll-up).
  useEffect(() => {
    const scroller = commentsScrollRef.current;
    if (!scroller || comments.length === 0) return;
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    if (nearBottom) {
      commentsEndRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [comments.length]);

  useEffect(() => {
    if (!socket || !gig?.id) return;
    const onAdded = ({ gigId, comment }) => {
      if (gigId !== gig.id || !comment) return;
      setComments(prev => prev.some(c => c.id === comment.id) ? prev : [...prev, comment]);
    };
    const onUpdated = ({ gigId, comment }) => {
      if (gigId !== gig.id || !comment) return;
      setComments(prev => prev.map(c => c.id === comment.id ? comment : c));
      if (editingCommentIdRef.current === comment.id) {
        toast?.warning?.('This comment was just updated by someone else. Your edits will overwrite theirs if you save.');
      }
    };
    const onDeleted = ({ gigId, commentId }) => {
      if (gigId !== gig.id) return;
      setComments(prev => prev.filter(c => c.id !== commentId));
      if (editingCommentIdRef.current === commentId) {
        setEditingCommentId(null);
        setEditingCommentContent('');
        toast?.info?.('The comment you were editing was deleted.');
      }
    };
    socket.on('gig:commentAdded', onAdded);
    socket.on('gig:commentUpdated', onUpdated);
    socket.on('gig:commentDeleted', onDeleted);
    return () => {
      socket.off('gig:commentAdded', onAdded);
      socket.off('gig:commentUpdated', onUpdated);
      socket.off('gig:commentDeleted', onDeleted);
    };
  }, [socket, gig?.id, toast]);

  const handleAddComment = async () => {
    const content = newComment.trim();
    if (!content || !gig?.id || commentSubmitting) return;
    setCommentSubmitting(true);
    setCommentError('');
    try {
      const created = await api.addGigComment(gig.id, content);
      setComments(prev => prev.some(c => c.id === created.id) ? prev : [...prev, created]);
      setNewComment('');
    } catch (err) {
      setCommentError(err.message || 'Failed to add comment');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleStartEditComment = useCallback((c) => {
    setEditingCommentId(c.id);
    setEditingCommentContent(c.content);
    setCommentError('');
  }, []);

  const handleCancelEditComment = useCallback(() => {
    setEditingCommentId(null);
    setEditingCommentContent('');
  }, []);

  const handleSaveEditComment = useCallback(async () => {
    const content = editingCommentContent.trim();
    if (!content || !gig?.id || !editingCommentId) return;
    setCommentSubmitting(true);
    setCommentError('');
    try {
      const updated = await api.updateGigComment(gig.id, editingCommentId, content);
      setComments(prev => prev.map(c => c.id === updated.id ? updated : c));
      setEditingCommentId(null);
      setEditingCommentContent('');
    } catch (err) {
      setCommentError(err.message || 'Failed to update comment');
    } finally {
      setCommentSubmitting(false);
    }
  }, [editingCommentContent, editingCommentId, gig?.id]);

  const handleDeleteComment = useCallback((commentId) => {
    if (!gig?.id) return;
    setDeletingCommentId(commentId);
  }, [gig?.id]);

  const confirmDeleteComment = useCallback(async () => {
    if (!gig?.id || !deletingCommentId) return;
    const commentId = deletingCommentId;
    setCommentError('');
    try {
      await api.deleteGigComment(gig.id, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      setCommentError(err.message || 'Failed to delete comment');
    } finally {
      setDeletingCommentId(null);
    }
  }, [gig?.id, deletingCommentId]);

  const updateMedia = (newMedia) => {
    setMedia(newMedia);
    if (onMediaChange && gig) onMediaChange(gig.id, newMedia);
  };

  const showSuccess = (msg) => {
    setUploadSuccess(msg);
    setTimeout(() => setUploadSuccess(''), 3000);
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !gig) return;
    setUploading(true);
    setUploadSuccess('');
    try {
      let updated = [...media];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadFileName(`${file.name}${files.length > 1 ? ` (${i + 1}/${files.length})` : ''}`);
        const result = await api.uploadFile(file, workspaceId);
        const type = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
        const newItem = await api.addGigMedia(gig.id, { type, url: result.url, caption: file.name });
        updated = [newItem, ...updated];
      }
      updateMedia(updated);
      showSuccess(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadFileName('');
      e.target.value = '';
    }
  };

  const handleAddUrl = async () => {
    if (!urlInput.trim() || !gig) return;
    const url = urlInput.trim();
    let type = 'link';
    if (/youtube\.com|youtu\.be/i.test(url)) type = 'youtube';
    else if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)) type = 'image';
    try {
      const newItem = await api.addGigMedia(gig.id, { type, url });
      updateMedia([newItem, ...media]);
      setUrlInput('');
      setShowAddUrl(false);
      showSuccess('Link added');
    } catch (err) {
      setError(err.message || 'Failed to add link');
    }
  };

  const handleDeleteMedia = async (mediaId) => {
    try {
      await api.deleteGigMedia(gig.id, mediaId);
      updateMedia(media.filter(m => m.id !== mediaId));
    } catch (err) {
      setError(err.message || 'Failed to delete');
    }
  };

  // Fetch saved venues
  useEffect(() => {
    if (workspaceId) {
      api.getVenues(workspaceId).then(setVenues).catch(() => {});
    }
  }, [workspaceId]);

  // Get unique titles and venues from previous events, filtered by type
  const getSuggestions = (field, eventType) => {
    const filtered = previousEvents.filter(e => {
      if (eventType && e.type !== eventType) return false;
      return e[field] && e[field].trim();
    });
    // Get unique values, sorted by most recent first (most frequently used)
    const counts = {};
    filtered.forEach(e => {
      const val = e[field].trim();
      counts[val] = (counts[val] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([val]) => val);
  };

  const titleSuggestions = getSuggestions('title', formData.type);
  const venueSuggestions = getSuggestions('venue', formData.type);

  // Filter suggestions based on current input
  const filteredTitleSuggestions = titleSuggestions.filter(t =>
    t.toLowerCase().includes(formData.title.toLowerCase()) && t !== formData.title
  );
  const filteredVenueSuggestions = venueSuggestions.filter(v =>
    v.toLowerCase().includes(formData.venue.toLowerCase()) && v !== formData.venue
  );

  // Fetch availability summary when date changes
  useEffect(() => {
    if (workspaceId && formData.startDate) {
      api.getAvailabilitySummary(workspaceId, formData.startDate)
        .then(setAvailabilitySummary)
        .catch(err => console.error('Failed to load availability:', err));
    }
  }, [workspaceId, formData.startDate]);

  // Fetch band members for former/guest selection
  useEffect(() => {
    if (workspaceId) {
      api.getBandMembers(workspaceId)
        .then(setBandMembers)
        .catch(err => console.error('Failed to load band members:', err));
      // Load cross-workspace conflicts
      api.getMyConflicts()
        .then(data => {
          const relevant = (data.conflicts || []).filter(c =>
            c.gigs.some(g => g.gigId === gig?.id)
          );
          setGigConflicts(relevant);
        })
        .catch(() => {});
    }
  }, [workspaceId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Combine date and time fields
      const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
      const endDateStr = formData.multiDay && formData.endDate ? formData.endDate : formData.startDate;
      const endDateTime = new Date(`${endDateStr}T${formData.endTime}`);

      const saveData = {
        title: formData.title,
        type: formData.type,
        date: startDateTime.toISOString(),
        endDate: endDateTime.toISOString(),
        soundCheckTime: formData.soundCheckTime || null,
        eventStartTime: formData.eventStartTime || null,
        performanceStartTime: formData.performanceStartTime || null,
        venue: formData.venue || null,
        address: formData.address || null,
        venueId: selectedVenueId || null,
        notes: formData.notes || null,
        pay: formData.pay ? parseFloat(formData.pay) : null,
        status: formData.status,
        isLocked: formData.isLocked,
        isPersonal: formData.isPersonal,
      };

      // Handle setlist assignment (always use setlistIds array)
      const filteredSets = selectedSets.filter(id => id);
      if (filteredSets.length > 0) {
        saveData.setlistIds = filteredSets;
      } else {
        // Explicitly send empty array to clear any existing setlists
        saveData.setlistIds = [];
      }

      // Include attendees (band member IDs)
      saveData.bandMemberIds = selectedAttendees;

      await onSave(saveData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={readOnly ? 'Event Details' : gig ? 'Edit Event' : 'New Event'} maxWidth="max-w-lg" className="max-h-modal overflow-y-auto">
        <div className="modal-body">
          {readOnly && (
            <div className="bg-yellow-900/30 border border-yellow-600/50 text-yellow-200 px-4 py-2 rounded-lg mb-4 flex items-center gap-2">
              <span>🔒</span>
              <span>This event is locked by an admin and cannot be edited.</span>
            </div>
          )}
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className={readOnly ? 'pointer-events-none opacity-75' : ''}>
            <div className="space-y-4">
              <div className="relative">
                <label className="modal-label" htmlFor="gig-title">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  id="gig-title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  onFocus={() => setShowTitleSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 150)}
                  className="modal-input"
                  placeholder="e.g., Friday Night at The Venue"
                  required
                />
                {showTitleSuggestions && filteredTitleSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg">
                    {filteredTitleSuggestions.slice(0, 8).map(title => (
                      <button
                        key={title}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleChange('title', title);
                          // Also auto-fill venue if we have it from a matching previous event
                          const matchingEvent = previousEvents.find(e => e.title === title && e.type === formData.type);
                          if (matchingEvent?.venue && !formData.venue) {
                            handleChange('venue', matchingEvent.venue);
                            if (matchingEvent.address) {
                              handleChange('address', matchingEvent.address);
                            }
                          }
                          setShowTitleSuggestions(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]"
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="modal-label">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => handleChange('type', e.target.value)}
                    className="modal-input"
                  >
                    <option value="GIG">Gig</option>
                    <option value="REHEARSAL">Rehearsal</option>
                    <option value="RECORDING">Recording</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                {gig && (
                  <div>
                    <label className="modal-label">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => handleChange('status', e.target.value)}
                      className="modal-input"
                    >
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="modal-label">
                  Date <span className="text-red-400">*</span>
                </label>
                <div
                  className="modal-input cursor-pointer flex items-center justify-between"
                  onClick={() => document.getElementById('gig-date-picker').showPicker?.() || document.getElementById('gig-date-picker').click()}
                >
                  <span>
                    {formData.startDate
                      ? format(new Date(formData.startDate + 'T00:00:00'), 'dd-MMM-yyyy')
                      : 'Select date'}
                  </span>
                  <span className="text-[var(--color-text-muted)]">📅</span>
                </div>
                <input
                  id="gig-date-picker"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleChange('startDate', e.target.value)}
                  className="absolute opacity-0 pointer-events-none"
                  style={{ top: 0, left: 0, width: '1px', height: '1px' }}
                  required
                />
              </div>

              <div className="flex items-center gap-2 mt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={formData.multiDay}
                    onChange={(e) => {
                      handleChange('multiDay', e.target.checked);
                      if (!e.target.checked) handleChange('endDate', '');
                    }}
                    className="accent-blue-500"
                  />
                  Multi-day event
                </label>
              </div>

              {formData.multiDay && (
                <div className="relative">
                  <label className="modal-label">
                    End Date <span className="text-red-400">*</span>
                  </label>
                  <div
                    className="modal-input cursor-pointer flex items-center justify-between"
                    onClick={() => document.getElementById('gig-end-date-picker').showPicker?.() || document.getElementById('gig-end-date-picker').click()}
                  >
                    <span>
                      {formData.endDate
                        ? format(new Date(formData.endDate + 'T00:00:00'), 'dd-MMM-yyyy')
                        : 'Select end date'}
                    </span>
                    <span className="text-[var(--color-text-muted)]">📅</span>
                  </div>
                  <input
                    id="gig-end-date-picker"
                    type="date"
                    value={formData.endDate}
                    min={formData.startDate}
                    onChange={(e) => handleChange('endDate', e.target.value)}
                    className="absolute opacity-0 pointer-events-none"
                    style={{ top: 0, left: 0, width: '1px', height: '1px' }}
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="modal-label">Start Time</label>
                  <input
                    type="text"
                    value={formData.startTime}
                    onChange={(e) => handleChange('startTime', e.target.value)}
                    onFocus={() => setShowStartTimeDropdown(true)}
                    onBlur={() => setTimeout(() => setShowStartTimeDropdown(false), 150)}
                    className="modal-input w-full"
                    placeholder="19:00"
                    pattern="[0-2][0-9]:[0-5][0-9]"
                  />
                  {showStartTimeDropdown && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg">
                      {timeOptions.map(time => (
                        <button
                          key={time}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleChange('startTime', time);
                            setShowStartTimeDropdown(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-bg-tertiary)] ${
                            formData.startTime === time ? 'bg-blue-600 text-white' : 'text-[var(--color-text-primary)]'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className="modal-label">End Time</label>
                  <input
                    type="text"
                    value={formData.endTime}
                    onChange={(e) => handleChange('endTime', e.target.value)}
                    onFocus={() => setShowEndTimeDropdown(true)}
                    onBlur={() => setTimeout(() => setShowEndTimeDropdown(false), 150)}
                    className="modal-input w-full"
                    placeholder="21:00"
                    pattern="[0-2][0-9]:[0-5][0-9]"
                  />
                  {showEndTimeDropdown && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg">
                      {timeOptions.map(time => (
                        <button
                          key={time}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleChange('endTime', time);
                            setShowEndTimeDropdown(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-bg-tertiary)] ${
                            formData.endTime === time ? 'bg-blue-600 text-white' : 'text-[var(--color-text-primary)]'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Optional Gig Times (Sound Check, Event Start, Performance) */}
              {formData.type === 'GIG' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="relative">
                    <label className="modal-label text-xs">Sound Check</label>
                    <input
                      type="text"
                      value={formData.soundCheckTime}
                      onChange={(e) => handleChange('soundCheckTime', e.target.value)}
                      onFocus={() => setShowSoundCheckDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSoundCheckDropdown(false), 150)}
                      className="modal-input w-full text-sm"
                      placeholder="16:00"
                      pattern="[0-2][0-9]:[0-5][0-9]"
                    />
                    {showSoundCheckDropdown && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg">
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); handleChange('soundCheckTime', ''); setShowSoundCheckDropdown(false); }}
                          className="w-full px-3 py-1.5 text-left text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)]"
                        >
                          Clear
                        </button>
                        {timeOptions.map(time => (
                          <button
                            key={time}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); handleChange('soundCheckTime', time); setShowSoundCheckDropdown(false); }}
                            className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-bg-tertiary)] ${formData.soundCheckTime === time ? 'bg-blue-600 text-white' : 'text-[var(--color-text-primary)]'}`}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <label className="modal-label text-xs">Doors Open</label>
                    <input
                      type="text"
                      value={formData.eventStartTime}
                      onChange={(e) => handleChange('eventStartTime', e.target.value)}
                      onFocus={() => setShowEventStartDropdown(true)}
                      onBlur={() => setTimeout(() => setShowEventStartDropdown(false), 150)}
                      className="modal-input w-full text-sm"
                      placeholder="19:00"
                      pattern="[0-2][0-9]:[0-5][0-9]"
                    />
                    {showEventStartDropdown && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg">
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); handleChange('eventStartTime', ''); setShowEventStartDropdown(false); }}
                          className="w-full px-3 py-1.5 text-left text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)]"
                        >
                          Clear
                        </button>
                        {timeOptions.map(time => (
                          <button
                            key={time}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); handleChange('eventStartTime', time); setShowEventStartDropdown(false); }}
                            className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-bg-tertiary)] ${formData.eventStartTime === time ? 'bg-blue-600 text-white' : 'text-[var(--color-text-primary)]'}`}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <label className="modal-label text-xs">Stage Time</label>
                    <input
                      type="text"
                      value={formData.performanceStartTime}
                      onChange={(e) => handleChange('performanceStartTime', e.target.value)}
                      onFocus={() => setShowPerformanceDropdown(true)}
                      onBlur={() => setTimeout(() => setShowPerformanceDropdown(false), 150)}
                      className="modal-input w-full text-sm"
                      placeholder="20:00"
                      pattern="[0-2][0-9]:[0-5][0-9]"
                    />
                    {showPerformanceDropdown && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg shadow-lg">
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); handleChange('performanceStartTime', ''); setShowPerformanceDropdown(false); }}
                          className="w-full px-3 py-1.5 text-left text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)]"
                        >
                          Clear
                        </button>
                        {timeOptions.map(time => (
                          <button
                            key={time}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); handleChange('performanceStartTime', time); setShowPerformanceDropdown(false); }}
                            className={`w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-bg-tertiary)] ${formData.performanceStartTime === time ? 'bg-blue-600 text-white' : 'text-[var(--color-text-primary)]'}`}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Availability Summary */}
              {availabilitySummary && availabilitySummary.total > 0 && (
                <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[var(--color-text-muted)]">Team Availability</span>
                    <span className="text-sm font-medium">
                      <span className="text-green-400">{availabilitySummary.available}</span>
                      <span className="text-[var(--color-text-muted)]">/{availabilitySummary.total}</span>
                    </span>
                  </div>
                  <div className="flex gap-0.5 h-2 rounded overflow-hidden mb-2">
                    {availabilitySummary.available > 0 && (
                      <div className="bg-green-500" style={{ flex: availabilitySummary.available }} />
                    )}
                    {availabilitySummary.maybe > 0 && (
                      <div className="bg-yellow-500" style={{ flex: availabilitySummary.maybe }} />
                    )}
                    {availabilitySummary.unavailable > 0 && (
                      <div className="bg-red-500" style={{ flex: availabilitySummary.unavailable }} />
                    )}
                    {availabilitySummary.unknown > 0 && (
                      <div className="bg-[var(--color-bg-tertiary)]" style={{ flex: availabilitySummary.unknown }} />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {availabilitySummary.members?.map(m => (
                      <span
                        key={m.user.id}
                        className={`px-2 py-0.5 rounded ${
                          m.status === 'AVAILABLE' ? 'bg-green-900/50 text-green-300' :
                          m.status === 'UNAVAILABLE' ? 'bg-red-900/50 text-red-300' :
                          m.status === 'MAYBE' ? 'bg-yellow-900/50 text-yellow-300' :
                          'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]'
                        }`}
                        title={m.note || m.status}
                      >
                        {m.user.displayName?.split(' ')[0]}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Attendees Selection - uses band members */}
              {(() => {
                const allBandMembers = [
                  ...(bandMembers.current || []),
                  ...(bandMembers.former || []),
                  ...(bandMembers.guests || [])
                ];
                if (allBandMembers.length === 0) return null;

                // Filter for search
                const filteredMembers = attendeeSearch
                  ? allBandMembers.filter(bm =>
                      bm.name.toLowerCase().includes(attendeeSearch.toLowerCase())
                    )
                  : allBandMembers;

                // Separate current vs former/guest
                const currentMembers = filteredMembers.filter(bm => !bm.isGuest && bandMembers.current?.some(c => c.id === bm.id));
                const otherMembers = filteredMembers.filter(bm => bm.isGuest || bandMembers.former?.some(f => f.id === bm.id) || bandMembers.guests?.some(g => g.id === bm.id));

                return (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="modal-label mb-0">
                        Attending
                        <span className="text-[var(--color-text-muted)] font-normal ml-2">
                          ({selectedAttendees.length} selected)
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const allCurrentIds = currentMembers.map(bm => bm.id);
                          const allSelected = allCurrentIds.every(id => selectedAttendees.includes(id));
                          if (allSelected) {
                            // Deselect all current members
                            setSelectedAttendees(selectedAttendees.filter(id => !allCurrentIds.includes(id)));
                          } else {
                            // Select all current members (keep any others already selected)
                            setSelectedAttendees([...new Set([...selectedAttendees, ...allCurrentIds])]);
                          }
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        {currentMembers.every(bm => selectedAttendees.includes(bm.id)) ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    {allBandMembers.length > 6 && (
                      <input
                        type="text"
                        placeholder="Search members..."
                        value={attendeeSearch}
                        onChange={(e) => setAttendeeSearch(e.target.value)}
                        className="w-full px-3 py-1.5 mb-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] text-sm"
                      />
                    )}

                    {/* Current band members */}
                    <div className="flex flex-wrap gap-2">
                      {currentMembers.map(bm => {
                        const isSelected = selectedAttendees.includes(bm.id);
                        // Get availability status if this band member is linked to a user
                        const availStatus = bm.linkedUserId && availabilitySummary?.members?.find(
                          m => m.user.id === bm.linkedUserId
                        )?.status;

                        return (
                          <button
                            key={bm.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedAttendees(selectedAttendees.filter(id => id !== bm.id));
                              } else {
                                setSelectedAttendees([...selectedAttendees, bm.id]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                              isSelected
                                ? 'bg-green-600 text-white ring-2 ring-green-400'
                                : availStatus === 'UNAVAILABLE'
                                ? 'bg-[var(--color-bg-tertiary)] text-red-400 hover:bg-[var(--color-bg-secondary)]'
                                : availStatus === 'MAYBE'
                                ? 'bg-[var(--color-bg-tertiary)] text-yellow-400 hover:bg-[var(--color-bg-secondary)]'
                                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]'
                            }`}
                          >
                            {isSelected && <span className="mr-1">✓</span>}
                            {bm.name.split(' ')[0]}
                          </button>
                        );
                      })}
                    </div>

                    {/* Former/Guest members */}
                    {otherMembers.length > 0 && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setShowMoreAttendees(!showMoreAttendees)}
                          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <span className={`transform transition-transform ${showMoreAttendees ? 'rotate-90' : ''}`}>
                            ▶
                          </span>
                          {showMoreAttendees ? 'Hide' : 'Show'} former/guest members ({otherMembers.length})
                        </button>

                        {showMoreAttendees && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {otherMembers.map(bm => {
                              const isSelected = selectedAttendees.includes(bm.id);
                              const label = bm.isGuest ? 'Guest' : 'Former';

                              return (
                                <button
                                  key={bm.id}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedAttendees(selectedAttendees.filter(id => id !== bm.id));
                                    } else {
                                      setSelectedAttendees([...selectedAttendees, bm.id]);
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                    isSelected
                                      ? 'bg-green-600 text-white ring-2 ring-green-400'
                                      : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
                                  }`}
                                >
                                  {isSelected && <span className="mr-1">✓</span>}
                                  {bm.name}
                                  <span className={`ml-1 text-xs ${bm.isGuest ? 'text-purple-400' : 'text-[var(--color-text-muted)]'}`}>
                                    ({label})
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedAttendees.length === 0 && (
                      <p className="text-xs text-[var(--color-text-muted)] mt-2">
                        Click members to mark them as attending
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Travel & Buffer Time */}
              {gig && (
                <div>
                  <label className="modal-label">Travel & Buffer Time</label>
                  <p className="text-xs text-[var(--color-text-muted)] mb-2">
                    Add buffer time to mark yourself as unavailable in other bands
                  </p>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">Before (minutes)</label>
                      <select
                        value={myPaddingBefore}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setMyPaddingBefore(val);
                          api.setMyAttendance(gig.id, { paddingBefore: val }).catch(() => {});
                        }}
                        className="modal-input"
                      >
                        {[0, 15, 30, 45, 60, 90, 120].map(m => (
                          <option key={m} value={m}>{m === 0 ? 'None' : `${m} min`}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">After (minutes)</label>
                      <select
                        value={myPaddingAfter}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setMyPaddingAfter(val);
                          api.setMyAttendance(gig.id, { paddingAfter: val }).catch(() => {});
                        }}
                        className="modal-input"
                      >
                        {[0, 15, 30, 45, 60, 90, 120].map(m => (
                          <option key={m} value={m}>{m === 0 ? 'None' : `${m} min`}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Scheduling Conflicts */}
              {gigConflicts.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-yellow-500">⚠</span>
                    <span className="text-sm font-medium text-yellow-500">Scheduling Conflicts</span>
                  </div>
                  {gigConflicts.map((conflict, i) => {
                    const otherGig = conflict.gigs.find(g => g.gigId !== gig?.id);
                    if (!otherGig) return null;
                    return (
                      <div key={i} className="text-sm text-[var(--color-text-secondary)] ml-6">
                        {otherGig.gigType === 'REHEARSAL' ? 'Rehearsal' : otherGig.gigType === 'RECORDING' ? 'Recording' : 'Gig'} with <span className="text-[var(--color-text-primary)] font-medium">{otherGig.workspaceName}</span>
                        {otherGig.venue && <span className="text-[var(--color-text-muted)]"> at {otherGig.venue}</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="modal-label" htmlFor="gig-venue">Venue</label>
                {venues.length > 0 && !customVenue ? (
                  <div className="flex gap-2">
                    <select
                      id="gig-venue"
                      value={selectedVenueId || ''}
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id === '__custom') {
                          setSelectedVenueId(null);
                          setCustomVenue(true);
                          handleChange('venue', '');
                          handleChange('address', '');
                        } else if (id) {
                          const v = venues.find(v => v.id === id);
                          setSelectedVenueId(id);
                          handleChange('venue', v?.name || '');
                          handleChange('address', v?.address || '');
                        } else {
                          setSelectedVenueId(null);
                          handleChange('venue', '');
                          handleChange('address', '');
                        }
                      }}
                      className="modal-input flex-1"
                      disabled={readOnly}
                    >
                      <option value="">Select a venue...</option>
                      {venues.map(v => (
                        <option key={v.id} value={v.id}>{v.name}{v.city ? ` — ${v.city}` : ''}</option>
                      ))}
                      <option value="__custom">Other (type manually)</option>
                    </select>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      id="gig-venue"
                      type="text"
                      value={formData.venue}
                      onChange={(e) => handleChange('venue', e.target.value)}
                      onFocus={() => setShowVenueSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowVenueSuggestions(false), 150)}
                      className="modal-input"
                      placeholder="Venue name"
                      disabled={readOnly}
                    />
                    {showVenueSuggestions && filteredVenueSuggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg shadow-lg">
                        {filteredVenueSuggestions.slice(0, 8).map(venue => (
                          <button
                            key={venue}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleChange('venue', venue);
                              const matchingEvent = previousEvents.find(ev => ev.venue === venue);
                              if (matchingEvent?.address && !formData.address) {
                                handleChange('address', matchingEvent.address);
                              }
                              setShowVenueSuggestions(false);
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]"
                          >
                            {venue}
                          </button>
                        ))}
                      </div>
                    )}
                    {venues.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setCustomVenue(false); setSelectedVenueId(null); handleChange('venue', ''); handleChange('address', ''); }}
                        className="text-xs text-[var(--color-primary)] hover:underline mt-1"
                      >
                        Choose from saved venues
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="modal-label" htmlFor="gig-address">Address</label>
                <input
                  id="gig-address"
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  className="modal-input"
                  placeholder="Full address"
                  disabled={readOnly}
                />
              </div>

              {setlists.length > 0 && formData.type === 'GIG' && (
                <div>
                  <label className="modal-label">Setlist(s)</label>
                  <div className="space-y-2">
                    {selectedSets.length === 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 flex items-center justify-center bg-indigo-600/30 text-indigo-300 rounded-full font-bold text-sm">
                          1
                        </span>
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              setSelectedSets([e.target.value]);
                            }
                          }}
                          className="modal-input flex-1"
                        >
                          <option value="">No setlist</option>
                          {setlists.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        {selectedSets.map((setId, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <span className="w-8 h-8 flex items-center justify-center bg-indigo-600/30 text-indigo-300 rounded-full font-bold text-sm">
                              {index + 1}
                            </span>
                            <select
                              value={setId}
                              onChange={(e) => {
                                const newSets = [...selectedSets];
                                newSets[index] = e.target.value;
                                setSelectedSets(newSets.filter(id => id)); // Remove empty selections
                              }}
                              className="modal-input flex-1"
                            >
                              <option value="">Select setlist...</option>
                              {setlists.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setSelectedSets(selectedSets.filter((_, i) => i !== index))}
                              className="p-2 text-red-400 hover:text-red-300 min-w-[36px] min-h-[36px]"
                              aria-label="Remove set"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setSelectedSets([...selectedSets, ''])}
                          className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                        >
                          + Add Another Set
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {formData.type === 'GIG' && (
                <div>
                  <label className="modal-label" htmlFor="gig-pay">Pay ({getCurrencySymbol(workspace?.currency)})</label>
                  <input
                    id="gig-pay"
                    type="number"
                    value={formData.pay}
                    onChange={(e) => handleChange('pay', e.target.value)}
                    className="modal-input"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
              )}

              <div>
                <label className="modal-label" htmlFor="gig-notes">Notes</label>
                <textarea
                  id="gig-notes"
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  className="modal-input"
                  rows={3}
                  placeholder="Additional details..."
                />
              </div>

              {/* Attachments - only for existing gigs */}
              {gig && (
                <div>
                  <label className="modal-label">Attachments</label>

                  {/* Existing media */}
                  {media.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {media.map(item => {
                        const meta = MEDIA_TYPE_META[item.type] || MEDIA_TYPE_META.link;
                        return (
                          <div key={item.id} className="relative bg-[var(--color-bg-tertiary)] rounded-lg overflow-hidden group/media">
                            {/* Delete button */}
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => handleDeleteMedia(item.id)}
                                className="absolute top-1 right-1 z-10 w-6 h-6 bg-black/60 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-sm opacity-0 group-hover/media:opacity-100 transition-opacity"
                                aria-label="Remove attachment"
                              >
                                ×
                              </button>
                            )}

                            {item.type === 'image' ? (
                              <a href={item.url} target="_blank" rel="noopener noreferrer">
                                <img src={item.url} alt={item.caption || ''} className="w-full aspect-video object-cover" />
                              </a>
                            ) : item.type === 'youtube' ? (
                              <a href={item.url} target="_blank" rel="noopener noreferrer" className="block relative">
                                <img src={getYouTubeThumbnail(item.url)} alt={item.caption || 'YouTube'} className="w-full aspect-video object-cover" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-10 h-7 bg-red-600 rounded-lg flex items-center justify-center shadow-lg">
                                    <span className="text-white text-sm ml-0.5">▶</span>
                                  </div>
                                </div>
                              </a>
                            ) : item.type === 'video' ? (
                              <video src={item.url} controls className="w-full aspect-video" preload="metadata" />
                            ) : item.type === 'audio' ? (
                              <div className="p-3 flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-purple-400 text-lg">♫</span>
                                  <span className="text-sm text-[var(--color-text-primary)] truncate flex-1">
                                    {item.caption || 'Audio'}
                                  </span>
                                </div>
                                <audio src={item.url} controls className="w-full h-8" preload="metadata" />
                              </div>
                            ) : (
                              <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 hover:bg-[var(--color-bg-secondary)] transition-colors">
                                <span className="text-cyan-400 text-lg">🔗</span>
                                <span className="text-sm text-[var(--color-text-primary)] truncate flex-1">
                                  {item.caption || item.url}
                                </span>
                              </a>
                            )}

                            {/* Caption for visual types */}
                            {item.caption && (item.type === 'image' || item.type === 'youtube' || item.type === 'video') && (
                              <div className="px-2 py-1">
                                <p className="text-xs text-[var(--color-text-muted)] truncate">{item.caption}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add buttons */}
                  {!readOnly && (
                    <div className="space-y-2">
                      <div className="flex gap-2 flex-wrap">
                        <label className="btn bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm cursor-pointer">
                          📷 Photos
                          <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
                        </label>
                        <label className="btn bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm cursor-pointer">
                          ♫ Audio
                          <input type="file" accept="audio/*" multiple onChange={handleFileUpload} className="hidden" />
                        </label>
                        <label className="btn bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm cursor-pointer">
                          📎 Files
                          <input type="file" accept="image/*,audio/*,video/*,.pdf,.zip" multiple onChange={handleFileUpload} className="hidden" />
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowAddUrl(!showAddUrl)}
                          className="btn bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm"
                        >
                          🔗 Link / YouTube
                        </button>
                      </div>

                      {showAddUrl && (
                        <div className="flex gap-2">
                          <input
                            type="url"
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddUrl())}
                            className="modal-input flex-1"
                            placeholder="Paste URL (YouTube, image, or any link)..."
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleAddUrl}
                            disabled={!urlInput.trim()}
                            className="btn bg-green-600 hover:bg-green-700 text-white text-sm disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                      )}

                      {uploading && (
                        <div className="flex items-center gap-3 bg-blue-900/30 border border-blue-500/30 rounded-lg px-4 py-3">
                          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                          <div>
                            <p className="text-sm text-blue-300 font-medium">Uploading...</p>
                            {uploadFileName && <p className="text-xs text-blue-400/70 truncate">{uploadFileName}</p>}
                          </div>
                        </div>
                      )}

                      {uploadSuccess && (
                        <div className="flex items-center gap-2 bg-green-900/30 border border-green-500/30 rounded-lg px-4 py-3">
                          <span className="text-green-400 text-lg">✓</span>
                          <p className="text-sm text-green-300 font-medium">{uploadSuccess}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {media.length === 0 && readOnly && (
                    <p className="text-sm text-[var(--color-text-muted)]">No attachments</p>
                  )}
                </div>
              )}

              {/* Comments - only for existing gigs. Always interactive even in readOnly. */}
              {gig && (
                <div>
                  <label className="modal-label">Comments</label>

                  {commentsLoading && (
                    <p className="text-sm text-[var(--color-text-muted)]">Loading comments...</p>
                  )}

                  {!commentsLoading && commentLoadError && (
                    <div className="flex items-center gap-3 mb-3 text-sm">
                      <span className="text-red-400">{commentLoadError}</span>
                      <button
                        type="button"
                        onClick={loadComments}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {!commentsLoading && !commentLoadError && comments.length === 0 && (
                    <p className="text-sm text-[var(--color-text-muted)] mb-3">No comments yet.</p>
                  )}

                  {comments.length > 0 && (
                    <div
                      ref={commentsScrollRef}
                      className="space-y-2 mb-3 max-h-80 overflow-y-auto pr-1"
                      aria-live="polite"
                      aria-relevant="additions"
                    >
                      {comments.map(c => {
                        const isEditing = editingCommentId === c.id;
                        return (
                          <CommentItem
                            key={c.id}
                            comment={c}
                            isOwn={c.createdById === user?.id}
                            canDelete={(c.createdById === user?.id) || isAdmin}
                            isEditing={isEditing}
                            editingContent={isEditing ? editingCommentContent : undefined}
                            submitting={isEditing && commentSubmitting}
                            onStartEdit={handleStartEditComment}
                            onChangeEditingContent={setEditingCommentContent}
                            onSaveEdit={handleSaveEditComment}
                            onCancelEdit={handleCancelEditComment}
                            onDelete={handleDeleteComment}
                          />
                        );
                      })}
                      <div ref={commentsEndRef} />
                    </div>
                  )}

                  {/* Add new comment - any workspace member */}
                  <div className="space-y-2">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          handleAddComment();
                        }
                      }}
                      className="modal-input w-full"
                      rows={2}
                      maxLength={2000}
                      placeholder="Add a comment... (Ctrl+Enter to post)"
                      aria-label="New comment"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {newComment.length > 0 && `${newComment.length}/2000`}
                      </span>
                      <button
                        type="button"
                        onClick={handleAddComment}
                        disabled={commentSubmitting || !newComment.trim()}
                        className="btn bg-[var(--color-primary)] hover:opacity-90 text-white text-sm disabled:opacity-50"
                      >
                        {commentSubmitting ? 'Posting...' : 'Post comment'}
                      </button>
                    </div>
                    {commentError && (
                      <p className="text-xs text-red-400">{commentError}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Visibility options */}
              <div className="space-y-3 pt-2 border-t border-[var(--color-border)]">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPersonal}
                    onChange={(e) => handleChange('isPersonal', e.target.checked)}
                    className="rounded bg-[var(--color-bg-tertiary)] border-[var(--color-border)] text-blue-500 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-[var(--color-text-primary)]">Personal entry</span>
                    <p className="text-xs text-[var(--color-text-muted)]">Only you can see this event</p>
                  </div>
                </label>

                {isAdmin && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isLocked}
                      onChange={(e) => handleChange('isLocked', e.target.checked)}
                      className="rounded bg-[var(--color-bg-tertiary)] border-[var(--color-border)] text-yellow-500 focus:ring-yellow-500"
                    />
                    <div>
                      <span className="text-[var(--color-text-primary)]">Lock event</span>
                      <p className="text-xs text-[var(--color-text-muted)]">Only admins can edit or delete</p>
                    </div>
                  </label>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-6 flex-wrap">
              {gig && onDelete && !readOnly && (
                <button
                  type="button"
                  onClick={() => onDelete(gig.id)}
                  className="btn bg-red-600 hover:bg-red-700 text-white"
                >
                  Delete
                </button>
              )}
              {gig && (
                <a
                  href={getGoogleCalendarUrl(gig, workspace?.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn bg-orange-600 hover:bg-orange-700 text-white"
                >
                  + Google Cal
                </a>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
              >
                {readOnly ? 'Close' : 'Cancel'}
              </button>
              {!readOnly && (
                <button
                  type="submit"
                  disabled={loading}
                  className="btn bg-green-600 hover:bg-green-700 text-white"
                >
                  {loading ? 'Saving...' : gig ? 'Update' : 'Create'}
                </button>
              )}
            </div>
          </form>
        </div>
        <ConfirmDialog
          isOpen={deletingCommentId !== null}
          title="Delete Comment"
          message="Delete this comment? This cannot be undone."
          confirmText="Delete"
          confirmVariant="danger"
          onConfirm={confirmDeleteComment}
          onCancel={() => setDeletingCommentId(null)}
        />
    </Modal>
  );
}

export default GigForm;
