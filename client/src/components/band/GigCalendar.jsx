import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, subDays, addDays, isToday } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import useIsAdmin from '../../hooks/useIsAdmin';
import GigForm from './GigForm';
import ConfirmDialog from '../common/ConfirmDialog';
import ContextMenu from '../common/ContextMenu';
import useLongPress from '../../hooks/useLongPress';
import Modal from '../common/Modal';
import Skeleton from '../common/Skeleton';
import ErrorMessage from '../common/ErrorMessage';
import { getCurrencySymbol } from '../../utils/currencies';

// Compact single-line row for list view
function GigCompactRow({ gig, isAdmin, getTypeColor, formatTimeRange, onEdit, onDelete, onContextMenu, workspace }) {
  const canEdit = !gig.isExternal && (!gig.isLocked || isAdmin);
  const longPress = useLongPress({
    onLongPress: (pos) => onContextMenu(pos),
    onTap: !gig.isExternal ? onEdit : undefined, // Always open for viewing (GigForm shows read-only for locked)
  });

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 hover:bg-[var(--color-bg-tertiary)] rounded cursor-pointer group ${
        gig.status === 'CANCELLED' ? 'opacity-50' : ''
      }`}
      {...longPress}
    >
      {/* Date */}
      <div className="shrink-0 min-w-[5rem] text-sm">
        <span className="text-[var(--color-text-primary)] font-medium">
          {format(new Date(gig.date), 'dd-MMM')}
        </span>
        <span className="text-[var(--color-text-muted)] ml-1 hidden sm:inline">
          {format(new Date(gig.date), 'EEE')}
        </span>
      </div>

      {/* Time */}
      <div className="shrink-0 min-w-[4.5rem] text-sm text-[var(--color-text-secondary)] hidden sm:block">
        {formatTimeRange(gig.date, gig.endDate)}
      </div>

      {/* Title + Icons */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {gig.isLocked && <span className="text-xs">🔒</span>}
        {gig.isPersonal && <span className="text-xs">👤</span>}
        <span className={`text-sm truncate ${gig.status === 'CANCELLED' ? 'line-through' : ''} text-[var(--color-text-primary)]`}>
          {gig.title}
        </span>
        {gig.isExternal && (
          <span className="text-xs text-[var(--color-text-muted)]">
            ({gig.workspace?.name || 'Other'})
          </span>
        )}
      </div>

      {/* Venue */}
      <div className="shrink-0 max-w-[8rem] text-sm text-[var(--color-text-muted)] truncate hidden md:block">
        {gig.venue || '—'}
      </div>

      {/* Type badge */}
      <div className="shrink-0 text-right">
        <span className={`text-xs px-2 py-0.5 rounded ${getTypeColor(gig.type, gig.isExternal, gig.workspaceId)} text-white`}>
          {gig.type}
        </span>
      </div>

      {/* Quick actions on hover */}
      <div className="w-16 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-1">
        {canEdit && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-1"
              title="Edit"
            >
              ✏️
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-xs text-[var(--color-text-muted)] hover:text-red-400 px-1"
              title="Delete"
            >
              🗑️
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function GigListCard({ gig, isAdmin, getTypeColor, getStatusBadge, formatTimeRange, onEdit, onDuplicate, onComplete, onDelete, onContextMenu, getGoogleCalendarUrl }) {
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const canEdit = !gig.isExternal && (!gig.isLocked || isAdmin);
  const longPress = useLongPress({
    onLongPress: (pos) => onContextMenu(pos),
    onTap: !gig.isExternal ? onEdit : undefined, // Always open for viewing (GigForm shows read-only for locked)
  });

  return (
    <div
      className={`bg-[var(--color-bg-secondary)] rounded-lg p-4 group ${gig.isExternal ? 'border-2 border-dashed border-[var(--color-border)]' : 'border border-[var(--color-border)]'}`}
      {...longPress}
    >
      <div className="flex items-start gap-4">
        <div className={`w-2 h-full rounded ${getTypeColor(gig.type, gig.isExternal, gig.workspaceId)}`} />
        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-[var(--color-text-primary)] font-medium">
                {gig.isLocked && <span className="mr-1">🔒</span>}
                {gig.isPersonal && <span className="mr-1">👤</span>}
                {gig.title}
                {gig.isExternal && (
                  <span className="ml-2 text-xs text-[var(--color-text-muted)] font-normal">
                    ({gig.workspace?.name || 'Other band'})
                  </span>
                )}
              </h3>
              <p className="text-[var(--color-text-muted)] text-sm">
                {format(new Date(gig.date), 'EEEE, MMMM d, yyyy')} {formatTimeRange(gig.date, gig.endDate)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(gig.status)}
              <span className={`text-xs px-2 py-1 rounded ${getTypeColor(gig.type, gig.isExternal, gig.workspaceId)} text-white`}>
                {gig.type}
              </span>
              <div className="relative sm:hidden">
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
                    <div className="absolute right-0 top-full mt-1 bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border)] py-1 z-50 min-w-[160px]">
                      <a
                        href={getGoogleCalendarUrl(gig)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => { e.stopPropagation(); setShowMobileMenu(false); }}
                        className="block w-full px-4 py-2 text-left text-sm text-orange-400 hover:bg-[var(--color-bg-tertiary)] hover:text-orange-300"
                      >
                        📅 + Google Cal
                      </a>
                      {!gig.isExternal && (
                        <>
                          {canEdit && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowMobileMenu(false); onEdit(); }}
                              className="w-full px-4 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
                            >
                              ✏️ Edit
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowMobileMenu(false); onDuplicate(); }}
                            className="w-full px-4 py-2 text-left text-sm text-blue-400 hover:bg-[var(--color-bg-tertiary)] hover:text-blue-300"
                          >
                            📋 Copy
                          </button>
                          {gig.status === 'SCHEDULED' && canEdit && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowMobileMenu(false); onComplete(); }}
                              className="w-full px-4 py-2 text-left text-sm text-green-400 hover:bg-[var(--color-bg-tertiary)] hover:text-green-300"
                            >
                              ✅ Mark Complete
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowMobileMenu(false); onDelete(); }}
                              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-[var(--color-bg-tertiary)] hover:text-red-300"
                            >
                              🗑️ Delete
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {(gig.venue || gig.address) && (
            <p className="text-[var(--color-text-muted)] text-sm mt-2">
              📍 {gig.venue}{gig.address && ` - ${gig.address}`}
            </p>
          )}

          {gig.setlists && gig.setlists.length > 0 ? (
            <div className="text-[var(--color-text-muted)] text-sm mt-1">
              <span className="text-indigo-400">🎵 {gig.setlists.length} Sets:</span>
              <span className="ml-2">
                {gig.setlists
                  .sort((a, b) => a.setNumber - b.setNumber)
                  .map(gs => gs.setlist?.name || `Set ${gs.setNumber}`)
                  .join(' → ')}
              </span>
            </div>
          ) : gig.setlist && (
            <p className="text-[var(--color-text-muted)] text-sm mt-1">
              🎵 Setlist: {gig.setlist.name}
            </p>
          )}

          {Number(gig.pay) > 0 && (
            <p className="text-green-400 text-sm mt-1">
              {/* eslint-disable-next-line no-undef */}
              💰 {getCurrencySymbol(workspace?.currency)}{Number(gig.pay).toLocaleString()}
            </p>
          )}

          {gig.notes && (
            <p className="text-[var(--color-text-muted)] text-sm mt-2 italic">{gig.notes}</p>
          )}

          {/* Action buttons - hidden on mobile, visible on hover on desktop */}
          <div className="hidden sm:flex gap-2 mt-3 flex-wrap opacity-0 group-hover:opacity-100 transition-opacity">
            <a
              href={getGoogleCalendarUrl(gig)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-orange-400 hover:text-orange-300"
            >
              + Google Cal
            </a>
            {!gig.isExternal && (
              <>
                {canEdit && (
                  <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                    Edit
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="text-sm text-blue-400 hover:text-blue-300">
                  Copy
                </button>
                {gig.status === 'SCHEDULED' && canEdit && (
                  <button onClick={(e) => { e.stopPropagation(); onComplete(); }} className="text-sm text-green-400 hover:text-green-300">
                    Mark Complete
                  </button>
                )}
                {canEdit && (
                  <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-sm text-red-400 hover:text-red-300">
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GigCalendar({ workspaceId, workspace, focusGigId }) {
  const { user } = useAuth();
  const toast = useToast();

  const isAdmin = useIsAdmin(workspace);
  const [gigs, setGigs] = useState([]);
  const [otherWorkspaceGigs, setOtherWorkspaceGigs] = useState([]);
  const [showOtherWorkspaces, setShowOtherWorkspaces] = useState(false);
  const [setlists, setSetlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    // Restore from localStorage if available
    const saved = localStorage.getItem(`calendar-month-${workspaceId}`);
    if (saved) {
      const date = new Date(saved);
      if (!isNaN(date.getTime())) return date;
    }
    return new Date();
  });
  const [showForm, setShowForm] = useState(false);
  const [editingGig, setEditingGig] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  // Default to list view on mobile for better usability
  const [view, setView] = useState(() => window.innerWidth < 768 ? 'list' : 'calendar');
  const [listMode, setListMode] = useState('compact'); // 'compact' or 'cards'
  const [filterType, setFilterType] = useState('');
  const [sortNewest, setSortNewest] = useState(true);
  const [deleteGigId, setDeleteGigId] = useState(null);
  const [gigContextMenu, setGigContextMenu] = useState(null); // { gigId, x, y }

  // ICS Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [icsContent, setIcsContent] = useState('');
  const [icsPreview, setIcsPreview] = useState(null);
  const [icsImporting, setIcsImporting] = useState(false);
  const [icsError, setIcsError] = useState('');

  // Availability overlay
  const [showAvailability, setShowAvailability] = useState(true);
  const [availability, setAvailability] = useState([]);
  const [availabilityDate, setAvailabilityDate] = useState(null); // For setting my availability
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState(false); // Edit mode for click-to-set

  // iCal subscribe
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [icalUrl, setIcalUrl] = useState('');
  const [icalLoading, setIcalLoading] = useState(false);
  const [icalCopied, setIcalCopied] = useState(false);

  // Drag and drop state
  const [draggingGig, setDraggingGig] = useState(null);
  const [dropTargetDate, setDropTargetDate] = useState(null);
  const [showMoveOrCopy, setShowMoveOrCopy] = useState(null); // { gig, targetDate }
  const [edgeZone, setEdgeZone] = useState(null); // 'left' | 'right' | null
  const edgeScrollRef = useRef(null);
  const calendarContainerRef = useRef(null);

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  // Persist calendar month to localStorage
  useEffect(() => {
    localStorage.setItem(`calendar-month-${workspaceId}`, currentMonth.toISOString());
  }, [currentMonth, workspaceId]);

  // Load other workspace gigs when toggle is enabled
  useEffect(() => {
    if (showOtherWorkspaces) {
      loadOtherWorkspaceGigs();
    } else {
      setOtherWorkspaceGigs([]);
    }
  }, [showOtherWorkspaces, workspaceId]);

  // Load availability when month changes or toggle is on
  useEffect(() => {
    if (!showAvailability) {
      setAvailability([]);
      return;
    }

    const loadAvailability = async () => {
      try {
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);
        const data = await api.getAvailability(
          workspaceId,
          format(start, 'yyyy-MM-dd'),
          format(end, 'yyyy-MM-dd')
        );
        setAvailability(data);
      } catch (err) {
        console.error('Failed to load availability:', err);
      }
    };

    loadAvailability();
  }, [workspaceId, currentMonth, showAvailability]);

  // Keyboard navigation for calendar view
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only handle when in calendar view and no modal is open
      if (view !== 'calendar' || showForm || deleteGigId || showMoveOrCopy) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentMonth(prev => subMonths(prev, 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentMonth(prev => addMonths(prev, 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, showForm, deleteGigId, showMoveOrCopy]);

  // Auto-open gig detail when navigated from Quick Links banner
  useEffect(() => {
    if (focusGigId && gigs.length > 0 && !loading) {
      const gig = gigs.find(g => g.id === focusGigId);
      if (gig) {
        setEditingGig(gig);
        setShowForm(true);
      }
    }
  }, [focusGigId, gigs, loading]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [gigsData, setlistsData] = await Promise.all([
        api.getGigs(workspaceId),
        api.getSetlists(workspaceId)
      ]);
      setGigs(gigsData);
      setSetlists(setlistsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadOtherWorkspaceGigs = async () => {
    try {
      const otherGigs = await api.getGigsFromAllWorkspaces(workspaceId);
      // Mark these as external
      setOtherWorkspaceGigs(otherGigs.map(g => ({ ...g, isExternal: true })));
    } catch (err) {
      console.error('Failed to load other workspace gigs:', err);
    }
  };

  const handleSaveGig = async (gigData) => {
    try {
      if (editingGig) {
        const updated = await api.updateGig(editingGig.id, gigData);
        setGigs(prev => prev.map(g => g.id === updated.id ? updated : g));
      } else {
        const created = await api.createGig(workspaceId, gigData);
        setGigs(prev => [...prev, created]);
      }
      setShowForm(false);
      setEditingGig(null);
      setSelectedDate(null);
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteGig = async (gigId) => {
    try {
      await api.deleteGig(gigId);
      setGigs(prev => prev.filter(g => g.id !== gigId));
      setDeleteGigId(null);
    } catch (err) {
      setError(err.message);
      setDeleteGigId(null);
    }
  };

  const handleCompleteGig = async (gig) => {
    try {
      const updated = await api.completeGig(gig.id, []);
      setGigs(prev => prev.map(g => g.id === updated.id ? updated : g));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDuplicateGig = async (gig) => {
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    try {
      const duplicated = await api.duplicateGig(gig.id, dateStr);
      setGigs(prev => [...prev, duplicated].sort((a, b) => new Date(a.date) - new Date(b.date)));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSubscribe = async () => {
    setIcalLoading(true);
    try {
      let tokenData;
      try {
        tokenData = await api.getCalendarToken(workspaceId);
      } catch {
        tokenData = await api.generateCalendarToken(workspaceId);
      }
      const token = tokenData.token;
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const baseUrl = API_URL.replace(/\/api\/?$/, '');
      const url = `${baseUrl}/api/gigs/workspace/${workspaceId}/calendar.ics?token=${token}`;
      setIcalUrl(url);
      setShowSubscribeModal(true);
    } catch (err) {
      toast.error(err.message || 'Failed to get calendar link');
    } finally {
      setIcalLoading(false);
    }
  };

  const handleCopyIcalUrl = async () => {
    try {
      await navigator.clipboard.writeText(icalUrl);
      setIcalCopied(true);
      setTimeout(() => setIcalCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = icalUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setIcalCopied(true);
      setTimeout(() => setIcalCopied(false), 2000);
    }
  };

  // ICS Import handlers
  const handleIcsFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setIcsContent(text);
      setIcsError('');
      // Preview the content
      const preview = await api.previewICS(workspaceId, text);
      setIcsPreview(preview.events);
    } catch (err) {
      setIcsError(err.message || 'Failed to parse ICS file');
      setIcsPreview(null);
    }
  };

  const handleIcsTextChange = async (text) => {
    setIcsContent(text);
    setIcsError('');
    setIcsPreview(null);

    if (text.trim().length > 20 && text.includes('BEGIN:VCALENDAR')) {
      try {
        const preview = await api.previewICS(workspaceId, text);
        setIcsPreview(preview.events);
      } catch (err) {
        setIcsError(err.message || 'Failed to parse ICS content');
      }
    }
  };

  const handleIcsImport = async (type = 'REHEARSAL') => {
    if (!icsContent) return;

    setIcsImporting(true);
    setIcsError('');

    try {
      const result = await api.importICS(workspaceId, icsContent, type);
      // Add new gigs to state
      if (result.created && result.created.length > 0) {
        setGigs(prev => [...prev, ...result.created].sort((a, b) => new Date(a.date) - new Date(b.date)));
        toast.success(`Imported ${result.created.length} event(s)`);
      }
      // Close modal and reset
      setShowImportModal(false);
      setIcsContent('');
      setIcsPreview(null);
    } catch (err) {
      setIcsError(err.message || 'Failed to import');
    } finally {
      setIcsImporting(false);
    }
  };

  // Availability handlers
  const getMyAvailabilityStatus = (date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const myAvail = availability.find(a =>
      a.user?.id === user?.id && format(new Date(a.date), 'yyyy-MM-dd') === dateKey
    );
    return myAvail?.status || 'UNKNOWN';
  };

  // Cycle through: UNKNOWN → AVAILABLE → MAYBE → UNAVAILABLE → UNKNOWN
  const cycleAvailability = async (date) => {
    const current = getMyAvailabilityStatus(date);
    const cycle = {
      'UNKNOWN': 'AVAILABLE',
      'AVAILABLE': 'MAYBE',
      'MAYBE': 'UNAVAILABLE',
      'UNAVAILABLE': 'CLEAR',
    };
    const next = cycle[current] || 'AVAILABLE';
    await handleSetAvailability(date, next);
  };

  const handleSetAvailability = async (date, status) => {
    setSavingAvailability(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      if (status === 'CLEAR') {
        await api.clearAvailability(workspaceId, dateStr);
        setAvailability(prev => prev.filter(a =>
          !(a.user?.id === user?.id && format(new Date(a.date), 'yyyy-MM-dd') === dateStr)
        ));
      } else {
        const result = await api.setAvailability(workspaceId, dateStr, status);
        setAvailability(prev => {
          const existingIdx = prev.findIndex(a =>
            a.user?.id === user?.id && format(new Date(a.date), 'yyyy-MM-dd') === dateStr
          );
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx] = result;
            return updated;
          }
          return [...prev, result];
        });
      }
      setAvailabilityDate(null);
      toast.success('Availability updated');
    } catch (err) {
      toast.error(err.message || 'Failed to set availability');
    } finally {
      setSavingAvailability(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, gig) => {
    setDraggingGig(gig);
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', gig.id);
    // Add a slight delay to allow the drag image to be created
    setTimeout(() => {
      e.target.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e) => {
    if (e.target) e.target.style.opacity = '1';
    setDraggingGig(null);
    setDropTargetDate(null);
    setEdgeZone(null);
    if (edgeScrollRef.current) {
      clearInterval(edgeScrollRef.current);
      edgeScrollRef.current = null;
    }
  };

  const handleDragOver = useCallback((e, date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTargetDate(date);

    // Edge detection for month navigation
    if (calendarContainerRef.current && draggingGig) {
      const rect = calendarContainerRef.current.getBoundingClientRect();
      const edgeThreshold = 80;

      // Right edge - go to next month
      if (e.clientX > rect.right - edgeThreshold) {
        if (edgeZone !== 'right') {
          setEdgeZone('right');
          // Clear any existing interval
          if (edgeScrollRef.current) clearInterval(edgeScrollRef.current);
          // Initial scroll after delay, then continuous
          edgeScrollRef.current = setInterval(() => {
            setCurrentMonth(prev => addMonths(prev, 1));
          }, 600);
        }
      }
      // Left edge - go to previous month
      else if (e.clientX < rect.left + edgeThreshold) {
        if (edgeZone !== 'left') {
          setEdgeZone('left');
          if (edgeScrollRef.current) clearInterval(edgeScrollRef.current);
          edgeScrollRef.current = setInterval(() => {
            setCurrentMonth(prev => subMonths(prev, 1));
          }, 600);
        }
      }
      // Not at edge
      else if (edgeZone) {
        setEdgeZone(null);
        if (edgeScrollRef.current) {
          clearInterval(edgeScrollRef.current);
          edgeScrollRef.current = null;
        }
      }
    }
  }, [draggingGig, edgeZone]);

  const handleDragLeave = (e) => {
    // Only clear if leaving the calendar entirely
    if (calendarContainerRef.current && !calendarContainerRef.current.contains(e.relatedTarget)) {
      setDropTargetDate(null);
      setEdgeZone(null);
      if (edgeScrollRef.current) {
        clearInterval(edgeScrollRef.current);
        edgeScrollRef.current = null;
      }
    }
  };

  const handleDrop = (e, targetDate) => {
    e.preventDefault();
    setDropTargetDate(null);

    if (draggingGig && targetDate) {
      // Show Move or Copy dialog
      setShowMoveOrCopy({ gig: draggingGig, targetDate });
    }
    setDraggingGig(null);
  };

  const handleMoveOrCopyConfirm = async (action) => {
    if (!showMoveOrCopy) return;

    const { gig, targetDate } = showMoveOrCopy;
    const newDateStr = format(targetDate, 'yyyy-MM-dd');

    try {
      if (action === 'move') {
        // Update the gig's date
        const updated = await api.updateGig(gig.id, { date: newDateStr });
        setGigs(prev => prev.map(g => g.id === updated.id ? updated : g).sort((a, b) => new Date(a.date) - new Date(b.date)));
      } else if (action === 'copy') {
        // Duplicate the gig
        const duplicated = await api.duplicateGig(gig.id, newDateStr);
        setGigs(prev => [...prev, duplicated].sort((a, b) => new Date(a.date) - new Date(b.date)));
      }
    } catch (err) {
      toast.error(err.message);
    }

    setShowMoveOrCopy(null);
  };

  // Calendar calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Get days from previous month to fill the first week
  const startDay = monthStart.getDay();
  const prevMonthDays = startDay > 0
    ? eachDayOfInterval({
        start: subDays(monthStart, startDay),
        end: subDays(monthStart, 1)
      })
    : [];

  // Current month days
  const currentMonthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get days from next month to fill the last week
  const endDay = monthEnd.getDay();
  const nextMonthDays = endDay < 6
    ? eachDayOfInterval({
        start: addDays(monthEnd, 1),
        end: addDays(monthEnd, 6 - endDay)
      })
    : [];

  // All calendar days (prev + current + next)
  const calendarDays = [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];

  // Combine current workspace gigs with other workspace gigs
  const allGigs = useMemo(() => {
    const combined = [...gigs];
    if (showOtherWorkspaces) {
      combined.push(...otherWorkspaceGigs);
    }
    const sorted = combined.sort((a, b) => new Date(a.date) - new Date(b.date));
    return sortNewest ? sorted.reverse() : sorted;
  }, [gigs, otherWorkspaceGigs, showOtherWorkspaces, sortNewest]);

  const gigsByDate = useMemo(() => {
    const map = {};
    allGigs.forEach(gig => {
      const dateKey = format(new Date(gig.date), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(gig);
    });
    return map;
  }, [allGigs]);

  // Group availability by date -> { available: [], unavailable: [], maybe: [] }
  const availabilityByDate = useMemo(() => {
    const map = {};
    availability.forEach(a => {
      const dateKey = format(new Date(a.date), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = { available: [], unavailable: [], maybe: [] };
      const statusKey = a.status.toLowerCase();
      if (map[dateKey][statusKey]) {
        map[dateKey][statusKey].push(a.user);
      }
    });
    return map;
  }, [availability]);

  const filteredGigs = filterType
    ? allGigs.filter(g => g.type === filterType)
    : allGigs;

  const now = new Date();
  const upcomingGigs = filteredGigs
    .filter(g => new Date(g.date) >= now && g.status !== 'CANCELLED')
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const pastGigs = filteredGigs
    .filter(g => new Date(g.date) < now || g.status === 'CANCELLED')
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Format time range helper
  const formatTimeRange = (startDate, endDate) => {
    const start = format(new Date(startDate), 'HH:mm');
    if (endDate) {
      const end = format(new Date(endDate), 'HH:mm');
      return `${start}-${end}`;
    }
    return start;
  };

  // Generate Google Calendar URL
  const getGoogleCalendarUrl = (gig) => {
    const formatGoogleDate = (date) => {
      // Format as YYYYMMDDTHHMMSS (local time)
      return format(new Date(date), "yyyyMMdd'T'HHmmss");
    };

    const startDate = formatGoogleDate(gig.date);
    // If no end date, default to 2 hours after start
    const endDate = gig.endDate
      ? formatGoogleDate(gig.endDate)
      : formatGoogleDate(new Date(new Date(gig.date).getTime() + 2 * 60 * 60 * 1000));

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: gig.title,
      dates: `${startDate}/${endDate}`,
    });

    // Add location if available
    if (gig.venue || gig.address) {
      const location = [gig.venue, gig.address].filter(Boolean).join(', ');
      params.append('location', location);
    }

    // Add details/notes
    const details = [];
    if (gig.type) details.push(`Type: ${gig.type}`);
    if (gig.notes) details.push(gig.notes);
    if (gig.setlist?.name) details.push(`Setlist: ${gig.setlist.name}`);
    if (gig.setlists?.length > 0) {
      const setlistNames = gig.setlists
        .sort((a, b) => a.setNumber - b.setNumber)
        .map(gs => gs.setlist?.name || `Set ${gs.setNumber}`)
        .join(' → ');
      details.push(`Sets: ${setlistNames}`);
    }
    if (details.length > 0) {
      params.append('details', details.join('\n'));
    }

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  // Color palettes for other bands (each band gets a unique color family)
  const externalColorPalettes = [
    { gig: 'bg-purple-600', rehearsal: 'bg-purple-400', other: 'bg-purple-500' },
    { gig: 'bg-emerald-600', rehearsal: 'bg-emerald-400', other: 'bg-emerald-500' },
    { gig: 'bg-orange-600', rehearsal: 'bg-orange-400', other: 'bg-orange-500' },
    { gig: 'bg-pink-600', rehearsal: 'bg-pink-400', other: 'bg-pink-500' },
    { gig: 'bg-teal-600', rehearsal: 'bg-teal-400', other: 'bg-teal-500' },
    { gig: 'bg-amber-600', rehearsal: 'bg-amber-400', other: 'bg-amber-500' },
    { gig: 'bg-rose-600', rehearsal: 'bg-rose-400', other: 'bg-rose-500' },
    { gig: 'bg-cyan-600', rehearsal: 'bg-cyan-400', other: 'bg-cyan-500' },
  ];

  // Map workspace IDs to color palette indices for consistency
  const workspaceColorMap = useMemo(() => {
    const map = {};
    let colorIndex = 0;
    otherWorkspaceGigs.forEach(gig => {
      if (gig.workspaceId && !map[gig.workspaceId]) {
        map[gig.workspaceId] = colorIndex % externalColorPalettes.length;
        colorIndex++;
      }
    });
    return map;
  }, [otherWorkspaceGigs]);

  const getTypeColor = (type, isExternal = false, externalWorkspaceId = null) => {
    if (isExternal && externalWorkspaceId) {
      // Get consistent color palette for this external workspace
      const paletteIndex = workspaceColorMap[externalWorkspaceId] || 0;
      const palette = externalColorPalettes[paletteIndex];
      const baseColor = type === 'GIG' ? palette.gig :
                        type === 'REHEARSAL' ? palette.rehearsal :
                        palette.other;
      return `${baseColor} border border-white/20 border-dashed`;
    }
    // Current workspace: blue shades
    switch (type) {
      case 'GIG': return 'bg-blue-600';           // Dark blue for gigs
      case 'REHEARSAL': return 'bg-sky-400';      // Light blue for rehearsals
      case 'RECORDING': return 'bg-blue-500';     // Medium blue for recording
      default: return 'bg-slate-500';             // Gray for other
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED': return <span className="text-xs px-1.5 py-0.5 bg-green-900/50 text-green-300 rounded">Done</span>;
      case 'CANCELLED': return <span className="text-xs px-1.5 py-0.5 bg-red-900/50 text-red-300 rounded">Cancelled</span>;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col p-4">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-8 w-32" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton.ListItem />
          <Skeleton.ListItem />
          <Skeleton.ListItem />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Calendar</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] cursor-pointer" title="Show member availability">
              <input
                type="checkbox"
                checked={showAvailability}
                onChange={(e) => setShowAvailability(e.target.checked)}
                className="rounded bg-[var(--color-bg-tertiary)] border-[var(--color-border)] text-green-500 focus:ring-green-500"
              />
              <span className="hidden sm:inline">Availability</span>
              <span className="sm:hidden">Avail</span>
            </label>
            {view === 'calendar' && showAvailability && (
              <button
                onClick={() => setEditingAvailability(!editingAvailability)}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  editingAvailability
                    ? 'bg-green-600 text-white'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                }`}
                title={editingAvailability ? 'Exit edit mode' : 'Click days to set your availability'}
              >
                {editingAvailability ? '✓ Done' : '✏️ Edit Mine'}
              </button>
            )}
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] cursor-pointer">
              <input
                type="checkbox"
                checked={showOtherWorkspaces}
                onChange={(e) => setShowOtherWorkspaces(e.target.checked)}
                className="rounded bg-[var(--color-bg-tertiary)] border-[var(--color-border)] text-blue-500 focus:ring-blue-500"
              />
              <span className="hidden sm:inline">Other Bands</span>
              <span className="sm:hidden">Others</span>
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] text-sm"
            >
              <option value="">All Events</option>
              <option value="GIG">Gigs</option>
              <option value="REHEARSAL">Rehearsals</option>
              <option value="RECORDING">Recording</option>
              <option value="OTHER">Other</option>
            </select>
            <div className="flex bg-[var(--color-bg-tertiary)] rounded overflow-hidden">
              <button
                onClick={() => setView('calendar')}
                className={`px-3 py-2 text-sm ${view === 'calendar' ? 'bg-slack-purple text-white' : 'text-[var(--color-text-secondary)]'}`}
              >
                Calendar
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-3 py-2 text-sm ${view === 'list' ? 'bg-slack-purple text-white' : 'text-[var(--color-text-secondary)]'}`}
              >
                List
              </button>
            </div>
            {view === 'list' && (
              <div className="flex bg-[var(--color-bg-tertiary)] rounded overflow-hidden">
                <button
                  onClick={() => setListMode('compact')}
                  className={`px-2 py-2 text-sm ${listMode === 'compact' ? 'bg-slate-600 text-white' : 'text-[var(--color-text-secondary)]'}`}
                  title="Compact view"
                >
                  ≡
                </button>
                <button
                  onClick={() => setListMode('cards')}
                  className={`px-2 py-2 text-sm ${listMode === 'cards' ? 'bg-slate-600 text-white' : 'text-[var(--color-text-secondary)]'}`}
                  title="Card view"
                >
                  ▦
                </button>
              </div>
            )}
            <button
              onClick={handleSubscribe}
              disabled={icalLoading}
              className="btn bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] text-[var(--color-text-secondary)] text-sm"
              title="Subscribe to calendar feed"
            >
              {icalLoading ? '...' : 'Subscribe'}
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowImportModal(true)}
                className="btn bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] text-[var(--color-text-secondary)] text-sm"
                title="Import from calendar invite"
              >
                Import
              </button>
            )}
            <button
              onClick={() => {
                setEditingGig(null);
                setSelectedDate(null);
                setShowForm(true);
              }}
              className="btn bg-green-600 hover:bg-green-700 text-white"
            >
              + Add Event
            </button>
          </div>
        </div>

        {view === 'calendar' && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              ← Prev
            </button>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
                {format(currentMonth, 'MMMM yyyy')}
              </h3>
              <button
                onClick={() => setCurrentMonth(new Date())}
                className="px-2 py-1 text-xs bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] rounded"
              >
                Today
              </button>
            </div>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && <ErrorMessage message={error} onRetry={loadData} />}

        {view === 'calendar' ? (
          /* Calendar View */
          <div ref={calendarContainerRef} className={`bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden relative ${editingAvailability ? 'ring-2 ring-green-500/50' : ''}`}>
            {/* Edge zone indicators */}
            {draggingGig && edgeZone === 'left' && (
              <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-blue-500/30 to-transparent pointer-events-none z-10 flex items-center justify-start pl-2">
                <span className="text-blue-400 text-2xl animate-pulse">←</span>
              </div>
            )}
            {draggingGig && edgeZone === 'right' && (
              <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-blue-500/30 to-transparent pointer-events-none z-10 flex items-center justify-end pr-2">
                <span className="text-blue-400 text-2xl animate-pulse">→</span>
              </div>
            )}
            {/* Day Headers */}
            <div className="grid grid-cols-7 bg-[var(--color-bg-tertiary)]">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="p-2 text-center text-[var(--color-text-muted)] text-sm font-medium">
                  {day}
                </div>
              ))}
            </div>
            {/* Calendar Grid */}
            <div className="grid grid-cols-7">
              {calendarDays.map(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayGigs = gigsByDate[dateKey] || [];
                const filteredDayGigs = filterType
                  ? dayGigs.filter(g => g.type === filterType)
                  : dayGigs;
                const isDropTarget = dropTargetDate && isSameDay(day, dropTargetDate);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const dayAvail = availabilityByDate[dateKey];
                const hasAvailability = dayAvail && (dayAvail.available.length > 0 || dayAvail.unavailable.length > 0 || dayAvail.maybe.length > 0);
                const myStatus = getMyAvailabilityStatus(day);

                return (
                  <div
                    key={dateKey}
                    onClick={(e) => {
                      // Shift+click or edit mode: cycle availability
                      if (e.shiftKey || editingAvailability) {
                        e.preventDefault();
                        cycleAvailability(day);
                        return;
                      }
                      // Normal click: create event
                      setSelectedDate(day);
                      setEditingGig(null);
                      setShowForm(true);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setAvailabilityDate(day);
                    }}
                    onDragOver={(e) => handleDragOver(e, day)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, day)}
                    className={`p-2 min-h-[100px] border-t border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-bg-tertiary)]/50 transition-colors ${
                      !isCurrentMonth ? 'bg-[var(--color-bg-primary)]' : ''
                    } ${isToday(day) ? 'bg-blue-900/20' : ''} ${
                      isDropTarget ? 'bg-green-900/40 ring-2 ring-green-500 ring-inset' : ''
                    } ${editingAvailability ? 'hover:ring-2 hover:ring-green-500/50 hover:ring-inset' : ''}`}
                  >
                    <div className={`text-sm mb-1 flex items-center justify-between ${
                      isToday(day) ? 'text-blue-400 font-bold' : isCurrentMonth ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-muted)] opacity-40'
                    }`}>
                      <span>{format(day, 'd')}</span>
                      {/* My availability indicator */}
                      {showAvailability && myStatus !== 'UNKNOWN' && (
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            myStatus === 'AVAILABLE' ? 'bg-green-500' :
                            myStatus === 'UNAVAILABLE' ? 'bg-red-500' :
                            'bg-yellow-500'
                          }`}
                          title={`My status: ${myStatus.toLowerCase()}`}
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      {filteredDayGigs.slice(0, 3).map(gig => {
                        const canDrag = !gig.isExternal && (!gig.isLocked || isAdmin);
                        return (
                        <div
                          key={gig.id}
                          draggable={canDrag}
                          onDragStart={canDrag ? (e) => handleDragStart(e, gig) : undefined}
                          onDragEnd={canDrag ? handleDragEnd : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Can't view external events, but can view locked events (read-only)
                            if (!gig.isExternal) {
                              setEditingGig(gig);
                              setShowForm(true);
                            }
                          }}
                          title={gig.isExternal ? `${gig.workspace?.name || 'Other workspace'}` : gig.isLocked ? `${gig.title} (Locked)` : gig.title}
                          className={`text-xs p-1 rounded text-white truncate ${gig.isExternal || (gig.isLocked && !isAdmin) ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${getTypeColor(gig.type, gig.isExternal, gig.workspaceId)} ${
                            gig.status === 'CANCELLED' ? 'opacity-50 line-through' : ''
                          } ${draggingGig?.id === gig.id ? 'opacity-50' : ''} ${gig.isPersonal ? 'border border-dashed border-[var(--color-border)]' : ''}`}
                        >
                          {gig.isLocked && <span className="mr-1">🔒</span>}
                          {gig.isPersonal && <span className="mr-1">👤</span>}
                          <span className="font-medium">{formatTimeRange(gig.date, gig.endDate)} </span>
                          {gig.title}
                        </div>
                      );})}
                      {filteredDayGigs.length > 3 && (
                        <div className="text-xs text-[var(--color-text-muted)]">
                          +{filteredDayGigs.length - 3} more
                        </div>
                      )}
                    </div>
                    {/* Availability indicator */}
                    {showAvailability && hasAvailability && (
                      <div
                        className="mt-1 flex items-center gap-1 text-[10px]"
                        title={[
                          dayAvail.available.length > 0 && `Available: ${dayAvail.available.map(u => u.displayName).join(', ')}`,
                          dayAvail.unavailable.length > 0 && `Unavailable: ${dayAvail.unavailable.map(u => u.displayName).join(', ')}`,
                          dayAvail.maybe.length > 0 && `Maybe: ${dayAvail.maybe.map(u => u.displayName).join(', ')}`
                        ].filter(Boolean).join('\n')}
                      >
                        {dayAvail.available.length > 0 && (
                          <span className="text-green-400">✓{dayAvail.available.length}</span>
                        )}
                        {dayAvail.unavailable.length > 0 && (
                          <span className="text-red-400">✗{dayAvail.unavailable.length}</span>
                        )}
                        {dayAvail.maybe.length > 0 && (
                          <span className="text-yellow-400">?{dayAvail.maybe.length}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* List View - Split into UPCOMING and PAST sections */
          <div className="space-y-6">
            {/* UPCOMING section */}
            <div>
              <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider px-1 mb-2">Upcoming</h3>
              {upcomingGigs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center bg-[var(--color-bg-secondary)] rounded-lg">
                  <div className="text-4xl mb-3">📅</div>
                  <h3 className="text-base font-medium text-[var(--color-text-primary)] mb-1">
                    No upcoming events
                  </h3>
                  <p className="text-[var(--color-text-muted)] text-sm max-w-sm mb-3">
                    Schedule gigs, rehearsals, and other events to keep your band organized.
                  </p>
                  <button
                    onClick={() => { setEditingGig(null); setShowForm(true); }}
                    className="btn bg-green-600 hover:bg-green-700 text-white text-sm"
                  >
                    + Add Event
                  </button>
                </div>
              ) : (
                <div className={listMode === 'compact' ? 'bg-[var(--color-bg-secondary)] rounded-lg divide-y divide-[var(--color-border)]' : 'space-y-4'}>
                  {listMode === 'compact' ? (
                    <>
                      <div className="flex items-center gap-3 px-3 py-2 text-xs text-[var(--color-text-muted)] font-medium border-b border-[var(--color-border)]">
                        <div className="shrink-0 min-w-[5rem]">Date</div>
                        <div className="shrink-0 min-w-[4.5rem] hidden sm:block">Time</div>
                        <div className="flex-1">Event</div>
                        <div className="shrink-0 max-w-[8rem] hidden md:block">Venue</div>
                        <div className="shrink-0 text-right">Type</div>
                        <div className="w-16"></div>
                      </div>
                      {upcomingGigs.map(gig => (
                        <GigCompactRow
                          key={gig.id}
                          gig={gig}
                          isAdmin={isAdmin}
                          getTypeColor={getTypeColor}
                          formatTimeRange={formatTimeRange}
                          onEdit={() => { setEditingGig(gig); setShowForm(true); }}
                          onDelete={() => setDeleteGigId(gig.id)}
                          onContextMenu={(pos) => setGigContextMenu({ gigId: gig.id, ...pos })}
                          workspace={workspace}
                        />
                      ))}
                    </>
                  ) : (
                    upcomingGigs.map(gig => (
                      <GigListCard
                        key={gig.id}
                        gig={gig}
                        isAdmin={isAdmin}
                        getTypeColor={getTypeColor}
                        getStatusBadge={getStatusBadge}
                        formatTimeRange={formatTimeRange}
                        onEdit={() => { setEditingGig(gig); setShowForm(true); }}
                        onDuplicate={() => handleDuplicateGig(gig)}
                        onComplete={() => handleCompleteGig(gig)}
                        onDelete={() => setDeleteGigId(gig.id)}
                        onContextMenu={(pos) => setGigContextMenu({ gigId: gig.id, ...pos })}
                        getGoogleCalendarUrl={getGoogleCalendarUrl}
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* PAST section */}
            {pastGigs.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider px-1 mb-2">Past</h3>
                <div className={listMode === 'compact' ? 'bg-[var(--color-bg-secondary)] rounded-lg divide-y divide-[var(--color-border)] opacity-75' : 'space-y-4 opacity-75'}>
                  {listMode === 'compact' ? (
                    <>
                      <div className="flex items-center gap-3 px-3 py-2 text-xs text-[var(--color-text-muted)] font-medium border-b border-[var(--color-border)]">
                        <div className="shrink-0 min-w-[5rem]">Date</div>
                        <div className="shrink-0 min-w-[4.5rem] hidden sm:block">Time</div>
                        <div className="flex-1">Event</div>
                        <div className="shrink-0 max-w-[8rem] hidden md:block">Venue</div>
                        <div className="shrink-0 text-right">Type</div>
                        <div className="w-16"></div>
                      </div>
                      {pastGigs.map(gig => (
                        <GigCompactRow
                          key={gig.id}
                          gig={gig}
                          isAdmin={isAdmin}
                          getTypeColor={getTypeColor}
                          formatTimeRange={formatTimeRange}
                          onEdit={() => { setEditingGig(gig); setShowForm(true); }}
                          onDelete={() => setDeleteGigId(gig.id)}
                          onContextMenu={(pos) => setGigContextMenu({ gigId: gig.id, ...pos })}
                          workspace={workspace}
                        />
                      ))}
                    </>
                  ) : (
                    pastGigs.map(gig => (
                      <GigListCard
                        key={gig.id}
                        gig={gig}
                        isAdmin={isAdmin}
                        getTypeColor={getTypeColor}
                        getStatusBadge={getStatusBadge}
                        formatTimeRange={formatTimeRange}
                        onEdit={() => { setEditingGig(gig); setShowForm(true); }}
                        onDuplicate={() => handleDuplicateGig(gig)}
                        onComplete={() => handleCompleteGig(gig)}
                        onDelete={() => setDeleteGigId(gig.id)}
                        onContextMenu={(pos) => setGigContextMenu({ gigId: gig.id, ...pos })}
                        getGoogleCalendarUrl={getGoogleCalendarUrl}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gig Form Modal */}
      {showForm && (
        <GigForm
          gig={editingGig}
          defaultDate={selectedDate}
          setlists={setlists}
          onSave={handleSaveGig}
          onClose={() => {
            setShowForm(false);
            setEditingGig(null);
            setSelectedDate(null);
          }}
          onDelete={(gigId) => {
            setShowForm(false);
            setEditingGig(null);
            setDeleteGigId(gigId);
          }}
          isAdmin={isAdmin}
          workspaceId={workspaceId}
          workspace={workspace}
          workspaceMembers={workspace?.members || []}
          previousEvents={gigs}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteGigId !== null}
        title="Delete Event"
        message="Are you sure you want to delete this event? This cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDeleteGig(deleteGigId)}
        onCancel={() => setDeleteGigId(null)}
      />

      {/* Move or Copy Dialog */}
      <Modal isOpen={!!showMoveOrCopy} onClose={() => setShowMoveOrCopy(null)} title="Move or Copy?" maxWidth="max-w-sm">
          <div className="p-4">
            <p className="text-[var(--color-text-muted)] mb-4">
              "{showMoveOrCopy?.gig.title}" → {showMoveOrCopy && format(showMoveOrCopy.targetDate, 'MMM d, yyyy')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleMoveOrCopyConfirm('move')}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium"
              >
                Move
              </button>
              <button
                onClick={() => handleMoveOrCopyConfirm('copy')}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-medium"
              >
                Copy
              </button>
              <button
                onClick={() => setShowMoveOrCopy(null)}
                className="px-4 py-2 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] text-[var(--color-text-secondary)] rounded font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
      </Modal>

      <ContextMenu
        isOpen={gigContextMenu !== null}
        position={gigContextMenu || { x: 0, y: 0 }}
        onClose={() => setGigContextMenu(null)}
        items={(() => {
          const gig = allGigs.find(g => g.id === gigContextMenu?.gigId);
          if (!gig) return [];
          const canEdit = !gig.isExternal && (!gig.isLocked || isAdmin);
          return [
            { label: 'Edit', icon: '✏️', onClick: () => { setEditingGig(gig); setShowForm(true); }, show: canEdit },
            { label: 'Duplicate to Today', icon: '📋', onClick: () => handleDuplicateGig(gig), show: !gig.isExternal },
            { label: 'Add to Google Calendar', icon: '📅', onClick: () => window.open(getGoogleCalendarUrl(gig), '_blank') },
            { label: 'Mark Complete', icon: '✅', onClick: () => handleCompleteGig(gig), show: gig.status === 'SCHEDULED' && canEdit },
            { divider: true, label: 'divider', onClick: () => {} },
            { label: 'Delete', icon: '🗑️', variant: 'danger', onClick: () => setDeleteGigId(gig.id), show: canEdit },
          ];
        })()}
      />

      {/* Subscribe Modal */}
      <Modal isOpen={showSubscribeModal} onClose={() => setShowSubscribeModal(false)} title="Subscribe to Calendar">
          <div className="p-4">
            <p className="text-[var(--color-text-muted)] text-sm mb-4">
              Add this URL to your calendar app (Apple Calendar, Google Calendar, Outlook, etc.) to automatically sync all band events.
            </p>
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded p-3 mb-4 break-all">
              <code className="text-[var(--color-text-primary)] text-xs">{icalUrl}</code>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyIcalUrl}
                className="flex-1 btn bg-blue-600 hover:bg-blue-500 text-white"
              >
                {icalCopied ? 'Copied!' : 'Copy URL'}
              </button>
              <a
                href={icalUrl.replace(/^https?:\/\//, 'webcal://')}
                className="flex-1 btn bg-green-600 hover:bg-green-500 text-white text-center"
              >
                Open in Calendar
              </a>
            </div>
            <p className="text-[var(--color-text-muted)] text-xs mt-3">
              Most calendar apps support webcal:// links. If it does not open automatically, paste the URL manually in your calendar app's "subscribe" feature.
            </p>
          </div>
      </Modal>

      {/* ICS Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => { setShowImportModal(false); setIcsContent(''); setIcsPreview(null); setIcsError(''); }}
        title="Import Calendar Event"
        maxWidth="max-w-lg"
      >
          <div className="p-4">
            <p className="text-[var(--color-text-muted)] text-sm mb-4">
              Upload an .ics file or paste calendar invite content from Outlook, Google Calendar, etc.
            </p>

            {/* File upload */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Upload .ics file
              </label>
              <input
                type="file"
                accept=".ics,text/calendar"
                onChange={handleIcsFileUpload}
                className="block w-full text-sm text-[var(--color-text-secondary)] file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[var(--color-bg-tertiary)] file:text-[var(--color-text-primary)] hover:file:bg-[var(--color-border)]"
              />
            </div>

            <div className="text-center text-[var(--color-text-muted)] text-sm mb-4">— or —</div>

            {/* Paste content */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Paste .ics content
              </label>
              <textarea
                value={icsContent}
                onChange={(e) => handleIcsTextChange(e.target.value)}
                placeholder="BEGIN:VCALENDAR&#10;..."
                rows={4}
                className="w-full px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] text-sm font-mono"
              />
            </div>

            {/* Error */}
            {icsError && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded text-red-300 text-sm">
                {icsError}
              </div>
            )}

            {/* Preview */}
            {icsPreview && icsPreview.length > 0 && (
              <div className="mb-4 p-3 bg-[var(--color-bg-tertiary)] rounded">
                <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-2">
                  Preview ({icsPreview.length} event{icsPreview.length > 1 ? 's' : ''})
                </h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {icsPreview.map((event, i) => (
                    <div key={i} className="text-sm">
                      <span className="text-[var(--color-text-primary)]">{event.title}</span>
                      <span className="text-[var(--color-text-muted)] ml-2">
                        {event.date && format(new Date(event.date), 'MMM d, yyyy HH:mm')}
                      </span>
                      {event.venue && (
                        <span className="text-[var(--color-text-muted)] ml-2">@ {event.venue}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Import buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleIcsImport('REHEARSAL')}
                disabled={!icsPreview || icsImporting}
                className="flex-1 btn bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
              >
                {icsImporting ? 'Importing...' : 'Import as Rehearsal'}
              </button>
              <button
                onClick={() => handleIcsImport('GIG')}
                disabled={!icsPreview || icsImporting}
                className="flex-1 btn bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
              >
                Import as Gig
              </button>
            </div>
          </div>
      </Modal>

      {/* Set Availability Modal */}
      <Modal isOpen={!!availabilityDate} onClose={() => setAvailabilityDate(null)} title="Set My Availability" maxWidth="max-w-sm">
          <div className="p-4">
            <p className="text-[var(--color-text-muted)] mb-4">
              {availabilityDate && format(availabilityDate, 'EEEE, MMMM d, yyyy')}
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleSetAvailability(availabilityDate, 'AVAILABLE')}
                disabled={savingAvailability}
                className="w-full flex items-center gap-3 p-3 rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-50"
              >
                <span className="text-lg">✓</span>
                Available
              </button>
              <button
                onClick={() => handleSetAvailability(availabilityDate, 'MAYBE')}
                disabled={savingAvailability}
                className="w-full flex items-center gap-3 p-3 rounded bg-yellow-600 hover:bg-yellow-500 text-white disabled:opacity-50"
              >
                <span className="text-lg">?</span>
                Maybe
              </button>
              <button
                onClick={() => handleSetAvailability(availabilityDate, 'UNAVAILABLE')}
                disabled={savingAvailability}
                className="w-full flex items-center gap-3 p-3 rounded bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
              >
                <span className="text-lg">✗</span>
                Unavailable
              </button>
              {getMyAvailabilityStatus(availabilityDate) !== 'UNKNOWN' && (
                <button
                  onClick={() => handleSetAvailability(availabilityDate, 'CLEAR')}
                  disabled={savingAvailability}
                  className="w-full flex items-center gap-3 p-3 rounded bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border)] text-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  <span className="text-lg">○</span>
                  Clear
                </button>
              )}
            </div>

            <p className="text-[var(--color-text-muted)] text-xs mt-4 text-center">
              Shift+click or use "Edit Mine" to quickly set availability
            </p>

            <button
              onClick={() => setAvailabilityDate(null)}
              className="w-full mt-3 p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              Cancel
            </button>
          </div>
      </Modal>
    </div>
  );
}

export default GigCalendar;
