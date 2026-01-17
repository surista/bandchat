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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            {song ? 'Edit Song' : 'Add Song'}
          </h3>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="Song title"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Short Name</label>
                <input
                  type="text"
                  value={formData.shortName}
                  onChange={(e) => handleChange('shortName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="Abbreviated name for setlists (optional)"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Artist</label>
                <input
                  type="text"
                  value={formData.artist}
                  onChange={(e) => handleChange('artist', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="Original artist"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Key</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.keyRoot}
                      onChange={(e) => handleChange('keyRoot', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded text-gray-900"
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
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {formData.keyIsMinor ? 'min' : 'Maj'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">BPM</label>
                  <input
                    type="number"
                    value={formData.bpm}
                    onChange={(e) => handleChange('bpm', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                    placeholder="120"
                    min="20"
                    max="300"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">Duration</label>
                  <input
                    type="text"
                    value={formData.durationStr}
                    onChange={(e) => handleChange('durationStr', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                    placeholder="3:30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">YouTube URL</label>
                <input
                  type="url"
                  value={formData.youtubeUrl}
                  onChange={(e) => handleChange('youtubeUrl', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Spotify URL</label>
                <input
                  type="url"
                  value={formData.spotifyUrl}
                  onChange={(e) => handleChange('spotifyUrl', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="https://open.spotify.com/track/..."
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
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
                className="btn bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-300 disabled:text-gray-500"
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
