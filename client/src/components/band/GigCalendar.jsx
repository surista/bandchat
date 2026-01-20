import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from 'date-fns';
import api from '../../services/api';
import GigForm from './GigForm';
import ConfirmDialog from '../common/ConfirmDialog';
import Skeleton from '../common/Skeleton';

function GigCalendar({ workspaceId }) {
  const [gigs, setGigs] = useState([]);
  const [otherWorkspaceGigs, setOtherWorkspaceGigs] = useState([]);
  const [showOtherWorkspaces, setShowOtherWorkspaces] = useState(false);
  const [setlists, setSetlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editingGig, setEditingGig] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  // Default to list view on mobile for better usability
  const [view, setView] = useState(() => window.innerWidth < 768 ? 'list' : 'calendar');
  const [filterType, setFilterType] = useState('');
  const [deleteGigId, setDeleteGigId] = useState(null);

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

  // Load other workspace gigs when toggle is enabled
  useEffect(() => {
    if (showOtherWorkspaces) {
      loadOtherWorkspaceGigs();
    } else {
      setOtherWorkspaceGigs([]);
    }
  }, [showOtherWorkspaces, workspaceId]);

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
      alert(err.message);
    }
  };

  const handleDuplicateGig = async (gig) => {
    const dateStr = prompt('Enter date for the copy (YYYY-MM-DD):', format(new Date(), 'yyyy-MM-dd'));
    if (!dateStr) return;

    try {
      const duplicated = await api.duplicateGig(gig.id, dateStr);
      setGigs(prev => [...prev, duplicated].sort((a, b) => new Date(a.date) - new Date(b.date)));
    } catch (err) {
      alert(err.message);
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
      alert(err.message);
    }

    setShowMoveOrCopy(null);
  };

  // Calendar calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad to start on Sunday
  const startDay = monthStart.getDay();
  const paddingDays = Array(startDay).fill(null);

  // Combine current workspace gigs with other workspace gigs
  const allGigs = useMemo(() => {
    const combined = [...gigs];
    if (showOtherWorkspaces) {
      combined.push(...otherWorkspaceGigs);
    }
    return combined.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [gigs, otherWorkspaceGigs, showOtherWorkspaces]);

  const gigsByDate = useMemo(() => {
    const map = {};
    allGigs.forEach(gig => {
      const dateKey = format(new Date(gig.date), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(gig);
    });
    return map;
  }, [allGigs]);

  const filteredGigs = filterType
    ? allGigs.filter(g => g.type === filterType)
    : allGigs;

  const upcomingGigs = filteredGigs
    .filter(g => new Date(g.date) >= new Date() && g.status !== 'CANCELLED')
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Format time range helper
  const formatTimeRange = (startDate, endDate) => {
    const start = format(new Date(startDate), 'HH:mm');
    if (endDate) {
      const end = format(new Date(endDate), 'HH:mm');
      return `${start}-${end}`;
    }
    return start;
  };

  const getTypeColor = (type, isExternal = false) => {
    if (isExternal) {
      // Muted/striped colors for external workspace events
      switch (type) {
        case 'GIG': return 'bg-green-800/60 border border-green-600 border-dashed';
        case 'REHEARSAL': return 'bg-blue-800/60 border border-blue-600 border-dashed';
        case 'RECORDING': return 'bg-purple-800/60 border border-purple-600 border-dashed';
        default: return 'bg-gray-700/60 border border-gray-500 border-dashed';
      }
    }
    switch (type) {
      case 'GIG': return 'bg-green-500';
      case 'REHEARSAL': return 'bg-blue-500';
      case 'RECORDING': return 'bg-purple-500';
      default: return 'bg-gray-500';
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
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Calendar</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showOtherWorkspaces}
                onChange={(e) => setShowOtherWorkspaces(e.target.checked)}
                className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
              />
              <span className="hidden sm:inline">Other Bands</span>
              <span className="sm:hidden">Others</span>
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
            >
              <option value="">All Events</option>
              <option value="GIG">Gigs</option>
              <option value="REHEARSAL">Rehearsals</option>
              <option value="RECORDING">Recording</option>
              <option value="OTHER">Other</option>
            </select>
            <div className="flex bg-gray-700 rounded overflow-hidden">
              <button
                onClick={() => setView('calendar')}
                className={`px-3 py-2 text-sm ${view === 'calendar' ? 'bg-slack-purple text-white' : 'text-gray-300'}`}
              >
                Calendar
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-3 py-2 text-sm ${view === 'list' ? 'bg-slack-purple text-white' : 'text-gray-300'}`}
              >
                List
              </button>
            </div>
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
              className="p-2 text-gray-400 hover:text-white"
            >
              ← Prev
            </button>
            <h3 className="text-lg font-medium text-white">
              {format(currentMonth, 'MMMM yyyy')}
            </h3>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 text-gray-400 hover:text-white"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}

        {view === 'calendar' ? (
          /* Calendar View */
          <div ref={calendarContainerRef} className="bg-gray-800 rounded-lg overflow-hidden relative">
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
            <div className="grid grid-cols-7 bg-gray-700">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="p-2 text-center text-gray-400 text-sm font-medium">
                  {day}
                </div>
              ))}
            </div>
            {/* Calendar Grid */}
            <div className="grid grid-cols-7">
              {paddingDays.map((_, i) => (
                <div key={`pad-${i}`} className="p-2 min-h-[100px] border-t border-gray-700 bg-gray-900/50" />
              ))}
              {daysInMonth.map(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayGigs = gigsByDate[dateKey] || [];
                const filteredDayGigs = filterType
                  ? dayGigs.filter(g => g.type === filterType)
                  : dayGigs;
                const isDropTarget = dropTargetDate && isSameDay(day, dropTargetDate);

                return (
                  <div
                    key={dateKey}
                    onClick={() => {
                      setSelectedDate(day);
                      setEditingGig(null);
                      setShowForm(true);
                    }}
                    onDragOver={(e) => handleDragOver(e, day)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, day)}
                    className={`p-2 min-h-[100px] border-t border-gray-700 cursor-pointer hover:bg-gray-700/50 transition-colors ${
                      !isSameMonth(day, currentMonth) ? 'bg-gray-900/50' : ''
                    } ${isToday(day) ? 'bg-blue-900/20' : ''} ${
                      isDropTarget ? 'bg-green-900/40 ring-2 ring-green-500 ring-inset' : ''
                    }`}
                  >
                    <div className={`text-sm mb-1 ${
                      isToday(day) ? 'text-blue-400 font-bold' : 'text-gray-400'
                    }`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1">
                      {filteredDayGigs.slice(0, 3).map(gig => (
                        <div
                          key={gig.id}
                          draggable={!gig.isExternal}
                          onDragStart={gig.isExternal ? undefined : (e) => handleDragStart(e, gig)}
                          onDragEnd={gig.isExternal ? undefined : handleDragEnd}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!gig.isExternal) {
                              setEditingGig(gig);
                              setShowForm(true);
                            }
                          }}
                          title={gig.isExternal ? `${gig.workspace?.name || 'Other workspace'}` : gig.title}
                          className={`text-xs p-1 rounded text-white truncate ${gig.isExternal ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${getTypeColor(gig.type, gig.isExternal)} ${
                            gig.status === 'CANCELLED' ? 'opacity-50 line-through' : ''
                          } ${draggingGig?.id === gig.id ? 'opacity-50' : ''}`}
                        >
                          <span className="font-medium">{formatTimeRange(gig.date, gig.endDate)} </span>
                          {gig.title}
                        </div>
                      ))}
                      {filteredDayGigs.length > 3 && (
                        <div className="text-xs text-gray-500">
                          +{filteredDayGigs.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* List View */
          <div className="space-y-4">
            {upcomingGigs.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                No upcoming events
              </div>
            ) : (
              upcomingGigs.map(gig => (
                <div
                  key={gig.id}
                  className={`bg-gray-800 rounded-lg p-4 ${gig.isExternal ? 'border-2 border-dashed border-gray-600' : 'border border-gray-700'}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-2 h-full rounded ${getTypeColor(gig.type, gig.isExternal)}`} />
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-white font-medium">
                            {gig.title}
                            {gig.isExternal && (
                              <span className="ml-2 text-xs text-gray-400 font-normal">
                                ({gig.workspace?.name || 'Other band'})
                              </span>
                            )}
                          </h3>
                          <p className="text-gray-400 text-sm">
                            {format(new Date(gig.date), 'EEEE, MMMM d, yyyy')} {formatTimeRange(gig.date, gig.endDate)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(gig.status)}
                          <span className={`text-xs px-2 py-1 rounded ${getTypeColor(gig.type, gig.isExternal)} text-white`}>
                            {gig.type}
                          </span>
                        </div>
                      </div>

                      {(gig.venue || gig.address) && (
                        <p className="text-gray-400 text-sm mt-2">
                          📍 {gig.venue}{gig.address && ` - ${gig.address}`}
                        </p>
                      )}

                      {/* Multi-set display */}
                      {gig.setlists && gig.setlists.length > 0 ? (
                        <div className="text-gray-400 text-sm mt-1">
                          <span className="text-indigo-400">🎵 {gig.setlists.length} Sets:</span>
                          <span className="ml-2">
                            {gig.setlists
                              .sort((a, b) => a.setNumber - b.setNumber)
                              .map(gs => gs.setlist?.name || `Set ${gs.setNumber}`)
                              .join(' → ')}
                          </span>
                        </div>
                      ) : gig.setlist && (
                        <p className="text-gray-400 text-sm mt-1">
                          🎵 Setlist: {gig.setlist.name}
                        </p>
                      )}

                      {gig.pay && (
                        <p className="text-green-400 text-sm mt-1">
                          💰 ¥{gig.pay}
                        </p>
                      )}

                      {gig.notes && (
                        <p className="text-gray-500 text-sm mt-2 italic">{gig.notes}</p>
                      )}

                      {/* Only show action buttons for non-external events */}
                      {!gig.isExternal && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => {
                              setEditingGig(gig);
                              setShowForm(true);
                            }}
                            className="text-sm text-gray-400 hover:text-white"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDuplicateGig(gig)}
                            className="text-sm text-blue-400 hover:text-blue-300"
                          >
                            Copy
                          </button>
                          {gig.status === 'SCHEDULED' && (
                            <button
                              onClick={() => handleCompleteGig(gig)}
                              className="text-sm text-green-400 hover:text-green-300"
                            >
                              Mark Complete
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteGigId(gig.id)}
                            className="text-sm text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
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
      {showMoveOrCopy && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-2">Move or Copy?</h3>
            <p className="text-gray-400 mb-4">
              "{showMoveOrCopy.gig.title}" → {format(showMoveOrCopy.targetDate, 'MMM d, yyyy')}
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
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GigCalendar;
