import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { formatDate } from '../../utils/formatDate';
import { formatDuration } from '../../utils/formatDuration';
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorMessage from '../common/ErrorMessage';
import Modal from '../common/Modal';
import Skeleton from '../common/Skeleton';

export default function RecordingsList({ workspaceId }) {
  const toast = useToast();
  const [recordings, setRecordings] = useState([]);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteRecordingId, setDeleteRecordingId] = useState(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [recordingType, setRecordingType] = useState('audio');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState({ type: '', songId: '' });

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const previewRef = useRef(null);
  const objectUrlRef = useRef(null);
  const isInitialMount = useRef(true);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    songId: ''
  });

  useEffect(() => {
    loadData();
    return () => {
      // Cleanup media stream on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [workspaceId]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    loadRecordings();
  }, [filter]);

  async function loadData() {
    try {
      const [recs, songList] = await Promise.all([
        api.getRecordings(workspaceId),
        api.getSongs(workspaceId)
      ]);
      setRecordings(recs);
      setSongs(songList);
      setError(null);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError(err.message || 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  }

  async function loadRecordings() {
    try {
      const recs = await api.getRecordings(workspaceId, filter);
      setRecordings(recs);
    } catch (error) {
      console.error('Failed to load recordings:', error);
    }
  }

  async function startRecording() {
    try {
      const constraints = recordingType === 'video'
        ? { video: true, audio: true }
        : { audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (previewRef.current && recordingType === 'video') {
        previewRef.current.srcObject = stream;
        previewRef.current.play();
      }

      const mimeType = recordingType === 'video'
        ? 'video/webm;codecs=vp9'
        : 'audio/webm;codecs=opus';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);

        // Show preview
        if (previewRef.current) {
          previewRef.current.srcObject = null;
          objectUrlRef.current = URL.createObjectURL(blob);
          previewRef.current.src = objectUrlRef.current;
        }
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast.error('Could not access microphone/camera. Please check permissions.');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  }

  async function saveRecording() {
    if (!recordedBlob || !formData.title) {
      toast.warning('Please provide a title');
      return;
    }

    setUploading(true);
    try {
      // Upload to Cloudinary via our upload endpoint
      const file = new File([recordedBlob], `recording.${recordingType === 'video' ? 'webm' : 'webm'}`, {
        type: recordedBlob.type
      });

      const uploadResult = await api.uploadFile(file, workspaceId);

      // Create recording record
      await api.createRecording(workspaceId, {
        title: formData.title,
        description: formData.description,
        url: uploadResult.url,
        type: recordingType,
        duration: null, // Could calculate from blob
        songId: formData.songId || null
      });

      await loadRecordings();
      resetRecorder();
    } catch (error) {
      console.error('Failed to save recording:', error);
      toast.error('Failed to save recording');
    } finally {
      setUploading(false);
    }
  }

  function resetRecorder() {
    setShowRecorder(false);
    setRecordedBlob(null);
    setFormData({ title: '', description: '', songId: '' });
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (previewRef.current) {
      previewRef.current.src = '';
      previewRef.current.srcObject = null;
    }
  }

  async function deleteRecording(id) {
    try {
      await api.deleteRecording(id);
      setRecordings(recordings.filter(r => r.id !== id));
      setDeleteRecordingId(null);
    } catch (error) {
      console.error('Failed to delete recording:', error);
      setDeleteRecordingId(null);
    }
  }


  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({length: 3}).map((_, i) => <Skeleton.Card key={i} />)}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Quick Recordings</h2>
        <button
          onClick={() => setShowRecorder(true)}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"
        >
          <span className="text-lg">🎙️</span>
          New Recording
        </button>
      </div>

      {/* Recorder Modal */}
      <Modal
        isOpen={showRecorder}
        onClose={resetRecorder}
        title={recordedBlob ? 'Save Recording' : 'New Recording'}
        maxWidth="max-w-lg"
      >
          <div className="p-6">
            {!recordedBlob ? (
              <>
                {/* Recording Type Selection */}
                <div className="flex gap-4 mb-6">
                  <button
                    onClick={() => setRecordingType('audio')}
                    className={`flex-1 py-3 rounded-lg flex flex-col items-center gap-2 transition ${
                      recordingType === 'audio'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <span className="text-3xl">🎤</span>
                    <span>Audio</span>
                  </button>
                  <button
                    onClick={() => setRecordingType('video')}
                    className={`flex-1 py-3 rounded-lg flex flex-col items-center gap-2 transition ${
                      recordingType === 'video'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <span className="text-3xl">🎬</span>
                    <span>Video</span>
                  </button>
                </div>

                {/* Preview */}
                {recordingType === 'video' && (
                  <video
                    ref={previewRef}
                    className="w-full aspect-video bg-black rounded-lg mb-4"
                    muted
                    playsInline
                  />
                )}

                {recordingType === 'audio' && isRecording && (
                  <div className="w-full h-24 bg-gray-700 rounded-lg mb-4 flex items-center justify-center">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-white">Recording...</span>
                    </div>
                  </div>
                )}

                {/* Record Button */}
                <div className="flex justify-center mb-4">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      className="w-20 h-20 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center transition"
                    >
                      <span className="w-8 h-8 bg-white rounded-full" />
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="w-20 h-20 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center transition"
                    >
                      <span className="w-8 h-8 bg-white rounded" />
                    </button>
                  )}
                </div>

                <p className="text-center text-gray-400 text-sm mb-4">
                  {isRecording ? 'Tap to stop' : 'Tap to record'}
                </p>
              </>
            ) : (
              <>
                {/* Playback Preview */}
                {recordingType === 'video' ? (
                  <video
                    ref={previewRef}
                    className="w-full aspect-video bg-black rounded-lg mb-4"
                    controls
                  />
                ) : (
                  <audio
                    ref={previewRef}
                    className="w-full mb-4"
                    controls
                  />
                )}

                {/* Save Form */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Title *</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                      className="w-full bg-gray-700 text-white rounded px-3 py-2"
                      placeholder="e.g., Guitar riff idea, New chorus demo"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Link to Song (optional)</label>
                    <select
                      value={formData.songId}
                      onChange={e => setFormData({ ...formData, songId: e.target.value })}
                      className="w-full bg-gray-700 text-white rounded px-3 py-2"
                    >
                      <option value="">No linked song</option>
                      {songs.map(song => (
                        <option key={song.id} value={song.id}>
                          {song.title} {song.artist && `- ${song.artist}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Notes</label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      className="w-full bg-gray-700 text-white rounded px-3 py-2"
                      placeholder="Any notes about this recording..."
                      rows={2}
                    />
                  </div>
                </div>
              </>
            )}

          </div>
            {/* Actions */}
            <div className="flex gap-2 px-6 pb-6">
              {recordedBlob && (
                <>
                  <button
                    onClick={saveRecording}
                    disabled={uploading || !formData.title}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setRecordedBlob(null)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
                  >
                    Re-record
                  </button>
                </>
              )}
              <button
                onClick={resetRecorder}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
              >
                Cancel
              </button>
            </div>
      </Modal>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={filter.type}
          onChange={e => setFilter({ ...filter, type: e.target.value })}
          className="bg-gray-800 text-white rounded px-3 py-2"
        >
          <option value="">All Types</option>
          <option value="audio">Audio</option>
          <option value="video">Video</option>
        </select>
        <select
          value={filter.songId}
          onChange={e => setFilter({ ...filter, songId: e.target.value })}
          className="bg-gray-800 text-white rounded px-3 py-2"
        >
          <option value="">All Songs</option>
          {songs.map(song => (
            <option key={song.id} value={song.id}>
              {song.title}
            </option>
          ))}
        </select>
      </div>

      {/* Error State */}
      {error && !loading && recordings.length === 0 && (
        <ErrorMessage
          message={error}
          onRetry={loadData}
          className="py-16"
        />
      )}

      {/* Recordings Grid */}
      {!error && recordings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-4">🎙️</div>
          <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
            No recordings yet
          </h3>
          <p className="text-[var(--color-text-muted)] max-w-sm mb-4">
            Capture song ideas, demos, rehearsal takes, or live recordings to share with your band.
          </p>
          <button
            onClick={() => setShowRecorder(true)}
            className="btn bg-green-600 hover:bg-green-700 text-white"
          >
            + Add Recording
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recordings.map(recording => (
            <div key={recording.id} className="bg-gray-800 rounded-lg overflow-hidden">
              {recording.type === 'video' ? (
                <video
                  src={recording.url}
                  className="w-full aspect-video bg-black"
                  controls
                  preload="metadata"
                />
              ) : (
                <div className="w-full aspect-video bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
                  <span className="text-6xl">🎵</span>
                </div>
              )}
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-white">{recording.title}</h3>
                    {recording.song && (
                      <p className="text-sm text-blue-400">
                        Linked to: {recording.song.title}
                      </p>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    recording.type === 'video' ? 'bg-purple-600' : 'bg-blue-600'
                  } text-white`}>
                    {recording.type}
                  </span>
                </div>
                {recording.description && (
                  <p className="text-sm text-gray-400 mt-2">{recording.description}</p>
                )}
                {recording.type === 'audio' && (
                  <audio src={recording.url} className="w-full mt-3" controls preload="metadata" />
                )}
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-700">
                  <div className="text-xs text-gray-500">
                    <span>{recording.createdBy?.displayName || recording.removedCreatorName || 'Deleted User'}</span>
                    <span className="mx-2">·</span>
                    <span>{formatDate(recording.createdAt)}</span>
                  </div>
                  <button
                    onClick={() => setDeleteRecordingId(recording.id)}
                    className="text-gray-400 hover:text-red-400 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteRecordingId !== null}
        title="Delete Recording"
        message="Delete this recording?"
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => deleteRecording(deleteRecordingId)}
        onCancel={() => setDeleteRecordingId(null)}
      />
    </div>
  );
}
