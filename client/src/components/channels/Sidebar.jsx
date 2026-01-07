import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { pushService } from '../../services/push';

function Sidebar({
  workspace,
  channels,
  selectedChannel,
  onSelectChannel,
  onCreateChannel,
  onShowInvite,
  onLogout,
  user
}) {
  const navigate = useNavigate();
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  useEffect(() => {
    // Check if notifications are already enabled
    pushService.isSubscribed().then(setNotificationsEnabled);
  }, []);

  const toggleNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const accessToken = localStorage.getItem('accessToken');
      if (notificationsEnabled) {
        await pushService.unsubscribe(accessToken);
        setNotificationsEnabled(false);
      } else {
        await pushService.subscribe(accessToken);
        setNotificationsEnabled(true);
      }
    } catch (error) {
      console.error('Notification toggle error:', error);
      alert(error.message || 'Failed to toggle notifications');
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleCreateChannel = (e) => {
    e.preventDefault();
    if (newChannelName.trim()) {
      onCreateChannel(newChannelName, isPrivate);
      setShowCreateChannel(false);
      setNewChannelName('');
      setIsPrivate(false);
    }
  };

  return (
    <div className="w-64 bg-slack-sidebar flex flex-col text-gray-300">
      {/* Workspace Header */}
      <div className="p-4 border-b border-white/10">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 w-full hover:bg-slack-hover rounded p-1 transition-colors"
        >
          <span className="text-white font-bold text-lg truncate">
            {workspace.name}
          </span>
        </button>
      </div>

      {/* Channels List */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-4 mb-2 flex items-center justify-between">
          <span className="text-sm font-medium uppercase tracking-wide text-gray-400">
            Channels
          </span>
          <button
            onClick={() => setShowCreateChannel(true)}
            className="text-gray-400 hover:text-white transition-colors text-lg"
            title="Create channel"
          >
            +
          </button>
        </div>

        <div className="space-y-0.5">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => onSelectChannel(channel)}
              className={`channel-item w-full ${
                selectedChannel?.id === channel.id ? 'active' : ''
              }`}
            >
              <span className="text-gray-400">
                {channel.isPrivate ? '🔒' : '#'}
              </span>
              <span className="flex-1 truncate">{channel.name}</span>
              {channel.unreadCount > 0 && (
                <span className="bg-slack-red text-white text-xs px-1.5 py-0.5 rounded-full">
                  {channel.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Members Section */}
        <div className="mt-6 px-4 mb-2 flex items-center justify-between">
          <span className="text-sm font-medium uppercase tracking-wide text-gray-400">
            Members ({workspace.members?.length || 0})
          </span>
          <button
            onClick={onShowInvite}
            className="text-gray-400 hover:text-white transition-colors text-lg"
            title="Invite people"
          >
            +
          </button>
        </div>

        <div className="space-y-0.5">
          {workspace.members?.slice(0, 10).map((member) => (
            <div
              key={member.user.id}
              className="flex items-center gap-2 px-4 py-1 text-gray-300"
            >
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="truncate">
                {member.user.displayName}
                {member.user.id === user?.id && ' (you)'}
              </span>
              {member.role === 'ADMIN' && (
                <span className="text-xs text-gray-500">admin</span>
              )}
            </div>
          ))}
          {workspace.members?.length > 10 && (
            <div className="px-4 py-1 text-gray-500 text-sm">
              +{workspace.members.length - 10} more
            </div>
          )}
        </div>
      </div>

      {/* User Section */}
      <div className="relative border-t border-white/10 p-3">
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="flex items-center gap-2 w-full hover:bg-slack-hover rounded p-2 transition-colors"
        >
          <div className="w-8 h-8 rounded bg-slack-green flex items-center justify-center text-white font-medium">
            {user?.displayName?.charAt(0).toUpperCase()}
          </div>
          <span className="flex-1 text-left truncate text-white">
            {user?.displayName}
          </span>
        </button>

        {showUserMenu && (
          <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-gray-800 rounded-lg shadow-xl border border-gray-700 overflow-hidden">
            <button
              onClick={toggleNotifications}
              disabled={notificationsLoading}
              className="w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors flex items-center justify-between"
            >
              <span>Notifications</span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                notificationsEnabled ? 'bg-green-600' : 'bg-gray-600'
              }`}>
                {notificationsLoading ? '...' : notificationsEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
            <button
              onClick={() => {
                setShowUserMenu(false);
                navigate('/');
              }}
              className="w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors"
            >
              Switch Workspace
            </button>
            <button
              onClick={() => {
                setShowUserMenu(false);
                onLogout();
              }}
              className="w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors text-red-400"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Create a Channel
            </h3>
            <form onSubmit={handleCreateChannel}>
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-2">
                  Channel Name
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">#</span>
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={(e) =>
                      setNewChannelName(
                        e.target.value.toLowerCase().replace(/\s+/g, '-')
                      )
                    }
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-gray-900"
                    placeholder="new-channel"
                    required
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-gray-700">Make private</span>
                </label>
                <p className="text-sm text-gray-500 mt-1">
                  Private channels are only visible to invited members.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateChannel(false);
                    setNewChannelName('');
                    setIsPrivate(false);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sidebar;
