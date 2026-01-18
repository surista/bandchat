import { useState } from 'react';

function SongForm({ song, onSave, onClose }) {
  // Parse existing key into root and mode
  const parseKey = (key) => {
    if (!key) return { root: '', isMinor: false };
    const isMinor = key.endsWith('m');
    const root = isMinor ? key.slice(0, -1) : key;
    return { root, isMinor };
  };

  // Convert seconds to mm:ss format
  const secondsToTime = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Convert mm:ss to seconds
  const timeToSeconds = (timeStr) => {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0]) || 0;
      const secs = parseInt(parts[1]) || 0;
      return mins * 60 + secs;
    }
    // If just a number, treat as seconds
    return parseInt(timeStr) || null;
  };

  const { root: initialRoot, isMinor: initialIsMinor } = parseKey(song?.key);

  const [formData, setFormData] = useState({
    title: song?.title || '',
    shortName: song?.shortName || '',
    artist: song?.artist || '',
    durationStr: secondsToTime(song?.duration),
    keyRoot: initialRoot,
    keyIsMinor: initialIsMinor,
    bpm: song?.bpm || '',
    notes: song?.notes || '',
    youtubeUrl: song?.youtubeUrl || '',
    spotifyUrl: song?.spotifyUrl || ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Combine key root and mode
      const key = formData.keyRoot
        ? formData.keyRoot + (formData.keyIsMinor ? 'm' : '')
        : null;

      await onSave({
        title: formData.title,
        shortName: formData.shortName || null,
        artist: formData.artist || null,
        duration: timeToSeconds(formData.durationStr),
        key,
        bpm: formData.bpm ? parseInt(formData.bpm) : null,
        notes: formData.notes || null,
        youtubeUrl: formData.youtubeUrl || null,
        spotifyUrl: formData.spotifyUrl || null
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Musical key roots (no minor suffix)
  const keyRoots = [
    'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'
  ];

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="modal-header">
          <h3>{song ? 'Edit Song' : 'Add Song'}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="modal-label">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  className="modal-input"
                  placeholder="Song title"
                  required
                />
              </div>

              <div>
                <label className="modal-label">Short Name</label>
                <input
                  type="text"
                  value={formData.shortName}
                  onChange={(e) => handleChange('shortName', e.target.value)}
                  className="modal-input"
                  placeholder="Abbreviated name for setlists (optional)"
                />
              </div>

              <div>
                <label className="modal-label">Artist</label>
                <input
                  type="text"
                  value={formData.artist}
                  onChange={(e) => handleChange('artist', e.target.value)}
                  className="modal-input"
                  placeholder="Original artist"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="modal-label">Key</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.keyRoot}
                      onChange={(e) => handleChange('keyRoot', e.target.value)}
                      className="modal-input flex-1"
                    >
                      <option value="">-</option>
                      {keyRoots.map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleChange('keyIsMinor', !formData.keyIsMinor)}
                      className={`px-3 py-2 rounded font-medium text-sm transition-colors ${
                        formData.keyIsMinor
                          ? 'bg-purple-600 text-white'
                          : 'bg-[var(--color-modal-border)] text-gray-300 hover:bg-gray-500'
                      }`}
                    >
                      {formData.keyIsMinor ? 'min' : 'Maj'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="modal-label">BPM</label>
                  <input
                    type="number"
                    value={formData.bpm}
                    onChange={(e) => handleChange('bpm', e.target.value)}
                    className="modal-input"
                    placeholder="120"
                    min="20"
                    max="300"
                  />
                </div>

                <div>
                  <label className="modal-label">Duration</label>
                  <input
                    type="text"
                    value={formData.durationStr}
                    onChange={(e) => handleChange('durationStr', e.target.value)}
                    className="modal-input"
                    placeholder="3:30"
                  />
                </div>
              </div>

              <div>
                <label className="modal-label">YouTube URL</label>
                <input
                  type="url"
                  value={formData.youtubeUrl}
                  onChange={(e) => handleChange('youtubeUrl', e.target.value)}
                  className="modal-input"
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>

              <div>
                <label className="modal-label">Spotify URL</label>
                <input
                  type="url"
                  value={formData.spotifyUrl}
                  onChange={(e) => handleChange('spotifyUrl', e.target.value)}
                  className="modal-input"
                  placeholder="https://open.spotify.com/track/..."
                />
              </div>

              <div>
                <label className="modal-label">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  className="modal-input"
                  rows={4}
                  placeholder="Chords, structure, lyrics, etc."
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                {loading ? 'Saving...' : song ? 'Update' : 'Add Song'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default SongForm;
