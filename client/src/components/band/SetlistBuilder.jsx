import { useState, useEffect } from 'react';
import api from '../../services/api';

function SetlistBuilder({ setlist, allSongs, onBack, onUpdate }) {
  const [setlistSongs, setSetlistSongs] = useState(setlist.songs || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedItem, setDraggedItem] = useState(null);
  const [saving, setSaving] = useState(false);

  const availableSongs = allSongs.filter(
    song => !setlistSongs.some(ss => ss.songId === song.id)
  );

  const filteredAvailable = availableSongs.filter(song => {
    const query = searchQuery.toLowerCase();
    return song.title.toLowerCase().includes(query) ||
      (song.artist && song.artist.toLowerCase().includes(query));
  });

  const handleAddSong = async (songId) => {
    try {
      const result = await api.addSongToSetlist(setlist.id, songId);
      setSetlistSongs(prev => [...prev, result]);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemoveSong = async (songId) => {
    try {
      await api.removeSongFromSetlist(setlist.id, songId);
      setSetlistSongs(prev => prev.filter(ss => ss.songId !== songId));
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

    const newList = [...setlistSongs];
    const draggedSong = newList[draggedItem];
    newList.splice(draggedItem, 1);
    newList.splice(index, 0, draggedSong);
    setSetlistSongs(newList);
    setDraggedItem(index);
  };

  const handleDragEnd = async () => {
    if (draggedItem === null) return;
    setDraggedItem(null);
    setSaving(true);
    try {
      const songIds = setlistSongs.map(ss => ss.songId);
      await api.reorderSetlistSongs(setlist.id, songIds);
    } catch (err) {
      alert('Failed to save order: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const moveItem = async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= setlistSongs.length) return;

    const newList = [...setlistSongs];
    const item = newList[index];
    newList.splice(index, 1);
    newList.splice(newIndex, 0, item);
    setSetlistSongs(newList);

    setSaving(true);
    try {
      const songIds = newList.map(ss => ss.songId);
      await api.reorderSetlistSongs(setlist.id, songIds);
    } catch (err) {
      alert('Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  const totalDuration = setlistSongs.reduce((acc, ss) => acc + (ss.song?.duration || 0), 0);
  const durationMins = Math.floor(totalDuration / 60);
  const durationSecs = totalDuration % 60;

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
            <div className="text-white font-medium">{setlistSongs.length} songs</div>
            <div className="text-gray-400">{durationMins}:{String(durationSecs).padStart(2, '0')}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Setlist Songs */}
        <div className="flex-1 flex flex-col border-r border-gray-700">
          <div className="p-3 bg-gray-800 text-sm text-gray-400 uppercase tracking-wide">
            Setlist Order {saving && '(saving...)'}
          </div>
          <div className="flex-1 overflow-y-auto">
            {setlistSongs.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                Add songs from the right panel
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {setlistSongs.map((ss, index) => (
                  <div
                    key={ss.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 p-3 bg-gray-900 hover:bg-gray-800 cursor-move ${
                      draggedItem === index ? 'opacity-50' : ''
                    }`}
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
                        disabled={index === setlistSongs.length - 1}
                        className="text-gray-500 hover:text-white disabled:opacity-30 text-xs"
                      >
                        ▼
                      </button>
                    </div>
                    <span className="text-gray-500 w-6 text-right">{index + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-white truncate">{ss.song?.title}</div>
                      {ss.song?.artist && (
                        <div className="text-gray-400 text-sm truncate">{ss.song.artist}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {ss.song?.key && <span className="px-1.5 py-0.5 bg-purple-900/50 rounded">{ss.song.key}</span>}
                      {ss.song?.duration && (
                        <span>{Math.floor(ss.song.duration / 60)}:{String(ss.song.duration % 60).padStart(2, '0')}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveSong(ss.songId)}
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
