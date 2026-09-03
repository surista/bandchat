import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { hapticMedium } from '../../services/haptic';
import SetlistPrintPreviewModal from './SetlistPrintPreviewModal';
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
import { formatDuration } from '../../utils/formatDuration';
import { computeSetlistDuration, computeSetDuration, formatSetlistDuration, getItemActualDuration, MC_DEFAULT_DURATION_SECS } from '../../utils/setlistDuration';
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

// Personal note input — debounced save, private to the current user.
// Renders inline below a song/MC item in the setlist builder. The actual
// note storage is per-(user, setlistSong) on the server (SetlistSongNote
// model). Empty value clears the row.
function NoteInput({ value, onSave, compact = false }) {
  const [draft, setDraft] = useState(value || '');
  const lastSavedRef = useRef(value || '');
  const timerRef = useRef(null);

  // Reset draft when the prop changes from outside (e.g. notes reloaded).
  useEffect(() => {
    if ((value || '') !== lastSavedRef.current) {
      lastSavedRef.current = value || '';
      setDraft(value || '');
    }
  }, [value]);

  const scheduleSave = (next) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (next !== lastSavedRef.current) {
        lastSavedRef.current = next;
        onSave(next);
      }
    }, 800);
  };

  const flushSave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (draft !== lastSavedRef.current) {
      lastSavedRef.current = draft;
      onSave(draft);
    }
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => { setDraft(e.target.value); scheduleSave(e.target.value); }}
      onBlur={flushSave}
      onClick={(e) => e.stopPropagation()}
      maxLength={500}
      placeholder="📝 your private note (e.g. drop D tuning) — saved only for you"
      className={`w-full bg-transparent border-0 border-b border-transparent hover:border-[var(--color-border)] focus:border-blue-500 focus:outline-none italic text-[var(--color-text-muted)] focus:text-[var(--color-text-primary)] ${compact ? 'text-xs py-0.5' : 'text-sm py-1'}`}
      aria-label="Personal note for this song"
    />
  );
}

// Sortable item component
function McDurationSelect({ item, onChange }) {
  return (
    <select
      value={item.duration || MC_DEFAULT_DURATION_SECS}
      onChange={(e) => onChange?.(item, e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label="MC duration"
      className="px-2 py-1 bg-yellow-900/40 border border-yellow-700/50 rounded text-yellow-300 text-xs"
    >
      {MC_DURATION_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function SortableItem({ item, index, totalItems, onRemove, onMove, getSongDisplayName, useShortNames, formatDuration, onItemDurationChange, onSongClick, userNote, onSaveNote }) {
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
      className={`flex flex-col ${
        item.type === 'SET_BREAK'
          ? 'bg-blue-900/40 hover:bg-blue-900/60 border-l-4 border-blue-500'
          : item.type === 'MC'
          ? 'bg-yellow-900/30 hover:bg-yellow-900/50'
          : 'bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-secondary)]'
      }`}
    >
      <div className="flex items-center gap-3 p-3">
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
              onChange={(e) => onItemDurationChange(item, e.target.value)}
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
            <McDurationSelect item={item} onChange={onItemDurationChange} />
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
      {/* Personal note row — only for song/MC items, not set breaks. */}
      {item.type !== 'SET_BREAK' && onSaveNote && (
        <div className="px-3 pb-2 -mt-1 pl-[88px]">
          <NoteInput value={userNote} onSave={(c) => onSaveNote(item.id, c)} />
        </div>
      )}
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
  isFinalSet,
  paddingSecs,
  onItemDurationChange,
  timing,
  nextBreakItem,
  onSongClick,
  notes,
  onSaveNote,
}) {
  // All items in this column including the break
  const allColumnItems = set.breakItem ? [set.breakItem, ...set.items] : set.items;

  // Calculate set statistics - songs/MC only (exclude break duration)
  const setSongCount = set.items.filter(i => i.type !== 'MC' && i.type !== 'SET_BREAK').length;
  const setMcCount = set.items.filter(i => i.type === 'MC').length;
  const playableItems = set.items.filter(it => it.type !== 'SET_BREAK');
  const { actualSecs: setActualSecs, paddedSecs: setPaddedSecs, paddingSecs: setPaddingSecs } = computeSetDuration(playableItems, { isFinalSet, paddingSecs });
  const setActualLabel = formatSetlistDuration(setActualSecs);
  const setPaddedLabel = formatSetlistDuration(setPaddedSecs);
  const setHasPadding = setPaddingSecs > 0 && setPaddedSecs !== setActualSecs;

  return (
    <div className="flex flex-col bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden border border-[var(--color-border)]">
      {/* Set Header */}
      <div className="p-3 bg-blue-900/30 border-b border-blue-800/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-blue-400 font-bold">
              📋 Set {setIndex + 1}
            </h3>
            {timing && (
              <div className="text-cyan-300 text-xs mt-0.5">
                {formatTime12h(timing.start)} – {formatTime12h(timing.end)}
              </div>
            )}
          </div>
          <div className="text-right text-xs" title={`Songs-only: ${setActualLabel}${setHasPadding ? ` · Incl. ${setPaddingSecs}s between songs: ${setPaddedLabel}` : ''}`}>
            <div className="text-[var(--color-text-secondary)]">
              {setSongCount} song{setSongCount !== 1 ? 's' : ''}
              {setMcCount > 0 && ` + ${setMcCount} MC`}
            </div>
            <div className="text-emerald-400 font-medium">
              {setPaddedLabel}
              {setHasPadding && <span className="text-[10px] opacity-70 font-normal"> (+{setPaddingSecs}s gaps)</span>}
            </div>
            {setHasPadding && (
              <div className="text-[10px] text-[var(--color-text-muted)] opacity-70">
                {setActualLabel} songs only
              </div>
            )}
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
            <div className="divide-y divide-[var(--color-border)]">
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
                    onItemDurationChange={onItemDurationChange}
                    onSongClick={onSongClick}
                    userNote={notes?.[item.id]?.content || ''}
                    onSaveNote={onSaveNote}
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
            onChange={(e) => onItemDurationChange(nextBreakItem, e.target.value)}
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
  onItemDurationChange,
  onSongClick,
  userNote,
  onSaveNote,
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
      className={`flex flex-col ${
        item.type === 'MC'
          ? 'bg-yellow-900/30 hover:bg-yellow-900/50'
          : 'bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-secondary)]'
      }`}
    >
      <div className="flex items-center gap-2 p-2">
        {/* Move buttons */}
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onMoveGlobal(globalIndex, -1)}
            className="w-6 h-6 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-30 rounded text-xs touch-manipulation"
            aria-label="Move up"
          >
            ▲
          </button>
          <button
            onClick={() => onMoveGlobal(globalIndex, 1)}
            className="w-6 h-6 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-30 rounded text-xs touch-manipulation"
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
            <McDurationSelect item={item} onChange={onItemDurationChange} />
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
                <div className="text-[var(--color-text-muted)] text-xs truncate">{item.song.artist}</div>
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
      {onSaveNote && (
        <div className="px-2 pb-1.5 pl-[68px]">
          <NoteInput value={userNote} onSave={(c) => onSaveNote(item.id, c)} compact />
        </div>
      )}
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

const MC_DURATION_OPTIONS = [
  { value: 15, label: '15 sec' },
  { value: 30, label: '30 sec' },
  { value: 45, label: '45 sec' },
  { value: 60, label: '1 min' },
  { value: 90, label: '1.5 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
];

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

function SetlistBuilder({ setlist, allSongs, workspaceName, transitionPaddingSecs, onBack, onUpdate, onSongUpdate }) {
  const toast = useToast();
  const [setlistItems, setSetlistItems] = useState(setlist.songs || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [useShortNames, setUseShortNames] = useState(setlist.useShortNames || false);
  const [startTime, setStartTime] = useState(setlist.startTime || '');
  const [exportPreview, setExportPreview] = useState(null); // { setlist, opts }
  const [songSortBy, setSongSortBy] = useState('title');
  const [viewingSong, setViewingSong] = useState(null);
  const [setlistPanelWidth, setSetlistPanelWidth] = useState(70); // percentage
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(setlist.name);
  const [savingName, setSavingName] = useState(false);
  // Per-user personal notes, keyed by setlistSongId. Private to current user.
  const [notes, setNotes] = useState({});
  const containerRef = useRef(null);
  const isResizing = useRef(false);

  // Load this user's notes for the setlist on mount / when setlist changes.
  useEffect(() => {
    let cancelled = false;
    api.getMySetlistNotes(setlist.id)
      .then(data => { if (!cancelled) setNotes(data || {}); })
      .catch(err => console.error('Failed to load setlist notes:', err));
    return () => { cancelled = true; };
  }, [setlist.id]);

  // Save (or clear) a note for one song. Optimistically updates local state
  // so the UI feels immediate; server response is the source of truth on
  // subsequent reloads. Empty content removes the note row server-side.
  const handleSaveNote = useCallback(async (setlistSongId, content) => {
    setNotes(prev => {
      const next = { ...prev };
      if (content && content.trim()) {
        next[setlistSongId] = { content, updatedAt: new Date().toISOString() };
      } else {
        delete next[setlistSongId];
      }
      return next;
    });
    try {
      await api.saveSetlistSongNote(setlistSongId, content || '');
    } catch (err) {
      console.error('Failed to save setlist song note:', err);
      toast.error('Could not save your note');
    }
  }, [toast]);

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
      const result = await api.addMCToSetlist(setlist.id, MC_DEFAULT_DURATION_SECS, 'MC');
      setSetlistItems(prev => [...prev, result]);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAddSetBreak = async () => {
    const existingBreaks = setlistItems.filter(i => i.type === 'SET_BREAK').length;
    const label = `Set ${existingBreaks + 2}`;
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

  // Use actual song durations (no ceiling) and a separate padded total that
  // accounts for the workspace-configured transition time between songs. The
  // padded total drives end-time calculations — realistic stage runtime.
  const { actualSecs, paddedSecs, paddingSecs } = useMemo(
    () => computeSetlistDuration(setlistItems, transitionPaddingSecs),
    [setlistItems, transitionPaddingSecs]
  );
  const actualLabel = formatSetlistDuration(actualSecs);
  const paddedLabel = formatSetlistDuration(paddedSecs);
  const hasPadding = paddingSecs > 0 && paddedSecs !== actualSecs;
  // `totalDuration` kept for downstream math (end time, per-set timings). Uses
  // padded so the end-time matches what the band will actually see on stage.
  const totalDuration = paddedSecs;

  const songCount = setlistItems.filter(i => i.type !== 'MC' && i.type !== 'SET_BREAK').length;
  const mcCount = setlistItems.filter(i => i.type === 'MC').length;


  // Split items into sets for multi-column view
  const sets = useMemo(() => splitIntoSets(setlistItems), [setlistItems]);
  const hasMultipleSets = sets.length > 1 || (sets.length === 1 && sets[0].breakItem);

  // Calculate per-set start/end times using padded duration (actual + 15s
  // transitions between songs). Non-final sets pad ALL songs — their last
  // song transitions into the break. The final set pads all but its last.
  const setTimings = useMemo(() => {
    if (!startTime) return null;
    const timings = [];
    let currentTime = startTime;

    for (let i = 0; i < sets.length; i++) {
      const set = sets[i];
      const isFinalSet = i === sets.length - 1;
      // Items that belong to THIS set's playable content (exclude the break marker)
      const playableItems = set.items.filter(it => it.type !== 'SET_BREAK');

      // A leading break (after the first set) advances the clock before this set starts
      if (set.breakItem && i > 0) {
        currentTime = addMinutesToTime(currentTime, (set.breakItem.duration || 0) / 60);
      }

      const { paddedSecs: setPaddedSecs } = computeSetDuration(playableItems, { isFinalSet, paddingSecs: transitionPaddingSecs });

      const actualStart = i > 0 ? roundUpTo5(currentTime) : currentTime;
      const setEnd = addMinutesToTime(actualStart, setPaddedSecs / 60);

      timings.push({ start: actualStart, end: setEnd });
      currentTime = setEnd;
    }

    return timings;
  }, [startTime, sets]); // eslint-disable-line

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

  const handleItemDurationChange = async (item, newDuration) => {
    const duration = parseInt(newDuration);
    setSetlistItems(prev => prev.map(i =>
      i.id === item.id ? { ...i, duration } : i
    ));
    try {
      await api.updateSetlistItem(setlist.id, item.id, { duration });
    } catch (err) {
      console.error('Failed to save item duration:', err);
    }
  };

  const handleSongClick = (item) => {
    // Use item.song directly — the setlist API includes the full song object,
    // and handleSongSave keeps it fresh after edits. Looking up via allSongs
    // (the parent's prop) returned stale data after a save and made edits
    // appear not to persist when re-opening the same song.
    if (item.song) setViewingSong(item.song);
  };

  const handleSongSave = async (songData) => {
    const updated = await api.updateSong(viewingSong.id, songData);
    setSetlistItems(prev => prev.map(item =>
      item.song?.id === updated.id ? { ...item, song: updated } : item
    ));
    // Notify parent so its allSongs / library list reflects the change too —
    // avoids stale entries elsewhere in the workspace song UI.
    if (onSongUpdate) onSongUpdate(updated);
    setViewingSong(null);
  };

  // Resolve venue logo + assemble the shared opts for export.
  // Both Print and Word use the same helper — the only difference is the
  // output mechanism (popup+print vs blob download).
  const resolveExportOpts = async () => {
    let venueLogoUrl = null;
    if (setlist.venue && setlist.workspaceId) {
      try {
        const venues = await api.getVenues(setlist.workspaceId);
        const match = venues.find(v => v.name === setlist.venue);
        if (match?.imageUrl) venueLogoUrl = match.imageUrl;
      } catch (e) {
        console.error('Failed to fetch venue logo for setlist export:', e);
      }
    }
    return {
      bandName: workspaceName || '',
      venueLogoUrl,
      notes,
      transitionPaddingSecs,
      useShortNames,
    };
  };

  // Wrap the current state into a setlist-like object since startTime/
  // useShortNames are tracked locally (the parent's `setlist` prop may be
  // stale until next refresh).
  const buildExportSetlist = () => ({
    ...setlist,
    songs: setlistItems,
    useShortNames,
    startTime,
  });

  const handleOpenExportPreview = async () => {
    const opts = await resolveExportOpts();
    setExportPreview({ setlist: buildExportSetlist(), opts });
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
              onClick={handleOpenExportPreview}
              className="px-3 py-2 rounded text-sm bg-orange-600 hover:bg-orange-500 text-white touch-manipulation"
              title="Preview, adjust text size, and print or export (includes your personal notes)"
            >
              🖨️ Print / Export
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
              {useShortNames ? 'Full' : 'Short'}
            </button>
            <div className="text-right text-sm" title={`Songs-only: ${actualLabel}${hasPadding ? ` · With ${paddingSecs}s gaps: ${paddedLabel}` : ''}`}>
              <div className="text-[var(--color-text-primary)] font-medium">
                {songCount} song{songCount !== 1 ? 's' : ''}
                {mcCount > 0 && ` + ${mcCount} MC`}
              </div>
              <div className="text-[var(--color-text-muted)]">
                {actualLabel}
                {hasPadding && <span className="text-xs opacity-70"> ({paddedLabel} w/ {paddingSecs}s gaps)</span>}
              </div>
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
                    onClick={() => { setShowMobileMenu(false); handleOpenExportPreview(); }}
                    className="w-full px-4 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
                  >
                    🖨️ Print / Export
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
                    {' · '}{actualLabel} ({paddedLabel} w/ gaps)
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
            <div className="px-3 py-1.5 bg-emerald-900/30 border border-emerald-700/50 rounded-full text-sm" title={`Songs-only: ${actualLabel}${hasPadding ? ` · Includes ${paddingSecs}s between songs` : ''}`}>
              <span className="text-emerald-300 font-medium">
                {formatTime12h(startTime)} – {formatTime12h(endTime)}
              </span>
              <span className="text-[var(--color-text-muted)] ml-2">
                ({paddedLabel}{hasPadding ? ` w/ ${paddingSecs}s gaps` : ''})
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
                      isFinalSet={setIndex === sets.length - 1}
                      paddingSecs={transitionPaddingSecs}
                      onItemDurationChange={handleItemDurationChange}
                      timing={setTimings?.[setIndex]}
                      nextBreakItem={sets[setIndex + 1]?.breakItem}
                      onSongClick={handleSongClick}
                      notes={notes}
                      onSaveNote={handleSaveNote}
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
                        onItemDurationChange={handleItemDurationChange}
                        onSongClick={handleSongClick}
                        userNote={notes[item.id]?.content || ''}
                        onSaveNote={handleSaveNote}
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
                  <div className="flex items-center gap-3" title={`Actual = sum of song durations. With gaps = adds ${paddingSecs}s after each song (tuning/banter/gear). Configure in Settings.`}>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[var(--color-text-muted)] text-xs uppercase tracking-wide">Songs Only</span>
                      <span className="text-base font-semibold text-[var(--color-text-secondary)]">{actualLabel}</span>
                    </div>
                    {hasPadding && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[var(--color-text-muted)] text-xs uppercase tracking-wide">+ {paddingSecs}s Gaps</span>
                        <span className="text-xl font-bold text-emerald-400">{paddedLabel}</span>
                      </div>
                    )}
                    {!hasPadding && paddingSecs === 0 && (
                      <span className="text-xl font-bold text-emerald-400">{actualLabel}</span>
                    )}
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

      {exportPreview && (
        <SetlistPrintPreviewModal
          setlist={exportPreview.setlist}
          exportOpts={exportPreview.opts}
          onClose={() => setExportPreview(null)}
        />
      )}
    </div>
  );
}

export default SetlistBuilder;
