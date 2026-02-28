import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../services/api';

export default function AudioAnalyzer({ workspaceId }) {
  const [essentia, setEssentia] = useState(null);
  const [essentiaLoading, setEssentiaLoading] = useState(true);
  const [essentiaError, setEssentiaError] = useState(null);
  const [file, setFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [songs, setSongs] = useState([]);
  const [selectedSongId, setSelectedSongId] = useState('');
  const [applyStatus, setApplyStatus] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Load Essentia WASM
  useEffect(() => {
    let cancelled = false;
    async function loadEssentia() {
      try {
        const [{ default: Essentia }, { EssentiaWASM }] = await Promise.all([
          import('essentia.js/dist/essentia.js-core.es.js'),
          import('essentia.js/dist/essentia-wasm.es.js')
        ]);
        // EssentiaWASM is an Emscripten module - pass directly to constructor
        if (!cancelled) {
          setEssentia(new Essentia(EssentiaWASM));
          setEssentiaLoading(false);
        }
      } catch (err) {
        console.error('Failed to load Essentia:', err);
        if (!cancelled) {
          setEssentiaError('Failed to load audio analysis engine');
          setEssentiaLoading(false);
        }
      }
    }
    loadEssentia();
    return () => { cancelled = true; };
  }, []);

  // Load songs for "Apply to Song" dropdown
  useEffect(() => {
    api.getSongs(workspaceId).then(setSongs).catch(err => console.warn('Failed to load songs:', err.message));
  }, [workspaceId]);

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const analyzeFile = useCallback(async (audioFile) => {
    if (!essentia) return;

    setFile(audioFile);
    setAnalyzing(true);
    setResults(null);
    setError(null);
    setApplyStatus(null);

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Get mono channel data
      const audioData = audioBuffer.getChannelData(0);
      const audioVector = essentia.arrayToVector(audioData);

      // Run analysis
      const bpmResult = essentia.PercivalBpmEstimator(audioVector);
      const keyResult = essentia.KeyExtractor(audioVector);
      const duration = audioBuffer.duration;

      // Format key as "Cm", "F#", etc.
      const keyStr = keyResult.key + (keyResult.scale === 'minor' ? 'm' : '');

      setResults({
        bpm: Math.round(bpmResult.bpm),
        key: keyStr,
        keyRoot: keyResult.key,
        scale: keyResult.scale,
        keyStrength: keyResult.strength,
        duration: Math.round(duration),
        durationFormatted: formatDuration(duration),
        filename: audioFile.name
      });

      audioContext.close();
    } catch (err) {
      console.error('Analysis error:', err);
      setError('Failed to analyze audio file. Make sure it\'s a valid audio format.');
    } finally {
      setAnalyzing(false);
    }
  }, [essentia]);

  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    if (f) analyzeFile(f);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('audio/')) {
      analyzeFile(f);
    } else {
      setError('Please drop an audio file');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleApply = async () => {
    if (!selectedSongId || !results) return;
    setApplyStatus('saving');
    try {
      await api.updateSong(selectedSongId, {
        bpm: results.bpm,
        key: results.key,
        duration: results.duration
      });
      setApplyStatus('saved');
      setTimeout(() => setApplyStatus(null), 3000);
    } catch (err) {
      console.error('Failed to update song:', err);
      setApplyStatus('error');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="h-14 border-b border-gray-700 px-4 flex items-center">
        <h2 className="text-white font-semibold">Audio Analyzer</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Essentia loading state */}
        {essentiaLoading && (
          <div className="text-center py-12 text-gray-400">
            <div className="animate-spin w-8 h-8 border-2 border-gray-500 border-t-white rounded-full mx-auto mb-3" />
            Loading audio analysis engine...
          </div>
        )}

        {essentiaError && (
          <div className="text-center py-12 text-red-400">{essentiaError}</div>
        )}

        {!essentiaLoading && !essentiaError && (
          <>
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragging
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <p className="text-gray-300 font-medium">
                {analyzing ? 'Analyzing...' : 'Drop an audio file here or click to browse'}
              </p>
              <p className="text-gray-500 text-sm mt-1">
                MP3, WAV, FLAC, OGG, M4A, AAC
              </p>
            </div>

            {/* Analyzing spinner */}
            {analyzing && (
              <div className="text-center py-4">
                <div className="animate-spin w-8 h-8 border-2 border-gray-500 border-t-white rounded-full mx-auto mb-3" />
                <p className="text-gray-400">Analyzing <span className="text-white">{file?.name}</span>...</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Results */}
            {results && (
              <div className="space-y-4">
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-3">
                    Results for <span className="text-white">{results.filename}</span>
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-800 rounded-lg p-4 text-center">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">BPM</p>
                      <p className="text-3xl font-bold text-white">{results.bpm}</p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-4 text-center">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Key</p>
                      <p className="text-3xl font-bold text-white">{results.key}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {Math.round(results.keyStrength * 100)}% confidence
                      </p>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-4 text-center">
                      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Duration</p>
                      <p className="text-3xl font-bold text-white">{results.durationFormatted}</p>
                    </div>
                  </div>
                </div>

                {/* Apply to song */}
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <p className="text-gray-300 text-sm font-medium mb-2">Apply to existing song</p>
                  <div className="flex gap-2">
                    <select
                      value={selectedSongId}
                      onChange={(e) => setSelectedSongId(e.target.value)}
                      className="flex-1 bg-gray-800 text-white rounded px-3 py-2 border border-gray-600 text-sm"
                    >
                      <option value="">Select a song...</option>
                      {songs
                        .sort((a, b) => a.title.localeCompare(b.title))
                        .map(song => (
                          <option key={song.id} value={song.id}>
                            {song.title}{song.artist ? ` - ${song.artist}` : ''}
                          </option>
                        ))
                      }
                    </select>
                    <button
                      onClick={handleApply}
                      disabled={!selectedSongId || applyStatus === 'saving'}
                      className="bg-slack-green text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {applyStatus === 'saving' ? 'Saving...' : applyStatus === 'saved' ? 'Saved!' : 'Apply'}
                    </button>
                  </div>
                  {applyStatus === 'saved' && (
                    <p className="text-green-400 text-xs mt-2">BPM, key, and duration updated.</p>
                  )}
                  {applyStatus === 'error' && (
                    <p className="text-red-400 text-xs mt-2">Failed to update song.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
