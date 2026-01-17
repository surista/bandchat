import { useState, useEffect } from 'react';
import api from '../../services/api';

function GigStats({ workspaceId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
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
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Band Stats</h2>
        <p className="text-gray-400 text-sm mt-1">Performance history and insights</p>
      </div>

      {/* Stats Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Primary Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-3xl font-bold text-green-400">{stats.totalGigs}</div>
            <div className="text-gray-400 text-sm">Gigs Played</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-3xl font-bold text-blue-400">
              {stats.totalTimeGigged?.hours || 0}h {stats.totalTimeGigged?.minutes || 0}m
            </div>
            <div className="text-gray-400 text-sm">Total Stage Time</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-3xl font-bold text-purple-400">{stats.uniqueSongsPlayed || 0}</div>
            <div className="text-gray-400 text-sm">Unique Songs Played</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-3xl font-bold text-yellow-400">
              ¥{stats.totalRevenue?.toLocaleString() || 0}
            </div>
            <div className="text-gray-400 text-sm">Total Revenue</div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-cyan-400">{stats.averageSongsPerGig || 0}</div>
            <div className="text-gray-400 text-sm">Avg Songs/Gig</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-pink-400">{stats.totalRehearsals}</div>
            <div className="text-gray-400 text-sm">Rehearsals</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-orange-400">{stats.upcomingGigs}</div>
            <div className="text-gray-400 text-sm">Upcoming Gigs</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-red-400">{stats.songsNeverPlayed}</div>
            <div className="text-gray-400 text-sm">Songs Never Played</div>
          </div>
        </div>

        {/* Fun Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Busiest Stretch */}
          <div className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 rounded-lg p-4 border border-purple-700/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🔥</span>
              <h3 className="font-medium text-white">Busiest Stretch</h3>
            </div>
            {stats.busiestStretch ? (
              <div>
                <div className="text-2xl font-bold text-purple-300">
                  {stats.busiestStretch.gigs} gigs in {stats.busiestStretch.days} days
                </div>
                <div className="text-gray-400 text-sm mt-1">
                  {formatDate(stats.busiestStretch.startDate)} – {formatDate(stats.busiestStretch.endDate)}
                </div>
              </div>
            ) : (
              <div className="text-gray-400">Play more gigs to see your busiest period!</div>
            )}
          </div>

          {/* Longest Setlist */}
          <div className="bg-gradient-to-br from-green-900/50 to-teal-900/50 rounded-lg p-4 border border-green-700/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📋</span>
              <h3 className="font-medium text-white">Longest Setlist</h3>
            </div>
            {stats.longestSetlist ? (
              <div>
                <div className="text-2xl font-bold text-green-300">
                  {stats.longestSetlist.songCount} songs
                </div>
                <div className="text-gray-400 text-sm mt-1 truncate">
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

        {/* Most Played Songs */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-6">
          <h3 className="text-lg font-medium text-white mb-4">Most Played Songs</h3>
          {stats.mostPlayedSongs?.length > 0 ? (
            <div className="space-y-2">
              {stats.mostPlayedSongs.map((song, index) => (
                <div
                  key={song.id}
                  className="flex items-center gap-3 p-2 bg-gray-900 rounded"
                >
                  <span className={`w-6 text-right font-bold ${
                    index === 0 ? 'text-yellow-400' :
                    index === 1 ? 'text-gray-300' :
                    index === 2 ? 'text-orange-400' :
                    'text-gray-500'
                  }`}>
                    #{index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate">{song.title}</div>
                    {song.artist && (
                      <div className="text-gray-400 text-sm truncate">{song.artist}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 font-medium">{song.playCount}x</div>
                    {song.totalTime > 0 && (
                      <div className="text-gray-500 text-xs">{formatDuration(song.totalTime)} total</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-center py-4">
              No songs played yet. Add dates to your setlists to track plays!
            </div>
          )}
        </div>

        {/* Most Time Spent on Song */}
        {stats.mostTimeSong && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⏱️</span>
              <h3 className="text-lg font-medium text-white">Most Time Spent on One Song</h3>
            </div>
            <div className="flex items-center gap-4 p-3 bg-gray-900 rounded">
              <div className="flex-1">
                <div className="text-white font-medium">{stats.mostTimeSong.title}</div>
                {stats.mostTimeSong.artist && (
                  <div className="text-gray-400 text-sm">{stats.mostTimeSong.artist}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-400">
                  {Math.floor(stats.mostTimeSong.totalTime / 60)}:{(stats.mostTimeSong.totalTime % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-gray-500 text-sm">
                  from {stats.mostTimeSong.playCount} plays
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top Venues */}
        {stats.topVenues?.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🏟️</span>
              <h3 className="text-lg font-medium text-white">Most Common Venues</h3>
            </div>
            <div className="space-y-2">
              {stats.topVenues.map((item, index) => (
                <div
                  key={item.venue}
                  className="flex items-center gap-3 p-2 bg-gray-900 rounded"
                >
                  <span className={`w-6 text-center ${
                    index === 0 ? 'text-yellow-400' : 'text-gray-500'
                  }`}>
                    {index === 0 ? '🏆' : `#${index + 1}`}
                  </span>
                  <div className="flex-1 text-white truncate">{item.venue}</div>
                  <div className="text-green-400 font-medium">
                    {item.count} {item.count === 1 ? 'gig' : 'gigs'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GigStats;
