import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatDuration } from '../../utils/formatDuration';
import Modal from '../common/Modal';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorMessage from '../common/ErrorMessage';
import Skeleton from '../common/Skeleton';

function MedleyList({ workspaceId }) {
  const [medleys, setMedleys] = useState([]);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingMedley, setEditingMedley] = useState(null);
  const [deleteMedleyId, setDeleteMedleyId] = useState(null);

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  const loadData = async () => {
    try {
      const [medleysData, songsData] = await Promise.all([
        api.getMedleys(workspaceId),
        api.getSongs(workspaceId)
      ]);
      setMedleys(medleysData);
      setSongs(songsData);
      setError(null);
    } catch (err) {
      console.error('Failed to load medleys:', err);
      setError(err.message || 'Failed to load medleys');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data) => {
    try {
      if (editingMedley) {
        const updated = await api.updateMedley(editingMedley.id, data);
        setMedleys(prev => prev.map(m => m.id === updated.id ? updated : m));
      } else {
        const created = await api.createMedley(workspaceId, data);
        setMedleys(prev => [...prev, created]);
      }
      setShowForm(false);
      setEditingMedley(null);
    } catch (err) {
      throw new Error(err.message || 'Failed to save medley');
    }
  };

  const handleDelete = async (medleyId) => {
    try {
      await api.deleteMedley(medleyId);
      setMedleys(prev => prev.filter(m => m.id !== medleyId));
      setDeleteMedleyId(null);
    } catch (err) {
      console.error('Failed to delete medley:', err);
      setDeleteMedleyId(null);
    }
  };

  const handleReorder = async (medleyId, songIds) => {
    try {
      const updated = await api.reorderMedley(medleyId, songIds);
      setMedleys(prev => prev.map(m => m.id === updated.id ? updated : m));
    } catch (err) {
      console.error('Failed to reorder medley:', err);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({length: 3}).map((_, i) => <Skeleton.Card key={i} />)}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-900 min-h-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Medleys</h2>
            <p className="text-sm text-gray-400 mt-1">
              Group songs to play seamlessly together
            </p>
          </div>
          <button
            onClick={() => { setEditingMedley(null); setShowForm(true); }}
            className="btn bg-green-600 hover:bg-green-700 text-white"
          >
            + Create Medley
          </button>
        </div>
      </div>

      {/* Medleys List */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && !loading && medleys.length === 0 ? (
          <ErrorMessage
            message={error}
            onRetry={loadData}
            className="py-16"
          />
        ) : medleys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4">🎶</div>
            <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
              No medleys yet
            </h3>
            <p className="text-[var(--color-text-muted)] max-w-sm mb-4">
              Group songs that flow together into medleys. Great for mashups or sets that blend seamlessly.
            </p>
            <button
              onClick={() => { setEditingMedley(null); setShowForm(true); }}
              className="btn bg-green-600 hover:bg-green-700 text-white"
            >
              + Create Medley
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {medleys.map(medley => (
              <MedleyCard
                key={medley.id}
                medley={medley}
                onEdit={() => { setEditingMedley(medley); setShowForm(true); }}
                onDelete={() => setDeleteMedleyId(medley.id)}
                onReorder={(songIds) => handleReorder(medley.id, songIds)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Medley Form Modal */}
      {showForm && (
        <MedleyForm
          medley={editingMedley}
          songs={songs}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingMedley(null); }}
        />
      )}

      <ConfirmDialog
        isOpen={deleteMedleyId !== null}
        title="Delete Medley"
        message="Delete this medley?"
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDelete(deleteMedleyId)}
        onCancel={() => setDeleteMedleyId(null)}
      />
    </div>
  );
}

function MedleyCard({ medley, onEdit, onDelete, onReorder }) {
  const [expanded, setExpanded] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [localSongs, setLocalSongs] = useState(null);

  const totalDuration = medley.songs?.reduce((sum, ms) => sum + (ms.song?.duration || 0), 0) || 0;

  const handleDragStart = (e, index) => {
    if (!localSongs) {
      setLocalSongs(medley.songs);
    }
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const currentSongs = localSongs || medley.songs;
    const newSongs = [...currentSongs];
    const [dragged] = newSongs.splice(draggedIndex, 1);
    newSongs.splice(index, 0, dragged);

    // Update the order locally for visual feedback
    setLocalSongs(newSongs);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null) {
      const songsToUse = localSongs || medley.songs;
      const songIds = songsToUse.map(ms => ms.songId);
      onReorder(songIds);
    }
    setDraggedIndex(null);
    setLocalSongs(null);
  };

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-750"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎵</span>
            <div>
              <h4 className="font-medium text-white">{medley.name}</h4>
              {medley.description && (
                <p className="text-sm text-gray-400">{medley.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <div className="text-gray-300">{medley.songs?.length || 0} songs</div>
              {totalDuration > 0 && (
                <div className="text-gray-500">{formatDuration(totalDuration)}</div>
              )}
            </div>
            <div className="flex gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Song List (expanded) */}
      {expanded && (
        <div className="border-t border-gray-700 p-4">
          {medley.songs?.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-2">No songs in this medley</p>
          ) : (
            <div className="space-y-1">
              {(localSongs || medley.songs)?.map((medleySong, index) => (
                <div
                  key={medleySong.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 p-2 rounded cursor-move hover:bg-gray-700 ${
                    draggedIndex === index ? 'opacity-50 bg-gray-700' : ''
                  }`}
                >
                  <span className="text-gray-500 w-6 text-center">{index + 1}</span>
                  <div className="flex-1">
                    <span className="text-gray-200">{medleySong.song?.title}</span>
                    {medleySong.song?.artist && (
                      <span className="text-gray-500 ml-2">- {medleySong.song.artist}</span>
                    )}
                  </div>
                  {medleySong.song?.key && (
                    <span className="text-sm text-purple-400">{medleySong.song.key}</span>
                  )}
                  {medleySong.song?.duration && (
                    <span className="text-sm text-gray-500">{formatDuration(medleySong.song.duration)}</span>
                  )}
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-3">Drag to reorder songs</p>
        </div>
      )}
    </div>
  );
}

function MedleyForm({ medley, songs, onSave, onClose }) {
  const [formData, setFormData] = useState({
    name: medley?.name || '',
    description: medley?.description || '',
    songIds: medley?.songs?.map(ms => ms.songId) || []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const availableSongs = songs.filter(s => !formData.songIds.includes(s.id));
  const selectedSongs = formData.songIds
    .map(id => songs.find(s => s.id === id))
    .filter(Boolean);

  const handleAddSong = (songId) => {
    setFormData(prev => ({
      ...prev,
      songIds: [...prev.songIds, songId]
    }));
  };

  const handleRemoveSong = (songId) => {
    setFormData(prev => ({
      ...prev,
      songIds: prev.songIds.filter(id => id !== songId)
    }));
  };

  const handleMoveSong = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= formData.songIds.length) return;

    const newSongIds = [...formData.songIds];
    [newSongIds[index], newSongIds[newIndex]] = [newSongIds[newIndex], newSongIds[index]];
    setFormData(prev => ({ ...prev, songIds: newSongIds }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.songIds.length < 2) {
      setError('A medley must have at least 2 songs');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onSave(formData);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={medley ? 'Edit Medley' : 'Create Medley'} maxWidth="max-w-2xl" className="max-h-modal overflow-y-auto">
        <div className="modal-body">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="modal-label">Medley Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="modal-input"
                placeholder="e.g., Opening Medley, Beatles Tribute"
                required
              />
            </div>

            <div>
              <label className="modal-label">Description (optional)</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="modal-input"
                placeholder="Notes about this medley..."
              />
            </div>

            {/* Selected Songs */}
            <div>
              <label className="modal-label">
                Songs in Medley ({selectedSongs.length})
                {selectedSongs.length < 2 && (
                  <span className="text-yellow-400 ml-2">Add at least 2 songs</span>
                )}
              </label>
              {selectedSongs.length === 0 ? (
                <div className="text-gray-500 text-sm py-4 text-center border border-dashed border-gray-600 rounded-lg">
                  No songs selected. Add songs from the list below.
                </div>
              ) : (
                <div className="space-y-1 mb-2">
                  {selectedSongs.map((song, index) => (
                    <div
                      key={song.id}
                      className="flex items-center gap-2 bg-gray-700 rounded p-2"
                    >
                      <span className="text-gray-400 w-6 text-center text-sm">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-200 truncate">{song.title}</span>
                        {song.artist && (
                          <span className="text-gray-500 ml-2 text-sm">- {song.artist}</span>
                        )}
                      </div>
                      {song.key && (
                        <span className="text-xs text-purple-400 px-1.5 py-0.5 bg-purple-900/50 rounded">
                          {song.key}
                        </span>
                      )}
                      {song.duration && (
                        <span className="text-xs text-gray-500">{formatDuration(song.duration)}</span>
                      )}
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveSong(index, -1)}
                          disabled={index === 0}
                          className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSong(index, 1)}
                          disabled={index === selectedSongs.length - 1}
                          className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSong(song.id)}
                          className="p-1 text-gray-400 hover:text-red-400"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Available Songs */}
            <div>
              <label className="modal-label">Available Songs ({availableSongs.length})</label>
              {availableSongs.length === 0 ? (
                <div className="text-gray-500 text-sm py-4 text-center">
                  All songs have been added to this medley
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-gray-700 rounded-lg">
                  {availableSongs.map(song => (
                    <button
                      key={song.id}
                      type="button"
                      onClick={() => handleAddSong(song.id)}
                      className="w-full flex items-center gap-2 p-2 hover:bg-gray-700 text-left border-b border-gray-700 last:border-b-0"
                    >
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-200">{song.title}</span>
                        {song.artist && (
                          <span className="text-gray-500 ml-2 text-sm">- {song.artist}</span>
                        )}
                      </div>
                      {song.key && (
                        <span className="text-xs text-purple-400">{song.key}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t border-gray-700">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.name.trim() || formData.songIds.length < 2}
                className="btn bg-green-600 hover:bg-green-700 text-white"
              >
                {loading ? 'Saving...' : medley ? 'Update Medley' : 'Create Medley'}
              </button>
            </div>
          </form>
        </div>
    </Modal>
  );
}

export default MedleyList;
