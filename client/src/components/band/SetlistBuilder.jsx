import { useState } from 'react';
import api from '../../services/api';

function SetlistBuilder({ setlist, allSongs, onBack, onUpdate }) {
  const [setlistItems, setSetlistItems] = useState(setlist.songs || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedItem, setDraggedItem] = useState(null);
  const [saving, setSaving] = useState(false);

  const availableSongs = allSongs.filter(
    song => !setlistItems.some(item => item.songId === song.id)
  );

  const filteredAvailable = availableSongs.filter(song => {
    const query = searchQuery.toLowerCase();
    return song.title.toLowerCase().includes(query) ||
      (song.artist && song.artist.toLowerCase().includes(query));
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

  const handleRemoveItem = async (item) => {
    try {
      await api.removeSetlistItem(setlist.id, item.id);
      setSetlistItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDragStart = (e, index) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;

    const newList = [...setlistItems];
    const draggedSong = newList[draggedItem];
    newList.splice(draggedItem, 1);
    newList.splice(index, 0, draggedSong);
    setSetlistItems(newList);
    setDraggedItem(index);
  };

  const handleDragEnd = async () => {
    if (draggedItem === null) return;
    setDraggedItem(null);
    setSaving(true);
    try {
      const itemIds = setlistItems.map(item => item.id);
      await api.reorderSetlistItems(setlist.id, itemIds);
    } catch (err) {
      alert('Failed to save order: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const moveItem = async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= setlistItems.length) return;

    const newList = [...setlistItems];
    const item = newList[index];
    newList.splice(index, 1);
    newList.splice(newIndex, 0, item);
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

  // Calculate total duration including MC sections
  const getItemDuration = (item) => {
    if (item.type === 'MC') {
      return item.duration || 60;
    }
    return item.song?.duration || 0;
  };

  const totalDuration = setlistItems.reduce((acc, item) => acc + getItemDuration(item), 0);
  const durationMins = Math.floor(totalDuration / 60);
  const durationSecs = totalDuration % 60;

  const songCount = setlistItems.filter(i => i.type !== 'MC').length;
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
            className="text-gray-400 hover:text-white"
          >
            ← Back
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">{setlist.name}</h2>
            {setlist.description && (
              <p className="text-gray-400 text-sm">{setlist.description}</p>
            )}
          </div>
          <div className="text-right text-sm">
            <div className="text-white font-medium">
              {songCount} song{songCount !== 1 ? 's' : ''}
              {mcCount > 0 && ` + ${mcCount} MC`}
            </div>
            <div className="text-gray-400">{durationMins}:{String(durationSecs).padStart(2, '0')}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Setlist Items */}
        <div className="flex-1 flex flex-col border-r border-gray-700">
          <div className="p-3 bg-gray-800 text-sm text-gray-400 uppercase tracking-wide flex items-center justify-between">
            <span>Setlist Order {saving && '(saving...)'}</span>
            <button
              onClick={handleAddMC}
              className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 text-white text-xs rounded font-medium"
            >
              + MC Break
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {setlistItems.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                Add songs from the right panel
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {setlistItems.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 p-3 cursor-move ${
                      item.type === 'MC'
                        ? 'bg-yellow-900/30 hover:bg-yellow-900/50'
                        : 'bg-gray-900 hover:bg-gray-800'
                    } ${draggedItem === index ? 'opacity-50' : ''}`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveItem(index, -1)}
                        disabled={index === 0}
                        className="text-gray-500 hover:text-white disabled:opacity-30 text-xs"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveItem(index, 1)}
                        disabled={index === setlistItems.length - 1}
                        className="text-gray-500 hover:text-white disabled:opacity-30 text-xs"
                      >
                        ▼
                      </button>
                    </div>
                    <span className="text-gray-500 w-6 text-right">{index + 1}.</span>

                    {item.type === 'MC' ? (
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
                          <div className="text-white truncate">{item.song?.title}</div>
                          {item.song?.artist && (
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
                      onClick={() => handleRemoveItem(item)}
                      className="text-gray-500 hover:text-red-400 p-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Available Songs */}
        <div className="w-80 flex flex-col">
          <div className="p-3 bg-gray-800">
            <input
              type="text"
              placeholder="Search songs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 text-sm"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
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
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-800 text-left"
                  >
                    <span className="text-green-500 text-lg">+</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm truncate">{song.title}</div>
                      {song.artist && (
                        <div className="text-gray-400 text-xs truncate">{song.artist}</div>
                      )}
                    </div>
                    {song.key && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-900/50 text-purple-300 rounded">
                        {song.key}
                      </span>
                    )}
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
