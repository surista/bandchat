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
      </div>

      {/* Stats Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-3xl font-bold text-green-400">{stats.totalGigs}</div>
            <div className="text-gray-400 text-sm">Gigs Played</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-3xl font-bold text-blue-400">{stats.totalRehearsals}</div>
            <div className="text-gray-400 text-sm">Rehearsals</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-3xl font-bold text-purple-400">{stats.upcomingGigs}</div>
            <div className="text-gray-400 text-sm">Upcoming</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-3xl font-bold text-yellow-400">
              ${stats.totalRevenue?.toLocaleString() || 0}
            </div>
            <div className="text-gray-400 text-sm">Total Revenue</div>
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
                  <span className="text-gray-500 w-6 text-right">#{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate">{song.title}</div>
                    {song.artist && (
                      <div className="text-gray-400 text-sm truncate">{song.artist}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 font-medium">{song.playCount}</div>
                    <div className="text-gray-500 text-xs">plays</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-center py-4">
              No songs played yet. Complete a gig to start tracking!
            </div>
          )}
        </div>

        {/* Songs Never Played */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-medium text-white mb-2">Songs Never Played</h3>
          <div className="text-4xl font-bold text-orange-400">{stats.songsNeverPlayed}</div>
          <p className="text-gray-400 text-sm mt-1">
            {stats.songsNeverPlayed > 0
              ? 'Consider adding these to your next setlist!'
              : 'Great job! All songs have been played at least once.'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default GigStats;
