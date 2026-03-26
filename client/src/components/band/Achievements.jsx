import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { formatDate } from '../../utils/formatDate';
import ErrorMessage from '../common/ErrorMessage';
import Skeleton from '../common/Skeleton';

export default function Achievements({ workspaceId }) {
  const [activeTab, setActiveTab] = useState('band');
  const [bandAchievements, setBandAchievements] = useState([]);
  const [memberAchievements, setMemberAchievements] = useState([]);
  const [myAchievements, setMyAchievements] = useState([]);
  const [allDefinitions, setAllDefinitions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [newAchievements, setNewAchievements] = useState([]);
  const [message, setMessage] = useState(null);
  const messageTimerRef = useRef(null);

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

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
      setError(null);
    } catch (err) {
      console.error('Failed to load achievements:', err);
      setError(err.message || 'Failed to load achievements');
    } finally {
      setLoading(false);
    }
  }

  async function checkAchievements() {
    setChecking(true);
    setNewAchievements([]);
    setMessage(null);
    try {
      const result = await api.checkAchievements(workspaceId);
      setStats(result.stats);
      if (result.newAchievements.length > 0) {
        setNewAchievements(result.newAchievements);
        await loadData();
      } else {
        setMessage({ type: 'info', text: 'No new achievements - keep playing!' });
        if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
        messageTimerRef.current = setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('Failed to check achievements:', error);
      setMessage({ type: 'error', text: 'Failed to check achievements: ' + error.message });
    } finally {
      setChecking(false);
    }
  }

  function getEarnedIds(type) {
    if (type === 'band') return new Set(bandAchievements.map(a => a.achievementId));
    return new Set(myAchievements.map(a => a.achievementId));
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
    return (
      <div className="h-full flex flex-col bg-[var(--color-bg-primary)]">
        <div className="space-y-4 p-4">
          {Array.from({length: 3}).map((_, i) => <Skeleton.Card key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-primary)]">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto">
      {/* Error State */}
      {error && !loading && allDefinitions.length === 0 && (
        <ErrorMessage
          message={error}
          onRetry={loadData}
          className="py-16"
        />
      )}

      {/* New Achievement Celebration */}
      {newAchievements.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-500/50 rounded-lg p-4">
          <h3 className="text-xl font-bold text-yellow-400 mb-3">
            New Achievements Unlocked!
          </h3>
          <div className="flex flex-wrap gap-3">
            {newAchievements.map(a => (
              <div key={a.id} className="bg-[var(--color-bg-secondary)] rounded-lg p-3 flex items-center gap-2">
                <span className="text-3xl">{a.achievement.icon}</span>
                <div>
                  <p className="font-semibold text-[var(--color-text-primary)]">{a.achievement.name}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">{a.achievement.description}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setNewAchievements([])}
            className="mt-3 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Message Banner */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg ${
          message.type === 'error' ? 'bg-red-900/50 text-red-300 border border-red-700' :
          message.type === 'success' ? 'bg-green-900/50 text-green-300 border border-green-700' :
          'bg-blue-900/50 text-blue-300 border border-blue-700'
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Achievements</h2>
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
        <div className="mb-6 grid grid-cols-3 md:grid-cols-6 gap-3">
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[var(--color-text-primary)]">{stats.gigs}</p>
            <p className="text-sm text-[var(--color-text-muted)]">Gigs</p>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[var(--color-text-primary)]">{stats.hoursGigged || 0}h</p>
            <p className="text-sm text-[var(--color-text-muted)]">Stage Time</p>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[var(--color-text-primary)]">{stats.rehearsals}</p>
            <p className="text-sm text-[var(--color-text-muted)]">Rehearsals</p>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[var(--color-text-primary)]">{stats.hoursRehearsed || 0}h</p>
            <p className="text-sm text-[var(--color-text-muted)]">Practice Hours</p>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[var(--color-text-primary)]">{stats.songs}</p>
            <p className="text-sm text-[var(--color-text-muted)]">Songs</p>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[var(--color-text-primary)]">${stats.revenue?.toLocaleString() || 0}</p>
            <p className="text-sm text-[var(--color-text-muted)]">Revenue</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[var(--color-border)]">
        <button
          onClick={() => setActiveTab('band')}
          className={`px-4 py-2 -mb-px ${activeTab === 'band' ? 'border-b-2 border-blue-500 text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}
        >
          Band ({bandAchievements.length}/{bandDefs.length})
        </button>
        <button
          onClick={() => setActiveTab('mine')}
          className={`px-4 py-2 -mb-px ${activeTab === 'mine' ? 'border-b-2 border-blue-500 text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}
        >
          My Badges ({myAchievements.length}/{memberDefs.length})
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`px-4 py-2 -mb-px ${activeTab === 'leaderboard' ? 'border-b-2 border-blue-500 text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}
        >
          Leaderboard
        </button>
      </div>

      {/* Band Achievements */}
      {activeTab === 'band' && (
        <div className="space-y-6">
          {Object.entries(groupByCategory(bandDefs)).map(([category, achievements]) => (
            <div key={category}>
              <h3 className="text-lg font-semibold text-[var(--color-text-secondary)] mb-3 capitalize">{category}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {achievements.map(achievement => {
                  const earned = earnedBandIds.has(achievement.id);
                  const earnedData = bandAchievements.find(a => a.achievementId === achievement.id);
                  return (
                    <div
                      key={achievement.id}
                      className={`p-4 rounded-lg border transition ${
                        earned
                          ? 'bg-[var(--color-bg-secondary)] border-yellow-500/50'
                          : 'bg-[var(--color-bg-secondary)] border-[var(--color-border)] opacity-50'
                      }`}
                    >
                      <div className="text-center">
                        <span className={`text-4xl ${earned ? '' : 'grayscale'}`}>
                          {achievement.icon}
                        </span>
                        <h4 className="font-semibold text-[var(--color-text-primary)] mt-2">{achievement.name}</h4>
                        <p className="text-sm text-[var(--color-text-muted)] mt-1">{achievement.description}</p>
                        {earned && earnedData && (
                          <p className="text-xs text-yellow-500 mt-2">
                            Earned {formatDate(earnedData.earnedAt)}
                          </p>
                        )}
                        {!earned && achievement.threshold && (
                          <p className="text-xs text-[var(--color-text-muted)] mt-2">
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
              <h3 className="text-lg font-semibold text-[var(--color-text-secondary)] mb-3 capitalize">{category}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {achievements.map(achievement => {
                  const earned = earnedMemberIds.has(achievement.id);
                  const earnedData = myAchievements.find(a => a.achievementId === achievement.id);
                  return (
                    <div
                      key={achievement.id}
                      className={`p-4 rounded-lg border transition ${
                        earned
                          ? 'bg-[var(--color-bg-secondary)] border-green-500/50'
                          : 'bg-[var(--color-bg-secondary)] border-[var(--color-border)] opacity-50'
                      }`}
                    >
                      <div className="text-center">
                        <span className={`text-4xl ${earned ? '' : 'grayscale'}`}>
                          {achievement.icon}
                        </span>
                        <h4 className="font-semibold text-[var(--color-text-primary)] mt-2">{achievement.name}</h4>
                        <p className="text-sm text-[var(--color-text-muted)] mt-1">{achievement.description}</p>
                        {earned && earnedData && (
                          <p className="text-xs text-green-500 mt-2">
                            Earned {formatDate(earnedData.earnedAt)}
                          </p>
                        )}
                        {!earned && achievement.threshold && (
                          <p className="text-xs text-[var(--color-text-muted)] mt-2">
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
        <div className="bg-[var(--color-bg-secondary)] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-[var(--color-bg-tertiary)]">
              <tr>
                <th className="px-4 py-3 text-left text-[var(--color-text-secondary)]">Rank</th>
                <th className="px-4 py-3 text-left text-[var(--color-text-secondary)]">Member</th>
                <th className="px-4 py-3 text-center text-[var(--color-text-secondary)]">Badges</th>
                <th className="px-4 py-3 text-left text-[var(--color-text-secondary)]">Recent</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, idx) => (
                <tr key={entry.user.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)]">
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
                        <div className="w-8 h-8 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-[var(--color-text-primary)]">
                          {entry.user.displayName[0]}
                        </div>
                      )}
                      <span className="text-[var(--color-text-primary)]">{entry.user.displayName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-2xl font-bold text-[var(--color-text-primary)]">{entry.achievementCount}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {entry.achievements.slice(0, 5).map(a => (
                        <span key={a.id} className="text-xl" title={a.name}>
                          {a.icon}
                        </span>
                      ))}
                      {entry.achievements.length > 5 && (
                        <span className="text-[var(--color-text-muted)] text-sm">
                          +{entry.achievements.length - 5}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[var(--color-text-muted)]">
                    No achievements earned yet. Keep playing!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
