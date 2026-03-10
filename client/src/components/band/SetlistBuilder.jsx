import { useState, useMemo, useRef, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import { hapticMedium } from '../../services/haptic';
import { format } from 'date-fns';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../../services/api';
import { escapeHtml } from '../../utils/escapeHtml';
import SongForm from './SongForm';

// Helper to split items into sets based on SET_BREAK markers
function splitIntoSets(items) {
  const sets = [];
  let currentSet = { breakItem: null, items: [] };

  for (const item of items) {
    if (item.type === 'SET_BREAK') {
      // Save current set if it has items
      if (currentSet.items.length > 0 || currentSet.breakItem) {
        sets.push(currentSet);
      }
      // Start new set with this break
      currentSet = { breakItem: item, items: [] };
    } else {
      currentSet.items.push(item);
    }
  }

  // Push last set
  if (currentSet.items.length > 0 || currentSet.breakItem) {
    sets.push(currentSet);
  }

  return sets;
}

// Sortable item component
function SortableItem({ item, index, totalItems, onRemove, onMove, getSongDisplayName, useShortNames, formatDuration, onBreakDurationChange, onSongClick }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 ${
        item.type === 'SET_BREAK'
          ? 'bg-blue-900/40 hover:bg-blue-900/60 border-l-4 border-blue-500'
          : item.type === 'MC'
          ? 'bg-yellow-900/30 hover:bg-yellow-900/50'
          : 'bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-secondary)]'
      }`}
    >
      {/* Drag handle and move buttons */}
      <div className="flex flex-col gap-1">
        <button
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          className="w-8 h-8 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-30 rounded touch-manipulation"
          aria-label="Move up"
        >
          ▲
        </button>
        <button
          onClick={() => onMove(index, 1)}
          disabled={index === totalItems - 1}
          className="w-8 h-8 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-30 rounded touch-manipulation"
          aria-label="Move down"
        >
          ▼
        </button>
      </div>

      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-2 -m-2 touch-manipulation"
        aria-label="Drag to reorder"
      >
        <span className="text-[var(--color-text-muted)] select-none">⋮⋮</span>
      </div>

      <span className="text-[var(--color-text-muted)] w-6 text-right">{index + 1}.</span>

      {item.type === 'SET_BREAK' ? (
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div className="text-blue-400 truncate font-bold text-lg">
            📋 {item.label || 'Set Break'}
          </div>
          <select
            value={item.duration || 900}
            onChange={(e) => onBreakDurationChange(item, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="px-2 py-1 bg-blue-900/50 border border-blue-700/50 rounded text-blue-300 text-sm"
          >
            {BREAK_DURATION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      ) : item.type === 'MC' ? (
        <>
          <div className="flex-1 min-w-0">
            <div className="text-yellow-400 truncate font-medium">
              🎤 {item.label || 'MC'}
            </div>
            <div className="text-yellow-600 text-sm">Talk / Banter</div>
          </div>
          <div className="text-xs text-yellow-400">
            {formatDuration(item.duration || 60)}
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <div
              className="text-blue-400 truncate cursor-pointer hover:underline"
              onClick={(e) => { e.stopPropagation(); onSongClick?.(item); }}
            >
              {getSongDisplayName(item.song)}
            </div>
            {!useShortNames && item.song?.artist && (
              <div className="text-[var(--color-text-muted)] text-sm truncate">{item.song.artist}</div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            {item.song?.key && (
              <span className="px-1.5 py-0.5 bg-purple-900/50 rounded">{item.song.key}</span>
            )}
            {item.song?.duration && (
              <span>{formatDuration(item.song.duration)}</span>
            )}
          </div>
        </>
      )}

      <button
        onClick={() => onRemove(item)}
        className="w-10 h-10 flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-400 hover:bg-[var(--color-bg-tertiary)] rounded touch-manipulation"
        aria-label="Remove item"
      >
        ✕
      </button>
    </div>
  );
}

// Set Column component for multi-column view
function SetColumn({
  set,
  setIndex,
  globalStartIndex,
  onRemove,
  onMoveGlobal,
  getSongDisplayName,
  useShortNames,
  formatDuration,
  getItemDuration,
  onBreakDurationChange,
  timing,
  nextBreakItem,
  onSongClick
}) {
  // All items in this column including the break
  const allColumnItems = set.breakItem ? [set.breakItem, ...set.items] : set.items;

  // Calculate set statistics - songs/MC only (exclude break duration)
  const setSongCount = set.items.filter(i => i.type !== 'MC' && i.type !== 'SET_BREAK').length;
  const setMcCount = set.items.filter(i => i.type === 'MC').length;
  const songsDuration = set.items.reduce((acc, item) => acc + getItemDuration(item), 0);
  const songsMins = Math.ceil(songsDuration / 60);

  return (
    <div className="flex flex-col bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden border border-[var(--color-border)]">
      {/* Set Header */}
      <div className="p-3 bg-blue-900/30 border-b border-blue-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-blue-400 font-bold">
              📋 {set.breakItem?.label || `Set ${setIndex + 1}`}
            </h3>
            {timing && (
              <div className="text-cyan-300 text-xs mt-0.5">
                {formatTime12h(timing.start)} – {formatTime12h(timing.end)}
              </div>
            )}
          </div>
          <div className="text-right text-xs">
            <div className="text-[var(--color-text-secondary)]">
              {setSongCount} song{setSongCount !== 1 ? 's' : ''}
              {setMcCount > 0 && ` + ${setMcCount} MC`}
            </div>
            <div className="text-emerald-400 font-medium">
              {songsMins} min
            </div>
          </div>
        </div>
      </div>

      {/* Set Items */}
      <div className="flex-1 overflow-y-auto overscroll-contain min-h-[100px]">
        {set.items.length === 0 ? (
          <div className="text-center text-[var(--color-text-muted)] py-8 text-sm">
            <p>No songs in this set</p>
            <p className="text-xs mt-1">Drag songs here</p>
          </div>
        ) : (
          <SortableContext
            items={set.items.map(item => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="divide-y divide-gray-700">
              {set.items.map((item, localIndex) => {
                const globalIndex = globalStartIndex + localIndex + (set.breakItem ? 1 : 0);
                return (
                  <SetColumnItem
                    key={item.id}
                    item={item}
                    localIndex={localIndex}
                    totalItems={set.items.length}
                    globalIndex={globalIndex}
                    onRemove={onRemove}
                    onMoveGlobal={onMoveGlobal}
                    getSongDisplayName={getSongDisplayName}
                    useShortNames={useShortNames}
                    formatDuration={formatDuration}
                    onSongClick={onSongClick}
                  />
                );
              })}
            </div>
          </SortableContext>
        )}
      </div>

      {/* Break duration footer */}
      {nextBreakItem && (
        <div className="p-2 bg-blue-900/20 border-t border-blue-800/50 flex items-center justify-center gap-2">
          <select
            value={nextBreakItem.duration || 900}
            onChange={(e) => onBreakDurationChange(nextBreakItem, e.target.value)}
            className="px-2 py-1 bg-blue-900/50 border border-blue-700/50 rounded text-blue-300 text-xs"
          >
            {BREAK_DURATION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label} break</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// Simplified item component for set columns (no set break display since it's in the header)
function SetColumnItem({
  item,
  localIndex,
  totalItems,
  globalIndex,
  onRemove,
  onMoveGlobal,
  getSongDisplayName,
  useShortNames,
  formatDuration,
  onSongClick
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-2 ${
        item.type === 'MC'
          ? 'bg-yellow-900/30 hover:bg-yellow-900/50'
          : 'bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-secondary)]'
      }`}
    >
      {/* Move buttons */}
      <div className="flex flex-col gap-0.5">
        <button
          onClick={() => onMoveGlobal(globalIndex, -1)}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-700 disabled:opacity-30 rounded text-xs touch-manipulation"
          aria-label="Move up"
        >
          ▲
        </button>
        <button
          onClick={() => onMoveGlobal(globalIndex, 1)}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-700 disabled:opacity-30 rounded text-xs touch-manipulation"
          aria-label="Move down"
        >
          ▼
        </button>
      </div>

      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 touch-manipulation"
        aria-label="Drag to reorder"
      >
        <span className="text-[var(--color-text-muted)] select-none text-sm">⋮⋮</span>
      </div>

      <span className="text-[var(--color-text-muted)] w-5 text-right text-sm">{localIndex + 1}.</span>

      {item.type === 'MC' ? (
        <>
          <div className="flex-1 min-w-0">
            <div className="text-yellow-400 truncate text-sm font-medium">
              🎤 {item.label || 'MC'}
            </div>
          </div>
          <div className="text-xs text-yellow-400">
            {formatDuration(item.duration || 60)}
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <div
              className="text-blue-400 truncate text-sm cursor-pointer hover:underline"
              onClick={(e) => { e.stopPropagation(); onSongClick?.(item); }}
            >
              {getSongDisplayName(item.song)}
            </div>
            {!useShortNames && item.song?.artist && (
              <div className="text-gray-400 text-xs truncate">{item.song.artist}</div>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
            {item.song?.key && (
              <span className="px-1 py-0.5 bg-purple-900/50 rounded text-xs">{item.song.key}</span>
            )}
            {item.song?.duration && (
              <span className="text-xs">{formatDuration(item.song.duration)}</span>
            )}
          </div>
        </>
      )}

      <button
        onClick={() => onRemove(item)}
        className="w-8 h-8 flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-400 hover:bg-[var(--color-bg-tertiary)] rounded touch-manipulation"
        aria-label="Remove item"
      >
        ✕
      </button>
    </div>
  );
}

// Time helper functions
const formatTime12h = (time24) => {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
};

const addMinutesToTime = (time24, minutes) => {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const totalMins = Math.round(h * 60 + m + minutes);
  const newH = Math.floor(totalMins / 60) % 24;
  const newM = totalMins % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

const roundUpTo5 = (time24) => {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const rounded = Math.ceil(m / 5) * 5;
  const newH = (h + Math.floor(rounded / 60)) % 24;
  const newM = rounded % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
};

const BREAK_DURATION_OPTIONS = [
  { value: 300, label: '5 min' },
  { value: 600, label: '10 min' },
  { value: 900, label: '15 min' },
  { value: 1200, label: '20 min' },
  { value: 1500, label: '25 min' },
  { value: 1800, label: '30 min' },
  { value: 2700, label: '45 min' },
  { value: 3600, label: '60 min' },
];

function SetlistBuilder({ setlist, allSongs, workspaceName, onBack, onUpdate }) {
  const toast = useToast();
  const [setlistItems, setSetlistItems] = useState(setlist.songs || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [useShortNames, setUseShortNames] = useState(setlist.useShortNames || false);
  const [startTime, setStartTime] = useState(setlist.startTime || '');
  const [songSortBy, setSongSortBy] = useState('title');
  const [viewingSong, setViewingSong] = useState(null);
  const [setlistPanelWidth, setSetlistPanelWidth] = useState(70); // percentage
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(setlist.name);
  const [savingName, setSavingName] = useState(false);
  const containerRef = useRef(null);
  const isResizing = useRef(false);

  // Resize handler for the divider between setlist and available songs
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent) => {
      if (!isResizing.current || !containerRef.current) return;
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const newWidth = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      // Clamp between 30% and 90%
      setSetlistPanelWidth(Math.min(90, Math.max(30, newWidth)));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  // Configure sensors for both mouse and touch
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const availableSongs = allSongs.filter(
    song => !setlistItems.some(item => item.songId === song.id)
  );

  const filteredAvailable = availableSongs
    .filter(song => {
      const query = searchQuery.toLowerCase();
      return song.title.toLowerCase().includes(query) ||
        (song.artist && song.artist.toLowerCase().includes(query));
    })
    .sort((a, b) => {
      switch (songSortBy) {
        case 'artist':
          return (a.artist || '').localeCompare(b.artist || '');
        case 'duration':
          return (b.duration || 0) - (a.duration || 0);
        case 'setlists':
          return (b._count?.setlistSongs || 0) - (a._count?.setlistSongs || 0);
        case 'title':
        default:
          return a.title.localeCompare(b.title);
      }
    });

  const handleAddSong = async (songId) => {
    try {
      const result = await api.addSongToSetlist(setlist.id, songId);
      setSetlistItems(prev => [...prev, result]);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAddMC = async () => {
    try {
      const result = await api.addMCToSetlist(setlist.id, 60, 'MC');
      setSetlistItems(prev => [...prev, result]);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAddSetBreak = async () => {
    const existingBreaks = setlistItems.filter(i => i.type === 'SET_BREAK').length;
    const label = `Set ${existingBreaks + 1}`;
    try {
      const result = await api.addSetBreakToSetlist(setlist.id, label, 900);
      setSetlistItems(prev => [...prev, result]);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRemoveItem = async (item) => {
    try {
      await api.removeSetlistItem(setlist.id, item.id);
      setSetlistItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDragEnd = async (event) => {
    hapticMedium();
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = setlistItems.findIndex(item => item.id === active.id);
      const newIndex = setlistItems.findIndex(item => item.id === over.id);

      const newList = arrayMove(setlistItems, oldIndex, newIndex);
      setSetlistItems(newList);

      setSaving(true);
      try {
        const itemIds = newList.map(item => item.id);
        await api.reorderSetlistItems(setlist.id, itemIds);
      } catch (err) {
        toast.error('Failed to save order: ' + err.message);
      } finally {
        setSaving(false);
      }
    }
  };

  const moveItem = async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= setlistItems.length) return;

    const newList = arrayMove(setlistItems, index, newIndex);
    setSetlistItems(newList);

    setSaving(true);
    try {
      const itemIds = newList.map(i => i.id);
      await api.reorderSetlistItems(setlist.id, itemIds);
    } catch (err) {
      toast.error('Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  const toggleShortNames = async () => {
    const newValue = !useShortNames;
    setUseShortNames(newValue);
    try {
      await api.updateSetlist(setlist.id, { useShortNames: newValue });
    } catch (err) {
      console.error('Failed to save preference:', err);
    }
  };

  const getSongDisplayName = (song) => {
    if (useShortNames && song?.shortName) {
      return song.shortName;
    }
    return song?.title || '';
  };

  const getItemDuration = (item) => {
    if (item.type === 'SET_BREAK') {
      return item.duration || 0;
    }
    if (item.type === 'MC') {
      return item.duration || 60;
    }
    const songDuration = item.song?.duration || 0;
    return songDuration > 0 ? Math.ceil(songDuration / 60) * 60 : 0;
  };

  const totalDuration = setlistItems.reduce((acc, item) => acc + getItemDuration(item), 0);
  const durationMins = Math.floor(totalDuration / 60);
  const durationSecs = totalDuration % 60;

  const songCount = setlistItems.filter(i => i.type !== 'MC' && i.type !== 'SET_BREAK').length;
  const mcCount = setlistItems.filter(i => i.type === 'MC').length;

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Split items into sets for multi-column view
  const sets = useMemo(() => splitIntoSets(setlistItems), [setlistItems]);
  const hasMultipleSets = sets.length > 1 || (sets.length === 1 && sets[0].breakItem);

  // Calculate per-set start/end times
  const setTimings = useMemo(() => {
    if (!startTime) return null;
    const timings = [];
    let currentTime = startTime;

    for (let i = 0; i < sets.length; i++) {
      const set = sets[i];
      const allColumnItems = set.breakItem ? [set.breakItem, ...set.items] : set.items;

      // For the first set, skip the break duration (it's just a label marker)
      // For subsequent sets, the break duration before this set was already counted
      const setStart = currentTime;
      let setDurationSecs = 0;

      for (const item of allColumnItems) {
        if (item.type === 'SET_BREAK' && i > 0) {
          // Break before this set - add break duration
          currentTime = addMinutesToTime(currentTime, (item.duration || 0) / 60);
        }
        if (item.type === 'SET_BREAK' && i === 0) {
          // First set break marker, skip duration (gig starts now)
        }
        if (item.type !== 'SET_BREAK') {
          setDurationSecs += getItemDuration(item);
        }
      }

      const actualStart = i > 0 ? roundUpTo5(currentTime) : setStart;
      const setEnd = addMinutesToTime(actualStart, setDurationSecs / 60);

      timings.push({
        start: actualStart,
        end: setEnd
      });

      currentTime = setEnd;
    }

    return timings;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, sets]);

  const endTime = useMemo(() => {
    if (setTimings && setTimings.length > 0) {
      return setTimings[setTimings.length - 1].end;
    }
    if (!startTime) return '';
    return addMinutesToTime(startTime, totalDuration / 60);
  }, [startTime, totalDuration, setTimings]);

  const handleStartTimeChange = async (newTime) => {
    setStartTime(newTime);
    try {
      await api.updateSetlist(setlist.id, { startTime: newTime || null });
    } catch (err) {
      console.error('Failed to save start time:', err);
    }
  };

  const handleSaveName = async () => {
    if (!nameValue.trim() || nameValue === setlist.name) {
      setEditingName(false);
      setNameValue(setlist.name);
      return;
    }
    setSavingName(true);
    try {
      const updated = await api.updateSetlist(setlist.id, { name: nameValue.trim() });
      onUpdate(updated);
      setEditingName(false);
      toast.success('Setlist renamed');
    } catch (err) {
      toast.error(err.message);
      setNameValue(setlist.name);
    } finally {
      setSavingName(false);
    }
  };

  const handleBreakDurationChange = async (item, newDuration) => {
    const duration = parseInt(newDuration);
    setSetlistItems(prev => prev.map(i =>
      i.id === item.id ? { ...i, duration } : i
    ));
    try {
      await api.updateSetlistItem(setlist.id, item.id, { duration });
    } catch (err) {
      console.error('Failed to save break duration:', err);
    }
  };

  const handleSongClick = (item) => {
    const fullSong = allSongs.find(s => s.id === item.song?.id) || item.song;
    if (fullSong) setViewingSong(fullSong);
  };

  const handleSongSave = async (songData) => {
    const updated = await api.updateSong(viewingSong.id, songData);
    setSetlistItems(prev => prev.map(item =>
      item.song?.id === updated.id ? { ...item, song: updated } : item
    ));
    setViewingSong(null);
  };

  // Print/PDF export function
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.warning('Please allow popups for this site to print the setlist');
      return;
    }

    // Format date if available
    const dateStr = setlist.performedAt
      ? format(new Date(setlist.performedAt), 'EEEE, MMMM d, yyyy')
      : format(new Date(), 'EEEE, MMMM d, yyyy');

    const timeRangeStr = startTime && endTime
      ? `${formatTime12h(startTime)} – ${formatTime12h(endTime)}`
      : '';

    // Build the setlist content as columns
    const numSets = sets.length;
    const isLandscape = numSets >= 2;
    const bandName = workspaceName || '';

    const columnsHtml = sets.map((set, setIndex) => {
      const setLabel = set.breakItem
        ? (escapeHtml(set.breakItem.label) || `Set ${setIndex + 1}`)
        : (numSets > 1 ? `Set ${setIndex + 1}` : '');
      const setTimeStr = setTimings?.[setIndex]
        ? ` <span class="set-time">${formatTime12h(setTimings[setIndex].start)} – ${formatTime12h(setTimings[setIndex].end)}</span>`
        : '';

      let itemsHtml = '';
      set.items.forEach(item => {
        if (item.type === 'MC') {
          itemsHtml += `<li class="mc-item">&lt;${escapeHtml(item.label) || 'MC'}&gt;</li>`;
        } else {
          const songName = escapeHtml(getSongDisplayName(item.song));
          itemsHtml += `<li class="song-item">${songName}</li>`;
        }
      });

      return `
        <div class="set-column">
          ${setLabel ? `<div class="set-header">${setLabel}${setTimeStr}</div>` : ''}
          <ul class="song-list">${itemsHtml}</ul>
        </div>
      `;
    }).join('');

    const setlistHtml = `<div class="columns columns-${numSets}">${columnsHtml}</div>`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${escapeHtml(setlist.name)} - Setlist</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { ${isLandscape ? 'size: landscape;' : ''} margin: 10mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            margin: 0 auto;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .header {
            text-align: center;
            margin-bottom: 16px;
            padding-bottom: 14px;
            border-bottom: 3px solid #222;
          }
          .band-name {
            font-size: 32px;
            font-weight: 800;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-bottom: 2px;
          }
          .header-divider {
            width: 60px;
            height: 3px;
            background: #0891b2;
            margin: 8px auto;
            border-radius: 2px;
          }
          .venue {
            font-size: 22px;
            font-weight: 600;
            margin-bottom: 2px;
          }
          .setlist-name {
            font-size: 15px;
            color: #666;
          }
          .header-details {
            display: flex;
            justify-content: center;
            gap: 18px;
            margin-top: 6px;
            font-size: 14px;
            color: #555;
          }
          .header-details span { white-space: nowrap; }
          .time-range { color: #0891b2; font-weight: 500; }
          .content { flex: 1; display: flex; align-items: flex-start; }
          .columns { display: flex; gap: 12px; width: 100%; }
          .columns-1 { max-width: 500px; margin: 0 auto; }
          .set-column { flex: 1; min-width: 0; }
          .set-header {
            font-size: 18px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 0 0 10px 0;
            padding: 6px 0;
            border-bottom: 2px solid #333;
          }
          .set-time {
            font-size: 13px;
            font-weight: normal;
            color: #0891b2;
            margin-left: 8px;
            text-transform: none;
            letter-spacing: 0;
          }
          .song-list { list-style: none; padding: 0; }
          .song-item {
            padding: 5px 0;
            font-size: 18px;
          }
          .mc-item {
            padding: 5px 0;
            font-style: italic;
            font-size: 18px;
          }
          .footer {
            margin-top: 14px;
            padding-top: 10px;
            border-top: 3px solid #222;
            text-align: center;
          }
          .stats { font-size: 12px; color: #666; }
          @media print {
            body { padding: 0; }
            .set-header { break-inside: avoid; }
            .song-item { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${bandName ? `<div class="band-name">${escapeHtml(bandName)}</div>` : ''}
          ${bandName && (setlist.venue || setlist.name) ? '<div class="header-divider"></div>' : ''}
          ${setlist.venue ? `<div class="venue">${escapeHtml(setlist.venue)}</div>` : ''}
          <div class="setlist-name">${escapeHtml(setlist.name)}</div>
          <div class="header-details">
            <span>${dateStr}</span>
            ${timeRangeStr ? `<span class="time-range">${timeRangeStr}</span>` : ''}
          </div>
        </div>
        <div class="content">${setlistHtml}</div>
        <div class="footer">
          <div class="stats">${songCount} songs &bull; ${durationMins}:${String(durationSecs).padStart(2, '0')} total</div>
        </div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Calculate global start indices for each set
  const setStartIndices = useMemo(() => {
    const indices = [];
    let currentIndex = 0;
    for (const set of sets) {
      indices.push(currentIndex);
      currentIndex += (set.breakItem ? 1 : 0) + set.items.length;
    }
    return indices;
  }, [sets]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded touch-manipulation"
            aria-label="Go back"
          >
            ← Back
          </button>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') {
                      setEditingName(false);
                      setNameValue(setlist.name);
                    }
                  }}
                  onBlur={handleSaveName}
                  autoFocus
                  disabled={savingName}
                  className="text-xl font-bold bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text-primary)] w-full max-w-md"
                />
                {savingName && <span className="text-[var(--color-text-muted)] text-sm">Saving...</span>}
              </div>
            ) : (
              <h2
                className="text-xl font-bold text-[var(--color-text-primary)] truncate cursor-pointer hover:text-blue-400 group flex items-center gap-2"
                onClick={() => setEditingName(true)}
                title="Click to rename"
              >
                {setlist.name}
                <span className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 text-sm">✏️</span>
              </h2>
            )}
            {setlist.description && (
              <p className="text-[var(--color-text-muted)] text-sm truncate">{setlist.description}</p>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <button
              onClick={handlePrint}
              className="px-3 py-2 rounded text-sm bg-orange-600 hover:bg-orange-500 text-white touch-manipulation"
              title="Print or save as PDF"
            >
              🖨️ Print
            </button>
            <button
              onClick={toggleShortNames}
              className={`px-3 py-2 rounded text-sm touch-manipulation ${
                useShortNames
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
              }`}
              title="Toggle between full song titles and short names"
            >
              {useShortNames ? 'Short Names' : 'Full Titles'}
            </button>
            <div className="text-right text-sm">
              <div className="text-[var(--color-text-primary)] font-medium">
                {songCount} song{songCount !== 1 ? 's' : ''}
                {mcCount > 0 && ` + ${mcCount} MC`}
              </div>
              <div className="text-[var(--color-text-muted)]">{durationMins}:{String(durationSecs).padStart(2, '0')}</div>
            </div>
          </div>
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
                <div className="fixed inset-0 z-40" onClick={() => setShowMobileMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border)] py-1 z-50 min-w-[180px]">
                  <button
                    onClick={() => { setShowMobileMenu(false); handlePrint(); }}
                    className="w-full px-4 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
                  >
                    🖨️ Print
                  </button>
                  <button
                    onClick={() => { setShowMobileMenu(false); toggleShortNames(); }}
                    className="w-full px-4 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
                  >
                    {useShortNames ? '📝 Full Titles' : '📝 Short Names'}
                  </button>
                  <div className="px-4 py-2 text-sm text-[var(--color-text-muted)] border-t border-[var(--color-border)]">
                    {songCount} song{songCount !== 1 ? 's' : ''}
                    {mcCount > 0 && ` + ${mcCount} MC`}
                    {' · '}{durationMins}:{String(durationSecs).padStart(2, '0')}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Timing Row */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <label className="text-[var(--color-text-muted)] text-sm">Start</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className="px-2 py-1 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] text-sm"
            />
          </div>
          {startTime && endTime && (
            <div className="px-3 py-1.5 bg-emerald-900/30 border border-emerald-700/50 rounded-full text-sm">
              <span className="text-emerald-300 font-medium">
                {formatTime12h(startTime)} – {formatTime12h(endTime)}
              </span>
              <span className="text-[var(--color-text-muted)] ml-2">
                ({durationMins}:{String(durationSecs).padStart(2, '0')})
              </span>
            </div>
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Setlist Items */}
        <div
          className="flex-1 flex flex-col border-b md:border-b-0 border-[var(--color-border)] min-w-0"
          style={{ flex: `0 0 ${setlistPanelWidth}%` }}
        >
          <div className="p-3 bg-[var(--color-bg-secondary)] text-sm text-[var(--color-text-muted)] uppercase tracking-wide flex items-center justify-between">
            <span>Setlist Order {saving && '(saving...)'}</span>
            <div className="flex gap-2">
              <button
                onClick={handleAddSetBreak}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-medium touch-manipulation"
              >
                + Set Break
              </button>
              <button
                onClick={handleAddMC}
                className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-xs rounded font-medium touch-manipulation"
              >
                + MC Break
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {setlistItems.length === 0 ? (
              <div className="text-center text-[var(--color-text-muted)] py-12">
                <div className="text-4xl mb-3">📋</div>
                <p>Add songs from below</p>
                <p className="text-sm mt-1">Drag to reorder or use arrow buttons</p>
              </div>
            ) : hasMultipleSets ? (
              /* Multi-column view for desktop with multiple sets */
              <DndContext
                sensors={sensors}
                collisionDetection={pointerWithin}
                onDragEnd={handleDragEnd}
              >
                <div className={`p-3 grid gap-3 ${
                  sets.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
                  sets.length >= 3 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : ''
                }`}>
                  {sets.map((set, setIndex) => (
                    <SetColumn
                      key={set.breakItem?.id || `set-${setIndex}`}
                      set={set}
                      setIndex={setIndex}
                      globalStartIndex={setStartIndices[setIndex]}
                      onRemove={handleRemoveItem}
                      onMoveGlobal={moveItem}
                      getSongDisplayName={getSongDisplayName}
                      useShortNames={useShortNames}
                      formatDuration={formatDuration}
                      getItemDuration={getItemDuration}
                      onBreakDurationChange={handleBreakDurationChange}
                      timing={setTimings?.[setIndex]}
                      nextBreakItem={sets[setIndex + 1]?.breakItem}
                      onSongClick={handleSongClick}
                    />
                  ))}
                </div>
              </DndContext>
            ) : (
              /* Original single-column view */
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={setlistItems.map(item => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="divide-y divide-[var(--color-border)]">
                    {setlistItems.map((item, index) => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        index={index}
                        totalItems={setlistItems.length}
                        onRemove={handleRemoveItem}
                        onMove={moveItem}
                        getSongDisplayName={getSongDisplayName}
                        useShortNames={useShortNames}
                        formatDuration={formatDuration}
                        onBreakDurationChange={handleBreakDurationChange}
                        onSongClick={handleSongClick}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Total Time Footer */}
          {setlistItems.length > 0 && (
            <div className="flex-shrink-0 p-3 bg-[var(--color-bg-primary)] border-t border-[var(--color-border)]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)] text-sm">
                  {songCount} song{songCount !== 1 ? 's' : ''}
                  {mcCount > 0 && ` + ${mcCount} MC`}
                </span>
                <div className="flex items-center gap-3">
                  {startTime && endTime && (
                    <span className="text-cyan-300 text-sm">
                      {formatTime12h(startTime)} – {formatTime12h(endTime)}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--color-text-muted)] text-sm">Total:</span>
                    <span className="text-xl font-bold text-emerald-400">
                      {durationMins}:{String(durationSecs).padStart(2, '0')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Resize Handle */}
        <div
          className="hidden md:flex w-2 bg-[var(--color-bg-tertiary)] hover:bg-blue-600 cursor-col-resize items-center justify-center flex-shrink-0 transition-colors"
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        >
          <div className="w-0.5 h-8 bg-[var(--color-text-muted)] rounded"></div>
        </div>

        {/* Available Songs */}
        <div className="flex-1 flex flex-col min-h-[200px] md:min-h-0 min-w-[200px]">
          <div className="p-3 bg-[var(--color-bg-secondary)] space-y-2">
            <input
              type="text"
              placeholder="Search songs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] placeholder-gray-400 text-sm"
              aria-label="Search songs"
            />
            <select
              value={songSortBy}
              onChange={(e) => setSongSortBy(e.target.value)}
              className="w-full px-2 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded text-[var(--color-text-primary)] text-sm"
              aria-label="Sort songs by"
            >
              <option value="title">Sort by Title</option>
              <option value="artist">Sort by Artist</option>
              <option value="duration">Sort by Duration</option>
              <option value="setlists">Sort by Times Played</option>
            </select>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {filteredAvailable.length === 0 ? (
              <div className="text-center text-[var(--color-text-muted)] py-8 text-sm">
                {searchQuery ? 'No matching songs' : 'All songs added'}
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {filteredAvailable.map(song => (
                  <button
                    key={song.id}
                    onClick={() => handleAddSong(song.id)}
                    className="w-full flex items-center gap-2 p-3 hover:bg-[var(--color-bg-secondary)] active:bg-[var(--color-bg-tertiary)] text-left min-h-[52px] touch-manipulation"
                  >
                    <span className="text-green-500 text-lg w-8 h-8 flex items-center justify-center">+</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[var(--color-text-primary)] text-sm truncate">{song.title}</div>
                      {song.artist && (
                        <div className="text-[var(--color-text-muted)] text-xs truncate">{song.artist}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {song.bpm && (
                        <span className="text-xs px-1.5 py-0.5 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded">
                          {song.bpm}
                        </span>
                      )}
                      {song.key && (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded">
                          {song.key}
                        </span>
                      )}
                      {song.duration && (
                        <span className="text-xs text-[var(--color-text-muted)] w-10 text-right">
                          {formatDuration(song.duration)}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Song Detail Modal */}
      {viewingSong && (
        <SongForm
          song={viewingSong}
          onSave={handleSongSave}
          onClose={() => setViewingSong(null)}
        />
      )}
    </div>
  );
}

export default SetlistBuilder;
