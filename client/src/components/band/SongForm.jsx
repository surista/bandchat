import { useState } from 'react';

function SongForm({ song, onSave, onClose }) {
  const [formData, setFormData] = useState({
    title: song?.title || '',
    artist: song?.artist || '',
    duration: song?.duration || '',
    key: song?.key || '',
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
      await onSave({
        title: formData.title,
        artist: formData.artist || null,
        duration: formData.duration ? parseInt(formData.duration) : null,
        key: formData.key || null,
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

  // Musical keys
  const musicalKeys = [
    'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
    'Am', 'A#m', 'Bbm', 'Bm', 'Cm', 'C#m', 'Dbm', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gbm', 'Gm', 'G#m', 'Abm'
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
                  <select
                    value={formData.key}
                    onChange={(e) => handleChange('key', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  >
                    <option value="">Select</option>
                    {musicalKeys.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
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
                  <label className="block text-gray-700 font-medium mb-1">Duration (sec)</label>
                  <input
                    type="number"
                    value={formData.duration}
                    onChange={(e) => handleChange('duration', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                    placeholder="180"
                    min="0"
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
                className="btn btn-primary"
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
