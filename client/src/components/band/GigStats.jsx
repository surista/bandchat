import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatDate } from '../../utils/formatDate';
import { formatTotalDuration } from '../../utils/formatDuration';

const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5', CAD: 'C$', AUD: 'A$',
  CHF: 'CHF', CNY: '\u00A5', KRW: '\u20A9', INR: '\u20B9', BRL: 'R$', MXN: 'MX$',
  SEK: 'kr', NOK: 'kr', DKK: 'kr', NZD: 'NZ$', SGD: 'S$', HKD: 'HK$', THB: '\u0E3F', PHP: '\u20B1',
};

function GigStats({ workspaceId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [popup, setPopup] = useState(null); // { type: 'busiest' | 'venue' | 'setlist', data: ... }
  const [setlistDetail, setSetlistDetail] = useState(null);

  useEffect(() => {
    loadStats();
  }, [workspaceId]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await api.getGigStats(workspaceId);
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSetlistDetail = async (setlistId) => {
    try {
      const setlist = await api.getSetlist(setlistId);
      setSetlistDetail(setlist);
    } catch (err) {
      console.error('Failed to load setlist:', err);
    }
  };

  const handleSetlistClick = (setlist) => {
    loadSetlistDetail(setlist.id);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading stats...</div>;
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-[var(--color-border)]">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Band Stats</h2>
        <p className="text-[var(--color-text-muted)] text-sm mt-1">Performance history and insights</p>
      </div>

      {/* Stats Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Primary Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
            <div className="text-3xl font-bold text-green-400">{stats.totalGigs}</div>
            <div className="text-[var(--color-text-muted)] text-sm">Gigs Played</div>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
            <div className="text-3xl font-bold text-blue-400">
              {stats.totalTimeGigged?.hours || 0}h {stats.totalTimeGigged?.minutes || 0}m
            </div>
            <div className="text-[var(--color-text-muted)] text-sm">Total Stage Time</div>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
            <div className="text-3xl font-bold text-purple-400">{stats.uniqueSongsPlayed || 0}</div>
            <div className="text-[var(--color-text-muted)] text-sm">Unique Songs Played</div>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
            <div className="text-3xl font-bold text-yellow-400">
              {CURRENCY_SYMBOLS[stats.currency] || '$'}{stats.totalRevenue?.toLocaleString() || 0}
            </div>
            <div className="text-[var(--color-text-muted)] text-sm">Total Revenue</div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
            <div className="text-2xl font-bold text-cyan-400">{stats.averageSongsPerGig || 0}</div>
            <div className="text-[var(--color-text-muted)] text-sm">Avg Songs/Gig</div>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
            <div className="text-2xl font-bold text-pink-400">{stats.totalRehearsals}</div>
            <div className="text-[var(--color-text-muted)] text-sm">Rehearsals</div>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
            <div className="text-2xl font-bold text-orange-400">{stats.upcomingGigs}</div>
            <div className="text-[var(--color-text-muted)] text-sm">Upcoming Gigs</div>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
            <div className="text-2xl font-bold text-red-400">{stats.songsNeverPlayed}</div>
            <div className="text-[var(--color-text-muted)] text-sm">Songs Never Played</div>
          </div>
        </div>

        {/* Fun Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Busiest Stretch - Clickable */}
          <div
            className={`bg-gradient-to-br from-purple-900/50 to-blue-900/50 rounded-lg p-4 border border-purple-700/50 ${stats.busiestStretch ? 'cursor-pointer hover:border-purple-500 transition-colors' : ''}`}
            onClick={() => stats.busiestStretch && setPopup({ type: 'busiest', data: stats.busiestStretch })}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🔥</span>
              <h3 className="font-medium text-white">Busiest Stretch</h3>
            </div>
            {stats.busiestStretch ? (
              <div>
                <div className="text-2xl font-bold text-purple-300">
                  {stats.busiestStretch.gigs} gigs in {stats.busiestStretch.days} days
                </div>
                <div className="text-[var(--color-text-muted)] text-sm mt-1">
                  {formatDate(stats.busiestStretch.startDate)} – {formatDate(stats.busiestStretch.endDate)}
                </div>
              </div>
            ) : (
              <div className="text-gray-400">Play more gigs to see your busiest period!</div>
            )}
          </div>

          {/* Longest Setlist */}
          <div
            className={`bg-gradient-to-br from-green-900/50 to-teal-900/50 rounded-lg p-4 border border-green-700/50 ${stats.longestSetlist?.id ? 'cursor-pointer hover:border-green-500 transition-colors' : ''}`}
            onClick={() => stats.longestSetlist?.id && handleSetlistClick(stats.longestSetlist)}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📋</span>
              <h3 className="font-medium text-white">Longest Setlist</h3>
            </div>
            {stats.longestSetlist ? (
              <div>
                <div className="text-2xl font-bold text-green-300">
                  {stats.longestSetlist.songCount} songs
                </div>
                <div className="text-[var(--color-text-muted)] text-sm mt-1 truncate">
                  {stats.longestSetlist.name}
                </div>
              </div>
            ) : (
              <div className="text-gray-400">No setlists with songs yet</div>
            )}
          </div>

          {/* Career Span */}
          <div className="bg-gradient-to-br from-orange-900/50 to-red-900/50 rounded-lg p-4 border border-orange-700/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📅</span>
              <h3 className="font-medium text-white">Career Span</h3>
            </div>
            {stats.firstGig ? (
              <div>
                <div className="text-sm text-gray-400">First Gig</div>
                <div className="text-lg font-medium text-orange-300">{formatDate(stats.firstGig)}</div>
                <div className="text-sm text-gray-400 mt-2">Most Recent</div>
                <div className="text-lg font-medium text-orange-300">{formatDate(stats.lastGig)}</div>
              </div>
            ) : (
              <div className="text-gray-400">No gigs recorded yet</div>
            )}
          </div>
        </div>

        {/* Three Column Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Most Played Songs */}
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
            <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-4">Most Played Songs</h3>
            {stats.mostPlayedSongs?.length > 0 ? (
              <div className="space-y-2">
                {stats.mostPlayedSongs.slice(0, 10).map((song, index) => (
                  <div
                    key={song.id}
                    className="flex items-center gap-2 p-2 bg-gray-900 rounded"
                  >
                    <span className={`w-5 text-right text-sm font-bold ${
                      index === 0 ? 'text-yellow-400' :
                      index === 1 ? 'text-gray-300' :
                      index === 2 ? 'text-orange-400' :
                      'text-gray-500'
                    }`}>
                      #{index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[var(--color-text-primary)] text-sm truncate">{song.title}</div>
                      {song.artist && (
                        <div className="text-[var(--color-text-muted)] text-xs truncate">{song.artist}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-green-400 text-sm font-medium">{song.playCount}x</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-4 text-sm">
                No songs played yet
              </div>
            )}
          </div>

          {/* Middle Column - Fun Stats */}
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🎯</span>
              <h3 className="text-lg font-medium text-[var(--color-text-primary)]">Fun Facts</h3>
            </div>
            <div className="space-y-3">
              {/* Most Time on Song */}
              {stats.mostTimeSong && (
                <div className="p-3 bg-[var(--color-bg-primary)] rounded">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Most Time on One Song</div>
                  <div className="text-[var(--color-text-primary)] font-medium text-sm">{stats.mostTimeSong.title}</div>
                  <div className="text-blue-400 font-bold">
                    {formatTotalDuration(stats.mostTimeSong.totalTime)}
                    <span className="text-gray-500 text-xs font-normal ml-1">({stats.mostTimeSong.playCount} plays)</span>
                  </div>
                </div>
              )}

              {/* Most Played Artist */}
              {stats.mostPlayedArtist && (
                <div className="p-3 bg-[var(--color-bg-primary)] rounded">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Most Played Artist</div>
                  <div className="text-[var(--color-text-primary)] font-medium text-sm">{stats.mostPlayedArtist.name}</div>
                  <div className="text-purple-400 font-bold">
                    {stats.mostPlayedArtist.playCount} song plays
                  </div>
                </div>
              )}

              {/* Longest Gap */}
              {stats.longestGap && (
                <div className="p-3 bg-[var(--color-bg-primary)] rounded">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Longest Break</div>
                  <div className="text-orange-400 font-bold">{stats.longestGap.days} days</div>
                  <div className="text-gray-400 text-xs">
                    {formatDate(stats.longestGap.startDate)} → {formatDate(stats.longestGap.endDate)}
                  </div>
                </div>
              )}

              {/* Shortest Setlist */}
              {stats.shortestSetlist && stats.longestSetlist && stats.shortestSetlist.songCount !== stats.longestSetlist.songCount && (
                <div
                  className="p-3 bg-[var(--color-bg-primary)] rounded cursor-pointer hover:bg-[var(--color-bg-secondary)] transition-colors"
                  onClick={() => handleSetlistClick(stats.shortestSetlist)}
                >
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Shortest Setlist</div>
                  <div className="text-[var(--color-text-primary)] font-medium text-sm truncate">{stats.shortestSetlist.name}</div>
                  <div className="text-teal-400 font-bold">{stats.shortestSetlist.songCount} songs</div>
                </div>
              )}

              {/* Most Songs in Shortest Time */}
              {stats.mostSongsShortestTime && (
                <div
                  className="p-3 bg-[var(--color-bg-primary)] rounded cursor-pointer hover:bg-[var(--color-bg-secondary)] transition-colors"
                  onClick={() => setPopup({ type: 'songdensity', data: stats.mostSongsShortestTime })}
                >
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Song Density Record</div>
                  <div className="text-[var(--color-text-primary)] font-medium text-sm">
                    {stats.mostSongsShortestTime.totalSongs} songs in {stats.mostSongsShortestTime.days} day{stats.mostSongsShortestTime.days !== 1 ? 's' : ''}
                  </div>
                  <div className="text-cyan-400 font-bold">
                    {stats.mostSongsShortestTime.songsPerDay.toFixed(1)} songs/day
                  </div>
                </div>
              )}

              {/* Days Since Last Gig */}
              {stats.daysSinceLastGig !== null && stats.daysSinceLastGig > 0 && (
                <div className="p-3 bg-[var(--color-bg-primary)] rounded">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Days Since Last Gig</div>
                  <div className={`font-bold ${stats.daysSinceLastGig > 30 ? 'text-red-400' : stats.daysSinceLastGig > 14 ? 'text-orange-400' : 'text-green-400'}`}>
                    {stats.daysSinceLastGig} days
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Top Venues - Clickable */}
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🏟️</span>
              <h3 className="text-lg font-medium text-[var(--color-text-primary)]">Top Venues</h3>
            </div>
            {stats.topVenues?.length > 0 ? (
              <div className="space-y-2">
                {stats.topVenues.slice(0, 8).map((item, index) => (
                  <div
                    key={item.venue}
                    className="flex items-center gap-2 p-2 bg-gray-900 rounded cursor-pointer hover:bg-[var(--color-bg-secondary)] transition-colors"
                    onClick={() => setPopup({ type: 'venue', data: item })}
                  >
                    <span className={`w-5 text-center text-sm ${
                      index === 0 ? 'text-yellow-400' : 'text-gray-500'
                    }`}>
                      {index === 0 ? '🏆' : `#${index + 1}`}
                    </span>
                    <div className="flex-1 text-[var(--color-text-primary)] text-sm truncate">{item.venue}</div>
                    <div className="text-green-400 text-sm font-medium">
                      {item.count} {item.count === 1 ? 'gig' : 'gigs'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-4 text-sm">
                No venues recorded yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Popup for Busiest Stretch */}
      {popup?.type === 'busiest' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setPopup(null)}>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg w-full max-w-md border border-[var(--color-border)]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-lg font-medium text-[var(--color-text-primary)] flex items-center gap-2">
                <span>🔥</span> Busiest Stretch
              </h3>
              <button onClick={() => setPopup(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-2xl">&times;</button>
            </div>
            <div className="p-4">
              <div className="text-purple-300 font-bold text-lg mb-2">
                {popup.data.gigs} gigs in {popup.data.days} days
              </div>
              <div className="text-[var(--color-text-muted)] text-sm mb-4">
                {formatDate(popup.data.startDate)} – {formatDate(popup.data.endDate)}
              </div>
              <div className="space-y-2">
                {popup.data.setlists?.map(setlist => (
                  <div
                    key={setlist.id}
                    className="p-3 bg-[var(--color-bg-primary)] rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)] transition-colors"
                    onClick={() => handleSetlistClick(setlist)}
                  >
                    <div className="text-[var(--color-text-primary)] font-medium">{setlist.name}</div>
                    <div className="text-[var(--color-text-muted)] text-sm">
                      {formatDate(setlist.performedAt)} {setlist.venue && `• ${setlist.venue}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popup for Venue */}
      {popup?.type === 'venue' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setPopup(null)}>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg w-full max-w-md border border-[var(--color-border)]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-lg font-medium text-[var(--color-text-primary)] flex items-center gap-2">
                <span>🏟️</span> {popup.data.venue}
              </h3>
              <button onClick={() => setPopup(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-2xl">&times;</button>
            </div>
            <div className="p-4">
              <div className="text-green-400 font-bold text-lg mb-4">
                {popup.data.count} {popup.data.count === 1 ? 'gig' : 'gigs'} at this venue
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {popup.data.setlists?.map(setlist => (
                  <div
                    key={setlist.id}
                    className="p-3 bg-[var(--color-bg-primary)] rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)] transition-colors"
                    onClick={() => handleSetlistClick(setlist)}
                  >
                    <div className="text-[var(--color-text-primary)] font-medium">{setlist.name}</div>
                    <div className="text-[var(--color-text-muted)] text-sm">{formatDate(setlist.performedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popup for Song Density */}
      {popup?.type === 'songdensity' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setPopup(null)}>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg w-full max-w-md border border-[var(--color-border)]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-lg font-medium text-[var(--color-text-primary)] flex items-center gap-2">
                <span>⚡</span> Song Density Record
              </h3>
              <button onClick={() => setPopup(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-2xl">&times;</button>
            </div>
            <div className="p-4">
              <div className="text-cyan-300 font-bold text-lg mb-2">
                {popup.data.totalSongs} songs in {popup.data.days} day{popup.data.days !== 1 ? 's' : ''}
              </div>
              <div className="text-[var(--color-text-muted)] text-sm mb-4">
                {formatDate(popup.data.startDate)} – {formatDate(popup.data.endDate)}
                <span className="text-cyan-400 ml-2">({popup.data.songsPerDay.toFixed(1)} songs/day)</span>
              </div>
              <div className="space-y-2">
                {popup.data.setlists?.map(setlist => (
                  <div
                    key={setlist.id}
                    className="p-3 bg-[var(--color-bg-primary)] rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)] transition-colors"
                    onClick={() => handleSetlistClick(setlist)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[var(--color-text-primary)] font-medium">{setlist.name}</div>
                      <div className="text-cyan-400 font-medium">{setlist.songCount} songs</div>
                    </div>
                    <div className="text-[var(--color-text-muted)] text-sm">
                      {formatDate(setlist.performedAt)} {setlist.venue && `• ${setlist.venue}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popup for Setlist Detail */}
      {setlistDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSetlistDetail(null)}>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg w-full max-w-lg border border-[var(--color-border)] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-lg font-medium text-[var(--color-text-primary)]">{setlistDetail.name}</h3>
                <div className="text-[var(--color-text-muted)] text-sm">
                  {setlistDetail.performedAt && formatDate(setlistDetail.performedAt)}
                  {setlistDetail.venue && ` • ${setlistDetail.venue}`}
                </div>
              </div>
              <button onClick={() => setSetlistDetail(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-2xl">&times;</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {setlistDetail.songs?.length > 0 ? (
                <div className="space-y-1">
                  {setlistDetail.songs
                    .sort((a, b) => a.position - b.position)
                    .map((item, index) => (
                      <div key={item.id} className="flex items-center gap-2 p-2 bg-gray-900 rounded">
                        <span className="text-gray-500 text-sm w-6 text-right">{index + 1}.</span>
                        {item.type === 'SONG' && item.song ? (
                          <div className="flex-1 min-w-0">
                            <div className="text-[var(--color-text-primary)] text-sm truncate">{item.song.title}</div>
                            {item.song.artist && (
                              <div className="text-[var(--color-text-muted)] text-xs truncate">{item.song.artist}</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-[var(--color-text-muted)] text-sm italic">
                            {item.type === 'MC' ? `MC${item.label ? `: ${item.label}` : ''}` : 'Set Break'}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-gray-500 text-center py-4">No songs in this setlist</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GigStats;
