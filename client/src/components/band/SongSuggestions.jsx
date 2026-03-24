import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../common/Skeleton';

export default function SongSuggestions({ workspaceId }) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('recommendations');
  const [songs, setSongs] = useState([]);
  const [recommendations, setRecommendations] = useState(null);
  const [selectedSong, setSelectedSong] = useState(null);
  const [mashups, setMashups] = useState(null);
  const [transitions, setTransitions] = useState(null);
  const [optimizedSetlist, setOptimizedSetlist] = useState(null);
  const [selectedSongIds, setSelectedSongIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMashups, setLoadingMashups] = useState(false);
  const [loadingTransitions, setLoadingTransitions] = useState(false);

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  async function loadData() {
    try {
      const [songList, recs] = await Promise.all([
        api.getSongs(workspaceId),
        api.getSongRecommendations(workspaceId)
      ]);
      setSongs(songList);
      setRecommendations(recs);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMashups(songId) {
    setLoadingMashups(true);
    setSelectedSong(songs.find(s => s.id === songId));
    try {
      const data = await api.getMashupSuggestions(workspaceId, songId);
      setMashups(data);
    } catch (error) {
      console.error('Failed to load mashups:', error);
    } finally {
      setLoadingMashups(false);
    }
  }

  async function loadTransitions() {
    setLoadingTransitions(true);
    try {
      const data = await api.getTransitions(workspaceId, 40);
      setTransitions(data);
    } catch (error) {
      console.error('Failed to load transitions:', error);
    } finally {
      setLoadingTransitions(false);
    }
  }

  async function optimizeSelectedSongs() {
    if (selectedSongIds.length < 2) {
      toast.warning('Select at least 2 songs to optimize');
      return;
    }
    try {
      const result = await api.optimizeSetlist(workspaceId, selectedSongIds);
      setOptimizedSetlist(result);
    } catch (error) {
      console.error('Failed to optimize setlist:', error);
    }
  }

  function toggleSongSelection(songId) {
    setSelectedSongIds(prev =>
      prev.includes(songId)
        ? prev.filter(id => id !== songId)
        : [...prev, songId]
    );
  }

  function getScoreColor(score) {
    if (score >= 70) return 'text-green-400';
    if (score >= 50) return 'text-yellow-400';
    if (score >= 30) return 'text-orange-400';
    return 'text-red-400';
  }

  function getScoreBg(score) {
    if (score >= 70) return 'bg-green-600';
    if (score >= 50) return 'bg-yellow-600';
    if (score >= 30) return 'bg-orange-600';
    return 'bg-red-600';
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({length: 3}).map((_, i) => <Skeleton.Card key={i} />)}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-primary)]">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6">Song Intelligence</h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[var(--color-border)] overflow-x-auto">
        <button
          onClick={() => setActiveTab('recommendations')}
          className={`px-4 py-2 -mb-px whitespace-nowrap ${activeTab === 'recommendations' ? 'border-b-2 border-blue-500 text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}
        >
          Recommendations
        </button>
        <button
          onClick={() => setActiveTab('mashups')}
          className={`px-4 py-2 -mb-px whitespace-nowrap ${activeTab === 'mashups' ? 'border-b-2 border-blue-500 text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}
        >
          Mashup Builder
        </button>
        <button
          onClick={() => { setActiveTab('transitions'); loadTransitions(); }}
          className={`px-4 py-2 -mb-px whitespace-nowrap ${activeTab === 'transitions' ? 'border-b-2 border-blue-500 text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}
        >
          All Transitions
        </button>
        <button
          onClick={() => setActiveTab('optimizer')}
          className={`px-4 py-2 -mb-px whitespace-nowrap ${activeTab === 'optimizer' ? 'border-b-2 border-blue-500 text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}
        >
          Setlist Optimizer
        </button>
      </div>

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && recommendations && (
        <div className="space-y-6">
          {/* Analysis Summary */}
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Your Repertoire Analysis</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{recommendations.analysis.totalSongs}</p>
                <p className="text-sm text-gray-400">Songs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{recommendations.analysis.uniqueArtists}</p>
                <p className="text-sm text-gray-400">Artists</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">{recommendations.analysis.averageBpm || '-'}</p>
                <p className="text-sm text-gray-400">Avg BPM</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[var(--color-text-primary)]">
                  {recommendations.analysis.topKeys[0]?.[0] || '-'}
                </p>
                <p className="text-sm text-gray-400">Top Key</p>
              </div>
            </div>

            {/* Tempo Distribution */}
            <div className="mt-4">
              <p className="text-sm text-gray-400 mb-2">Tempo Distribution</p>
              <div className="flex gap-1 h-6">
                {Object.entries(recommendations.analysis.tempoDistribution).map(([tempo, count]) => (
                  <div
                    key={tempo}
                    className="bg-blue-600 rounded"
                    style={{
                      flex: count || 0.1,
                      opacity: count > 0 ? 1 : 0.2
                    }}
                    title={`${tempo}: ${count} songs`}
                  />
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Very Slow</span>
                <span>Slow</span>
                <span>Medium</span>
                <span>Fast</span>
                <span>Very Fast</span>
              </div>
            </div>

            {/* Top Artists */}
            {recommendations.analysis.topArtists.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-gray-400 mb-2">Top Artists</p>
                <div className="flex flex-wrap gap-2">
                  {recommendations.analysis.topArtists.map(([artist, count]) => (
                    <span key={artist} className="px-2 py-1 bg-[var(--color-bg-tertiary)] rounded text-sm text-[var(--color-text-primary)]">
                      {artist} ({count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recommendations */}
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Suggestions</h3>
            {recommendations.recommendations.length === 0 ? (
              <p className="text-gray-400">Add more songs to get personalized recommendations!</p>
            ) : (
              <div className="space-y-3">
                {recommendations.recommendations.map((rec, idx) => (
                  <div key={idx} className="bg-[var(--color-bg-secondary)] rounded-lg p-4 flex items-start gap-4">
                    <div className={`px-2 py-1 rounded text-xs uppercase ${
                      rec.priority === 'high' ? 'bg-red-600' :
                      rec.priority === 'medium' ? 'bg-yellow-600' : 'bg-gray-600'
                    } text-white`}>
                      {rec.type}
                    </div>
                    <div className="flex-1">
                      <p className="text-[var(--color-text-primary)] font-medium">{rec.suggestion}</p>
                      <p className="text-sm text-gray-400 mt-1">{rec.reason}</p>
                    </div>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(rec.searchTerm + ' cover songs')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-blue text-sm"
                    >
                      Search
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mashups Tab */}
      {activeTab === 'mashups' && (
        <div className="space-y-6">
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
            <label className="block text-sm text-gray-400 mb-2">Select a song to find compatible matches</label>
            <select
              value={selectedSong?.id || ''}
              onChange={e => loadMashups(e.target.value)}
              className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded px-3 py-2"
            >
              <option value="">Choose a song...</option>
              {songs.filter(s => s.key || s.bpm).map(song => (
                <option key={song.id} value={song.id}>
                  {song.title} {song.artist && `- ${song.artist}`}
                  {song.key && ` [${song.key}]`}
                  {song.bpm && ` ${song.bpm} BPM`}
                </option>
              ))}
            </select>
          </div>

          {loadingMashups && <p className="text-gray-400">Finding compatible songs...</p>}

          {mashups && !loadingMashups && (
            <div>
              <div className="mb-4 p-4 bg-blue-900/30 rounded-lg">
                <h4 className="text-[var(--color-text-primary)] font-semibold">
                  {mashups.sourceSong.title}
                  {mashups.sourceSong.artist && ` - ${mashups.sourceSong.artist}`}
                </h4>
                <p className="text-sm text-gray-400">
                  Key: {mashups.sourceSong.key || 'Unknown'} | BPM: {mashups.sourceSong.bpm || 'Unknown'}
                </p>
              </div>

              {mashups.suggestions.length === 0 ? (
                <p className="text-gray-400">No compatible songs found. Try adding key/BPM data to more songs.</p>
              ) : (
                <div className="space-y-2">
                  {mashups.suggestions.map(item => (
                    <div key={item.song.id} className="bg-[var(--color-bg-secondary)] rounded-lg p-4 flex items-center gap-4">
                      <div className="w-16 text-center">
                        <div className={`text-2xl font-bold ${getScoreColor(item.score)}`}>
                          {item.score}
                        </div>
                        <div className="text-xs text-gray-500">score</div>
                      </div>
                      <div className="flex-1">
                        <p className="text-[var(--color-text-primary)] font-medium">
                          {item.song.title}
                          {item.song.artist && ` - ${item.song.artist}`}
                        </p>
                        <div className="flex gap-4 mt-1 text-sm text-gray-400">
                          <span>Key: {item.song.key || '?'}</span>
                          <span>BPM: {item.song.bpm || '?'}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {item.factors.map((factor, idx) => (
                            <span
                              key={idx}
                              className={`px-2 py-0.5 rounded text-xs ${
                                factor.score >= 30 ? 'bg-green-900 text-green-300' :
                                factor.score >= 15 ? 'bg-yellow-900 text-yellow-300' :
                                'bg-gray-700 text-gray-400'
                              }`}
                            >
                              {factor.reason}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="w-24">
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getScoreBg(item.score)}`}
                            style={{ width: `${item.score}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Transitions Tab */}
      {activeTab === 'transitions' && loadingTransitions && (
        <div className="space-y-4">
          {Array.from({length: 3}).map((_, i) => <Skeleton.Card key={i} />)}
        </div>
      )}
      {activeTab === 'transitions' && !loadingTransitions && transitions && (
        <div>
          <p className="text-gray-400 mb-4">
            Found {transitions.count} compatible transitions. Showing top matches:
          </p>
          <div className="space-y-2">
            {transitions.transitions.map((t, idx) => (
              <div key={idx} className="bg-[var(--color-bg-secondary)] rounded-lg p-3 flex items-center gap-4">
                <div className={`text-xl font-bold ${getScoreColor(t.score)}`}>
                  {t.score}
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1">
                    <p className="text-[var(--color-text-primary)] text-sm">{t.from.title}</p>
                    <p className="text-xs text-gray-500">
                      {t.from.key && `${t.from.key} `}{t.from.bpm && `${t.from.bpm} BPM`}
                    </p>
                  </div>
                  <span className="text-gray-500">→</span>
                  <div className="flex-1">
                    <p className="text-[var(--color-text-primary)] text-sm">{t.to.title}</p>
                    <p className="text-xs text-gray-500">
                      {t.to.key && `${t.to.key} `}{t.to.bpm && `${t.to.bpm} BPM`}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {t.keyDistance !== null && <span>Key: {t.keyDistance} steps</span>}
                  {t.bpmDiff !== null && <span className="ml-2">BPM: ±{t.bpmDiff}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optimizer Tab */}
      {activeTab === 'optimizer' && (
        <div className="space-y-6">
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Select songs to optimize ({selectedSongIds.length} selected)
              </h3>
              <button
                onClick={optimizeSelectedSongs}
                disabled={selectedSongIds.length < 2}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
              >
                Optimize Order
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {songs.filter(s => s.key || s.bpm).map(song => (
                <label
                  key={song.id}
                  className={`flex items-center gap-3 p-2 rounded cursor-pointer ${
                    selectedSongIds.includes(song.id) ? 'bg-blue-900/30' : 'hover:bg-gray-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSongIds.includes(song.id)}
                    onChange={() => toggleSongSelection(song.id)}
                    className="rounded"
                  />
                  <span className="text-[var(--color-text-primary)] flex-1">
                    {song.title} {song.artist && `- ${song.artist}`}
                  </span>
                  <span className="text-sm text-gray-400">
                    {song.key} {song.bpm && `${song.bpm} BPM`}
                  </span>
                </label>
              ))}
            </div>
            {songs.filter(s => !s.key && !s.bpm).length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                {songs.filter(s => !s.key && !s.bpm).length} songs hidden (no key/BPM data)
              </p>
            )}
          </div>

          {optimizedSetlist && (
            <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Optimized Order</h3>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${getScoreColor(optimizedSetlist.flowScore)}`}>
                    {optimizedSetlist.flowScore}
                  </span>
                  <span className="text-sm text-gray-400">/ 100 flow score</span>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-4">{optimizedSetlist.tip}</p>
              <div className="space-y-2">
                {optimizedSetlist.optimizedOrder.map((song, idx) => (
                  <div key={song.id} className="flex items-center gap-3 p-2 bg-gray-700 rounded">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-[var(--color-text-primary)] flex-1">
                      {song.title} {song.artist && `- ${song.artist}`}
                    </span>
                    <span className="text-sm text-gray-400">
                      {song.key} {song.bpm && `${song.bpm} BPM`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
