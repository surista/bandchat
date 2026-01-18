import { useState } from 'react';
import {
  DndContext,
  closestCenter,
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

// Sortable item component
function SortableItem({ item, index, totalItems, onRemove, onMove, getSongDisplayName, useShortNames, formatDuration }) {
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
          : 'bg-gray-900 hover:bg-gray-800'
      }`}
    >
      {/* Drag handle and move buttons */}
      <div className="flex flex-col gap-1">
        <button
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-700 disabled:opacity-30 rounded touch-manipulation"
          aria-label="Move up"
        >
          ▲
        </button>
        <button
          onClick={() => onMove(index, 1)}
          disabled={index === totalItems - 1}
          className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-700 disabled:opacity-30 rounded touch-manipulation"
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
        <span className="text-gray-500 select-none">⋮⋮</span>
      </div>

      <span className="text-gray-500 w-6 text-right">{index + 1}.</span>

      {item.type === 'SET_BREAK' ? (
        <div className="flex-1 min-w-0">
          <div className="text-blue-400 truncate font-bold text-lg">
            📋 {item.label || 'Set Break'}
          </div>
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
            <div className="text-white truncate">{getSongDisplayName(item.song)}</div>
            {!useShortNames && item.song?.artist && (
              <div className="text-gray-400 text-sm truncate">{item.song.artist}</div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
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
        className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded touch-manipulation"
        aria-label="Remove item"
      >
        ✕
      </button>
    </div>
  );
}

function SetlistBuilder({ setlist, allSongs, onBack, onUpdate }) {
  const [setlistItems, setSetlistItems] = useState(setlist.songs || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [useShortNames, setUseShortNames] = useState(setlist.useShortNames || false);
  const [songSortBy, setSongSortBy] = useState('title');

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
      alert(err.message);
    }
  };

  const handleAddMC = async () => {
    try {
      const result = await api.addMCToSetlist(setlist.id, 60, 'MC');
      setSetlistItems(prev => [...prev, result]);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddSetBreak = async () => {
    const existingBreaks = setlistItems.filter(i => i.type === 'SET_BREAK').length;
    const label = `Set ${existingBreaks + 1}`;
    try {
      const result = await api.addSetBreakToSetlist(setlist.id, label);
      setSetlistItems(prev => [...prev, result]);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemoveItem = async (item) => {
    try {
      await api.removeSetlistItem(setlist.id, item.id);
      setSetlistItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDragEnd = async (event) => {
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
        alert('Failed to save order: ' + err.message);
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
      alert('Failed to save order');
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
      return 0;
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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded touch-manipulation"
            aria-label="Go back"
          >
            ← Back
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{setlist.name}</h2>
            {setlist.description && (
              <p className="text-gray-400 text-sm truncate">{setlist.description}</p>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <button
              onClick={toggleShortNames}
              className={`px-3 py-2 rounded text-sm touch-manipulation ${
                useShortNames
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title="Toggle between full song titles and short names"
            >
              {useShortNames ? 'Short Names' : 'Full Titles'}
            </button>
            <div className="text-right text-sm">
              <div className="text-white font-medium">
                {songCount} song{songCount !== 1 ? 's' : ''}
                {mcCount > 0 && ` + ${mcCount} MC`}
              </div>
              <div className="text-gray-400">{durationMins}:{String(durationSecs).padStart(2, '0')}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Setlist Items */}
        <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-gray-700 md:max-w-2xl">
          <div className="p-3 bg-gray-800 text-sm text-gray-400 uppercase tracking-wide flex items-center justify-between">
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
              <div className="text-center text-gray-500 py-12">
                <div className="text-4xl mb-3">📋</div>
                <p>Add songs from below</p>
                <p className="text-sm mt-1">Drag to reorder or use arrow buttons</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={setlistItems.map(item => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="divide-y divide-gray-700">
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
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Total Time Footer */}
          {setlistItems.length > 0 && (
            <div className="flex-shrink-0 p-3 bg-gray-900 border-t border-gray-600">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">
                  {songCount} song{songCount !== 1 ? 's' : ''}
                  {mcCount > 0 && ` + ${mcCount} MC`}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">Total:</span>
                  <span className="text-xl font-bold text-emerald-400">
                    {durationMins}:{String(durationSecs).padStart(2, '0')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Available Songs */}
        <div className="flex-1 md:w-80 md:flex-none flex flex-col min-h-[200px] md:min-h-0">
          <div className="p-3 bg-gray-800 space-y-2">
            <input
              type="text"
              placeholder="Search songs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 text-sm"
              aria-label="Search songs"
            />
            <select
              value={songSortBy}
              onChange={(e) => setSongSortBy(e.target.value)}
              className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
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
              <div className="text-center text-gray-500 py-8 text-sm">
                {searchQuery ? 'No matching songs' : 'All songs added'}
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {filteredAvailable.map(song => (
                  <button
                    key={song.id}
                    onClick={() => handleAddSong(song.id)}
                    className="w-full flex items-center gap-2 p-3 hover:bg-gray-800 active:bg-gray-700 text-left min-h-[52px] touch-manipulation"
                  >
                    <span className="text-green-500 text-lg w-8 h-8 flex items-center justify-center">+</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm truncate">{song.title}</div>
                      {song.artist && (
                        <div className="text-gray-400 text-xs truncate">{song.artist}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {song.bpm && (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded">
                          {song.bpm}
                        </span>
                      )}
                      {song.key && (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded">
                          {song.key}
                        </span>
                      )}
                      {song.duration && (
                        <span className="text-xs text-gray-500 w-10 text-right">
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
    </div>
  );
}

export default SetlistBuilder;
