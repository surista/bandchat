import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';

export default function MemberProfile({ userId, workspaceId, onClose, onStartDM }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProfile();
  }, [userId, workspaceId]);

  async function loadProfile() {
    try {
      const data = await api.getMemberProfile(workspaceId, userId);
      setProfile(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function handleStartDM() {
    onStartDM?.(userId);
    onClose();
  }

  const content = (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-xl max-w-md w-full max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading profile...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-400">{error}</div>
        ) : profile ? (
          <>
            {/* Header with avatar */}
            <div className="relative">
              <div className="h-24 bg-gradient-to-br from-blue-600 to-purple-600" />
              <div className="absolute -bottom-12 left-6">
                {profile.user.avatarUrl ? (
                  <img
                    src={profile.user.avatarUrl}
                    alt={profile.user.displayName}
                    className="w-24 h-24 rounded-xl border-4 border-gray-800 object-cover"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-xl border-4 border-gray-800 bg-blue-600 flex items-center justify-center text-white text-3xl font-bold">
                    {profile.user.displayName?.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="absolute top-3 right-3 text-white/70 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Profile info */}
            <div className="pt-14 px-6 pb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-white">{profile.user.displayName}</h2>
                  <p className="text-gray-400 text-sm">{profile.user.email}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs ${
                  profile.role === 'ADMIN' ? 'bg-yellow-600 text-yellow-100' : 'bg-gray-600 text-gray-200'
                }`}>
                  {profile.role}
                </span>
              </div>

              {profile.user.bio && (
                <p className="text-gray-300 mb-4">{profile.user.bio}</p>
              )}

              <div className="text-sm text-gray-500 mb-4">
                Joined {formatDate(profile.joinedAt)}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-white">{profile.stats.messages}</p>
                  <p className="text-xs text-gray-400">Messages</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-white">{profile.stats.songsAdded}</p>
                  <p className="text-xs text-gray-400">Songs Added</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-white">{profile.stats.setlistsCreated}</p>
                  <p className="text-xs text-gray-400">Setlists</p>
                </div>
              </div>

              {/* Achievements */}
              {profile.achievements.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
                    Badges ({profile.achievements.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.achievements.map(achievement => (
                      <div
                        key={achievement.id}
                        className="flex items-center gap-1.5 bg-gray-700 rounded-full px-3 py-1.5"
                        title={`${achievement.name}: ${achievement.description}`}
                      >
                        <span className="text-lg">{achievement.icon}</span>
                        <span className="text-sm text-white">{achievement.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {profile.achievements.length === 0 && (
                <div className="mb-6 text-center py-4 bg-gray-700/30 rounded-lg">
                  <p className="text-gray-500 text-sm">No badges earned yet</p>
                </div>
              )}

              {/* Actions */}
              {onStartDM && (
                <button
                  onClick={handleStartDM}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
                >
                  Send Message
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
