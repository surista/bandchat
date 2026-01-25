import { useState, useEffect } from 'react';
import { api } from '../../services/api';

export default function Achievements({ workspaceId }) {
  const [activeTab, setActiveTab] = useState('band');
  const [bandAchievements, setBandAchievements] = useState([]);
  const [memberAchievements, setMemberAchievements] = useState([]);
  const [myAchievements, setMyAchievements] = useState([]);
  const [allDefinitions, setAllDefinitions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [newAchievements, setNewAchievements] = useState([]);

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  async function loadData() {
    try {
      const [defs, band, members, mine, board] = await Promise.all([
        api.getAchievementDefinitions(),
        api.getBandAchievements(workspaceId),
        api.getMemberAchievements(workspaceId),
        api.getMyAchievements(workspaceId),
        api.getAchievementLeaderboard(workspaceId)
      ]);
      setAllDefinitions(defs);
      setBandAchievements(band);
      setMemberAchievements(members);
      setMyAchievements(mine);
      setLeaderboard(board);
    } catch (error) {
      console.error('Failed to load achievements:', error);
    } finally {
      setLoading(false);
    }
  }

  async function checkAchievements() {
    setChecking(true);
    setNewAchievements([]);
    try {
      const result = await api.checkAchievements(workspaceId);
      setStats(result.stats);
      if (result.newAchievements.length > 0) {
        setNewAchievements(result.newAchievements);
        // Reload all data
        await loadData();
      }
    } catch (error) {
      console.error('Failed to check achievements:', error);
    } finally {
      setChecking(false);
    }
  }

  function getEarnedIds(type) {
    if (type === 'band') return new Set(bandAchievements.map(a => a.achievementId));
    return new Set(myAchievements.map(a => a.achievementId));
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  const bandDefs = allDefinitions.filter(a => a.isBandWide);
  const memberDefs = allDefinitions.filter(a => !a.isBandWide);
  const earnedBandIds = getEarnedIds('band');
  const earnedMemberIds = getEarnedIds('member');

  // Group by category
  const groupByCategory = (achievements) => {
    return achievements.reduce((acc, a) => {
      if (!acc[a.category]) acc[a.category] = [];
      acc[a.category].push(a);
      return acc;
    }, {});
  };

  if (loading) {
    return <div className="p-4 text-gray-400">Loading achievements...</div>;
  }

  return (
    <div className="p-4 max-w-5xl mx-auto min-h-full bg-gray-900">
      {/* New Achievement Celebration */}
      {newAchievements.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/50 rounded-lg p-4">
          <h3 className="text-xl font-bold text-yellow-400 mb-3">
            New Achievements Unlocked!
          </h3>
          <div className="flex flex-wrap gap-3">
            {newAchievements.map(a => (
              <div key={a.id} className="bg-gray-800 rounded-lg p-3 flex items-center gap-2">
                <span className="text-3xl">{a.achievement.icon}</span>
                <div>
                  <p className="font-semibold text-white">{a.achievement.name}</p>
                  <p className="text-sm text-gray-400">{a.achievement.description}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setNewAchievements([])}
            className="mt-3 text-sm text-gray-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">Achievements</h2>
        <button
          onClick={checkAchievements}
          disabled={checking}
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
        >
          {checking ? (
            <>Checking...</>
          ) : (
            <>
              <span>Check for New</span>
              <span className="text-lg">🔍</span>
            </>
          )}
        </button>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="mb-6 grid grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.gigs}</p>
            <p className="text-sm text-gray-400">Gigs</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.rehearsals}</p>
            <p className="text-sm text-gray-400">Rehearsals</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.songs}</p>
            <p className="text-sm text-gray-400">Songs</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-white">${stats.revenue?.toLocaleString() || 0}</p>
            <p className="text-sm text-gray-400">Revenue</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('band')}
          className={`px-4 py-2 -mb-px ${activeTab === 'band' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'}`}
        >
          Band ({bandAchievements.length}/{bandDefs.length})
        </button>
        <button
          onClick={() => setActiveTab('mine')}
          className={`px-4 py-2 -mb-px ${activeTab === 'mine' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'}`}
        >
          My Badges ({myAchievements.length}/{memberDefs.length})
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`px-4 py-2 -mb-px ${activeTab === 'leaderboard' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'}`}
        >
          Leaderboard
        </button>
      </div>

      {/* Band Achievements */}
      {activeTab === 'band' && (
        <div className="space-y-6">
          {Object.entries(groupByCategory(bandDefs)).map(([category, achievements]) => (
            <div key={category}>
              <h3 className="text-lg font-semibold text-gray-300 mb-3 capitalize">{category}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {achievements.map(achievement => {
                  const earned = earnedBandIds.has(achievement.id);
                  const earnedData = bandAchievements.find(a => a.achievementId === achievement.id);
                  return (
                    <div
                      key={achievement.id}
                      className={`p-4 rounded-lg border transition ${
                        earned
                          ? 'bg-gray-800 border-yellow-500/50'
                          : 'bg-gray-800/50 border-gray-700 opacity-50'
                      }`}
                    >
                      <div className="text-center">
                        <span className={`text-4xl ${earned ? '' : 'grayscale'}`}>
                          {achievement.icon}
                        </span>
                        <h4 className="font-semibold text-white mt-2">{achievement.name}</h4>
                        <p className="text-sm text-gray-400 mt-1">{achievement.description}</p>
                        {earned && earnedData && (
                          <p className="text-xs text-yellow-500 mt-2">
                            Earned {formatDate(earnedData.earnedAt)}
                          </p>
                        )}
                        {!earned && achievement.threshold && (
                          <p className="text-xs text-gray-500 mt-2">
                            Goal: {achievement.threshold}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My Achievements */}
      {activeTab === 'mine' && (
        <div className="space-y-6">
          {Object.entries(groupByCategory(memberDefs)).map(([category, achievements]) => (
            <div key={category}>
              <h3 className="text-lg font-semibold text-gray-300 mb-3 capitalize">{category}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {achievements.map(achievement => {
                  const earned = earnedMemberIds.has(achievement.id);
                  const earnedData = myAchievements.find(a => a.achievementId === achievement.id);
                  return (
                    <div
                      key={achievement.id}
                      className={`p-4 rounded-lg border transition ${
                        earned
                          ? 'bg-gray-800 border-green-500/50'
                          : 'bg-gray-800/50 border-gray-700 opacity-50'
                      }`}
                    >
                      <div className="text-center">
                        <span className={`text-4xl ${earned ? '' : 'grayscale'}`}>
                          {achievement.icon}
                        </span>
                        <h4 className="font-semibold text-white mt-2">{achievement.name}</h4>
                        <p className="text-sm text-gray-400 mt-1">{achievement.description}</p>
                        {earned && earnedData && (
                          <p className="text-xs text-green-500 mt-2">
                            Earned {formatDate(earnedData.earnedAt)}
                          </p>
                        )}
                        {!earned && achievement.threshold && (
                          <p className="text-xs text-gray-500 mt-2">
                            Goal: {achievement.threshold}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Leaderboard */}
      {activeTab === 'leaderboard' && (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-gray-300">Rank</th>
                <th className="px-4 py-3 text-left text-gray-300">Member</th>
                <th className="px-4 py-3 text-center text-gray-300">Badges</th>
                <th className="px-4 py-3 text-left text-gray-300">Recent</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, idx) => (
                <tr key={entry.user.id} className="border-t border-gray-700 hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <span className={`text-xl ${
                      idx === 0 ? 'text-yellow-400' :
                      idx === 1 ? 'text-gray-300' :
                      idx === 2 ? 'text-orange-400' : 'text-gray-500'
                    }`}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {entry.user.avatarUrl ? (
                        <img
                          src={entry.user.avatarUrl}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white">
                          {entry.user.displayName[0]}
                        </div>
                      )}
                      <span className="text-white">{entry.user.displayName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-2xl font-bold text-white">{entry.achievementCount}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {entry.achievements.slice(0, 5).map(a => (
                        <span key={a.id} className="text-xl" title={a.name}>
                          {a.icon}
                        </span>
                      ))}
                      {entry.achievements.length > 5 && (
                        <span className="text-gray-400 text-sm">
                          +{entry.achievements.length - 5}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                    No achievements earned yet. Keep playing!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
