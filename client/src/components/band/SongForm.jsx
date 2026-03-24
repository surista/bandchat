import { useState, useEffect, useRef } from 'react';
import { isSafeUrl } from '../../utils/urlSafety';
import api from '../../services/api';
import Modal from '../common/Modal';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import LyricsModal from './LyricsModal';

function SongForm({ song, workspaceId, onSave, onClose }) {
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
    lyrics: song?.lyrics || '',
    arrangement: song?.arrangement || '',
    youtubeUrl: song?.youtubeUrl || '',
    spotifyUrl: song?.spotifyUrl || ''
  });
  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const fileInputRef = useRef(null);

  // Load attachments when editing an existing song
  useEffect(() => {
    if (song?.id) {
      loadAttachments();
    }
  }, [song?.id]);

  const loadAttachments = async () => {
    try {
      const data = await api.getSongAttachments(song.id);
      setAttachments(data);
    } catch (err) {
      console.error('Failed to load attachments:', err);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setError('File size must be less than 25MB');
      return;
    }

    setUploading(true);
    setError('');

    try {
      // Two-step: upload file to R2, then register as song attachment
      const uploaded = await api.uploadFile(file, workspaceId);
      const attachment = await api.addSongAttachment(song.id, {
        filename: file.name,
        url: uploaded.url,
        type: file.type || 'file',
        size: file.size,
      });
      setAttachments(prev => [...prev, attachment]);
    } catch (err) {
      setError(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const [deleteAttachmentId, setDeleteAttachmentId] = useState(null);

  // Practice logging
  const toast = useToast();
  const [practiceDuration, setPracticeDuration] = useState('30');
  const [practiceNotes, setPracticeNotes] = useState('');
  const [loggingPractice, setLoggingPractice] = useState(false);

  const handleLogPractice = async () => {
    const dur = parseInt(practiceDuration, 10);
    if (isNaN(dur) || dur < 1 || dur > 480) {
      toast.error('Duration must be between 1 and 480 minutes');
      return;
    }
    setLoggingPractice(true);
    try {
      await api.logPractice(workspaceId, {
        songId: song.id,
        duration: dur,
        notes: practiceNotes.trim() || null,
        practicedAt: new Date().toISOString(),
      });
      toast.success('Practice session logged!');
      setPracticeDuration('30');
      setPracticeNotes('');
    } catch (err) {
      toast.error(err.message || 'Failed to log practice');
    } finally {
      setLoggingPractice(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    try {
      await api.deleteSongAttachment(song.id, attachmentId);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
      setDeleteAttachmentId(null);
    } catch (err) {
      console.error('Failed to delete attachment:', err);
      setDeleteAttachmentId(null);
    }
  };

  const getFileIcon = (type) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📄';
    return '📎';
  };

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
        lyrics: formData.lyrics || null,
        arrangement: formData.arrangement || null,
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
    <>
    <Modal isOpen={true} onClose={onClose} title={song ? 'Edit Song' : 'Add Song'} maxWidth="max-w-lg" className="max-h-modal overflow-y-auto">
        <div className="modal-body">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-[var(--color-border)]">
            {[
              { id: 'details', label: 'Details' },
              { id: 'lyrics', label: 'Lyrics' },
              { id: 'arrangement', label: 'Arrangement' },
              ...(song ? [{ id: 'attachments', label: 'Files' }] : []),
              ...(song ? [{ id: 'practice', label: 'Practice' }] : [])
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'text-blue-400 border-blue-400'
                    : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'
                }`}
              >
                {tab.label}
                {tab.id === 'lyrics' && formData.lyrics && (
                  <span className="ml-1 text-green-400">*</span>
                )}
                {tab.id === 'arrangement' && formData.arrangement && (
                  <span className="ml-1 text-green-400">*</span>
                )}
                {tab.id === 'attachments' && attachments.length > 0 && (
                  <span className="ml-1 text-green-400">({attachments.length})</span>
                )}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            {/* Details Tab */}
            {activeTab === 'details' && (
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
                          : 'bg-[var(--color-modal-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
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
                  rows={3}
                  placeholder="Quick notes about the song"
                />
              </div>
            </div>
            )}

            {/* Lyrics Tab */}
            {activeTab === 'lyrics' && (
            <div>
              <div className="flex items-center justify-between">
                <label className="modal-label">Lyrics / Chord Chart</label>
                {formData.lyrics && (
                  <button
                    type="button"
                    onClick={() => setShowLyricsModal(true)}
                    className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    Full Screen
                  </button>
                )}
              </div>
              <textarea
                value={formData.lyrics}
                onChange={(e) => handleChange('lyrics', e.target.value)}
                className="modal-input font-mono text-sm"
                rows={15}
                placeholder="Paste lyrics or chord chart here...

Example:
[Verse 1]
G        D        Em       C
Amazing grace, how sweet the sound
G        D        G
That saved a wretch like me..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Use monospace formatting for chord alignment
              </p>
            </div>
            )}

            {/* Arrangement Tab */}
            {activeTab === 'arrangement' && (
            <div>
              <label className="modal-label">Custom Arrangement</label>
              <textarea
                value={formData.arrangement}
                onChange={(e) => handleChange('arrangement', e.target.value)}
                className="modal-input"
                rows={12}
                placeholder="Document your band's custom arrangement...

Example:
- Intro: 4 bars guitar only
- Verse 1: Full band, drums light
- Chorus: Big energy, backing vocals
- Solo: 16 bars, trade with keys
- Outro: Fade out, drums last"
              />
              <p className="text-xs text-gray-500 mt-1">
                Note any changes from the original arrangement
              </p>
            </div>
            )}

            {/* Attachments Tab */}
            {activeTab === 'attachments' && song && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="modal-label mb-0">Attachments</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,audio/*,.pdf,.doc,.docx,.gp,.gp3,.gp4,.gp5,.gp6,.gp7,.gpx"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="btn btn-blue text-sm"
                >
                  {uploading ? 'Uploading...' : '+ Add File'}
                </button>
              </div>

              {attachments.length === 0 ? (
                <div className="text-center text-[var(--color-text-muted)] py-8 border border-dashed border-[var(--color-border)] rounded-lg">
                  <p>No attachments yet</p>
                  <p className="text-sm mt-1">Add chord charts, sheet music, audio files, etc.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {attachments.map(attachment => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between bg-[var(--color-bg-tertiary)] rounded-lg p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{getFileIcon(attachment.type)}</span>
                          <div className="min-w-0">
                            <a
                              href={isSafeUrl(attachment.url) ? attachment.url : "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 truncate block"
                            >
                              {attachment.filename}
                            </a>
                            {attachment.size && (
                              <span className="text-xs text-gray-500">
                                {(attachment.size / 1024).toFixed(1)} KB
                              </span>
                            )}
                          </div>
                        </div>
                        {attachment.type?.startsWith('audio') && isSafeUrl(attachment.url) && (
                          <audio src={attachment.url} controls preload="metadata" className="w-full mt-2" style={{ height: 32 }} />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeleteAttachmentId(attachment.id)}
                        className="p-1.5 text-[var(--color-text-muted)] hover:text-red-400"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-3">
                Max file size: 25MB. Supported: images, audio, PDFs, documents, Guitar Pro
              </p>
            </div>
            )}

            {/* Practice Tab */}
            {activeTab === 'practice' && song && (
            <div>
              <label className="modal-label">Log Practice Session</label>
              <p className="text-sm text-[var(--color-text-muted)] mb-4">
                Record that you practiced this song.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="modal-label">Duration (minutes)</label>
                  <input
                    type="number"
                    value={practiceDuration}
                    onChange={(e) => setPracticeDuration(e.target.value)}
                    className="modal-input"
                    placeholder="30"
                    min="1"
                    max="480"
                  />
                </div>
                <div>
                  <label className="modal-label">Notes (optional)</label>
                  <textarea
                    value={practiceNotes}
                    onChange={(e) => setPracticeNotes(e.target.value)}
                    className="modal-input"
                    rows={3}
                    placeholder="How did it go?"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleLogPractice}
                  disabled={loggingPractice || !practiceDuration}
                  className="btn bg-green-600 hover:bg-green-700 text-white w-full"
                >
                  {loggingPractice ? 'Logging...' : 'Log Practice'}
                </button>
              </div>
            </div>
            )}

            <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.title.trim()}
                className="btn bg-green-600 hover:bg-green-700 text-white"
              >
                {loading ? 'Saving...' : song ? 'Update' : 'Add Song'}
              </button>
            </div>
          </form>
        </div>
    </Modal>
      <ConfirmDialog
        isOpen={deleteAttachmentId !== null}
        title="Delete Attachment"
        message="Delete this attachment?"
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDeleteAttachment(deleteAttachmentId)}
        onCancel={() => setDeleteAttachmentId(null)}
      />
      {showLyricsModal && formData.lyrics && (
        <LyricsModal
          lyrics={formData.lyrics}
          songTitle={formData.title || 'Lyrics'}
          duration={formData.durationStr ? (() => {
            const parts = formData.durationStr.split(':');
            if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
            return null;
          })() : null}
          onClose={() => setShowLyricsModal(false)}
        />
      )}
    </>
  );
}

export default SongForm;
