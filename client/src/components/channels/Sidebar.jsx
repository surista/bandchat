import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { pushService } from '../../services/push';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

function Sidebar({
  workspace,
  channels,
  channelGroups,
  selectedChannel,
  onSelectChannel,
  onCreateChannel,
  onCreateGroup,
  onShowInvite,
  onLogout,
  user,
  isOpen,
  onClose,
  directMessages = [],
  onStartDM,
  activeBandView,
  onSelectBandView,
  width = 256,
  onResizeStart
}) {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const { currentTheme, setTheme, themes } = useTheme();
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

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

  // Organize channels by group
  const { groupedChannels, ungroupedChannels } = useMemo(() => {
    const grouped = {};
    const ungrouped = [];

    channels.forEach(channel => {
      if (channel.groupId) {
        if (!grouped[channel.groupId]) {
          grouped[channel.groupId] = [];
        }
        grouped[channel.groupId].push(channel);
      } else {
        ungrouped.push(channel);
      }
    });

    return { groupedChannels: grouped, ungroupedChannels: ungrouped };
  }, [channels]);

  const handleCreateChannel = (e) => {
    e.preventDefault();
    if (newChannelName.trim()) {
      onCreateChannel(newChannelName, isPrivate, selectedGroupId || null);
      setShowCreateChannel(false);
      setNewChannelName('');
      setIsPrivate(false);
      setSelectedGroupId('');
    }
  };

  const handleCreateGroup = (e) => {
    e.preventDefault();
    if (newGroupName.trim()) {
      onCreateGroup(newGroupName);
      setShowCreateGroup(false);
      setNewGroupName('');
    }
  };

  const toggleGroupCollapse = (groupId) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setSettingsError('File size must be less than 10MB');
      return;
    }

    setAvatarUploading(true);
    setSettingsError('');
    try {
      const result = await api.uploadFile(file);
      setEditAvatarUrl(result.url);
    } catch (err) {
      setSettingsError(err.message || 'Failed to upload avatar');
    } finally {
      setAvatarUploading(false);
    }
  };

  const renderChannel = (channel) => (
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
  );

  return (
    <div
      className={`
        h-full bg-slack-sidebar flex flex-col text-gray-300
        fixed md:relative inset-y-0 left-0 z-50
        transform transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}
      style={{ width: `${width}px` }}
    >
      {/* Resize handle */}
      <div
        className="hidden md:block absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-10"
        onMouseDown={(e) => {
          e.preventDefault();
          onResizeStart?.();
        }}
      />
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
          <div className="flex gap-1">
            <button
              onClick={() => setShowCreateGroup(true)}
              className="text-gray-400 hover:text-white transition-colors text-xs px-1"
              title="Create group"
            >
              📁
            </button>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="text-gray-400 hover:text-white transition-colors text-lg"
              title="Create channel"
            >
              +
            </button>
          </div>
        </div>

        {/* Channel Groups */}
        {channelGroups.map((group) => (
          <div key={group.id} className="mb-2">
            <button
              onClick={() => toggleGroupCollapse(group.id)}
              className="w-full px-4 py-1 flex items-center gap-1 text-gray-400 hover:text-white transition-colors text-sm"
            >
              <span className={`transform transition-transform ${collapsedGroups[group.id] ? '' : 'rotate-90'}`}>
                ▶
              </span>
              <span className="font-medium uppercase tracking-wide truncate">
                {group.name}
              </span>
              <span className="text-xs text-gray-500 ml-auto">
                {groupedChannels[group.id]?.length || 0}
              </span>
            </button>
            {!collapsedGroups[group.id] && (
              <div className="space-y-0.5 ml-2">
                {groupedChannels[group.id]?.map(renderChannel)}
              </div>
            )}
          </div>
        ))}

        {/* Ungrouped Channels */}
        {ungroupedChannels.length > 0 && (
          <div className="space-y-0.5">
            {channelGroups.length > 0 && (
              <div className="px-4 py-1 text-xs text-gray-500 uppercase tracking-wide">
                Other Channels
              </div>
            )}
            {ungroupedChannels.map(renderChannel)}
          </div>
        )}

        {/* Direct Messages Section */}
        <div className="mt-6 px-4 mb-2 flex items-center justify-between">
          <span className="text-sm font-medium uppercase tracking-wide text-gray-400">
            Direct Messages
          </span>
        </div>

        <div className="space-y-0.5">
          {directMessages.map((dm) => {
            const displayName = dm.otherMembers?.length > 0
              ? dm.otherMembers.map(m => m.displayName).join(', ')
              : 'Unknown';
            const initial = dm.otherMembers?.[0]?.displayName?.charAt(0).toUpperCase() || '?';

            return (
              <button
                key={dm.id}
                onClick={() => onSelectChannel(dm)}
                className={`channel-item w-full ${
                  selectedChannel?.id === dm.id ? 'active' : ''
                }`}
              >
                <div className="w-5 h-5 rounded bg-gray-600 flex items-center justify-center text-xs text-white flex-shrink-0">
                  {initial}
                </div>
                <span className="flex-1 truncate">{displayName}</span>
                {dm.unreadCount > 0 && (
                  <span className="bg-slack-red text-white text-xs px-1.5 py-0.5 rounded-full">
                    {dm.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
          {directMessages.length === 0 && (
            <div className="px-4 py-1 text-gray-500 text-sm italic">
              Click a member to start a DM
            </div>
          )}
        </div>

        {/* Band Section */}
        <div className="mt-6 px-4 mb-2">
          <span className="text-sm font-medium uppercase tracking-wide text-gray-400">
            Band
          </span>
        </div>
        <div className="space-y-0.5">
          <button
            onClick={() => onSelectBandView?.('songs')}
            className={`channel-item w-full ${activeBandView === 'songs' ? 'active' : ''}`}
          >
            <span className="text-gray-400">🎵</span>
            <span className="flex-1 truncate">Songs</span>
          </button>
          <button
            onClick={() => onSelectBandView?.('setlists')}
            className={`channel-item w-full ${activeBandView === 'setlists' ? 'active' : ''}`}
          >
            <span className="text-gray-400">📋</span>
            <span className="flex-1 truncate">Setlists</span>
          </button>
          <button
            onClick={() => onSelectBandView?.('calendar')}
            className={`channel-item w-full ${activeBandView === 'calendar' ? 'active' : ''}`}
          >
            <span className="text-gray-400">📅</span>
            <span className="flex-1 truncate">Calendar</span>
          </button>
          <button
            onClick={() => onSelectBandView?.('stats')}
            className={`channel-item w-full ${activeBandView === 'stats' ? 'active' : ''}`}
          >
            <span className="text-gray-400">📊</span>
            <span className="flex-1 truncate">Stats</span>
          </button>
          <button
            onClick={() => onSelectBandView?.('archive')}
            className={`channel-item w-full ${activeBandView === 'archive' ? 'active' : ''}`}
          >
            <span className="text-gray-400">📸</span>
            <span className="flex-1 truncate">Gig Archive</span>
          </button>
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
            <button
              key={member.user.id}
              onClick={() => member.user.id !== user?.id && onStartDM?.(member.user.id)}
              className={`flex items-center gap-2 px-4 py-1 text-gray-300 w-full text-left ${
                member.user.id !== user?.id ? 'hover:bg-slack-hover cursor-pointer' : ''
              }`}
              disabled={member.user.id === user?.id}
            >
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="truncate flex-1">
                {member.user.displayName}
                {member.user.id === user?.id && ' (you)'}
              </span>
              {member.role === 'ADMIN' && (
                <span className="text-xs text-gray-500">admin</span>
              )}
            </button>
          ))}
          {workspace.members?.length > 10 && (
            <div className="px-4 py-1 text-gray-500 text-sm">
              +{workspace.members.length - 10} more
            </div>
          )}
        </div>
      </div>

      {/* User Section */}
      <div className="flex-shrink-0 relative border-t border-white/10 p-3">
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

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-white/10 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>v{__APP_VERSION__}</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSettingsTab('about');
                setShowSettings(true);
              }}
              className="hover:text-gray-300 transition-colors"
            >
              About
            </button>
            <button
              onClick={() => {
                setSettingsTab('whatsnew');
                setShowSettings(true);
              }}
              className="hover:text-gray-300 transition-colors"
            >
              What's New
            </button>
            <button
              onClick={() => {
                setEditDisplayName(user?.displayName || '');
                setEditAvatarUrl(user?.avatarUrl || '');
                setSettingsError('');
                setSettingsTab('profile');
                setShowSettings(true);
              }}
              className="hover:text-gray-300 transition-colors"
            >
              Settings
            </button>
          </div>
        </div>
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
              {channelGroups.length > 0 && (
                <div className="mb-4">
                  <label className="block text-gray-700 font-medium mb-2">
                    Group (optional)
                  </label>
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  >
                    <option value="">No group</option>
                    {channelGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                    setSelectedGroupId('');
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

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Create a Channel Group
            </h3>
            <form onSubmit={handleCreateGroup}>
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-2">
                  Group Name
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="e.g., Projects, Rehearsals, Admin"
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateGroup(false);
                    setNewGroupName('');
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

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-xl font-bold text-gray-900">Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b overflow-x-auto">
              <button
                onClick={() => setSettingsTab('profile')}
                className={`px-4 py-2 font-medium whitespace-nowrap ${
                  settingsTab === 'profile'
                    ? 'text-slack-purple border-b-2 border-slack-purple'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => setSettingsTab('theme')}
                className={`px-4 py-2 font-medium whitespace-nowrap ${
                  settingsTab === 'theme'
                    ? 'text-slack-purple border-b-2 border-slack-purple'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Theme
              </button>
              {workspace.members?.find(m => m.user.id === user?.id)?.role === 'ADMIN' && (
                <button
                  onClick={() => setSettingsTab('members')}
                  className={`px-4 py-2 font-medium whitespace-nowrap ${
                    settingsTab === 'members'
                      ? 'text-slack-purple border-b-2 border-slack-purple'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Members
                </button>
              )}
              <button
                onClick={() => setSettingsTab('whatsnew')}
                className={`px-4 py-2 font-medium whitespace-nowrap ${
                  settingsTab === 'whatsnew'
                    ? 'text-slack-purple border-b-2 border-slack-purple'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                What's New
              </button>
              <button
                onClick={() => setSettingsTab('about')}
                className={`px-4 py-2 font-medium whitespace-nowrap ${
                  settingsTab === 'about'
                    ? 'text-slack-purple border-b-2 border-slack-purple'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                About
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {settingsError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4">
                  {settingsError}
                </div>
              )}

              {/* Profile Tab */}
              {settingsTab === 'profile' && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSettingsLoading(true);
                    setSettingsError('');
                    try {
                      const updated = await api.updateProfile({
                        displayName: editDisplayName,
                        avatarUrl: editAvatarUrl || null
                      });
                      updateUser(updated);
                      setShowSettings(false);
                    } catch (err) {
                      setSettingsError(err.message);
                    } finally {
                      setSettingsLoading(false);
                    }
                  }}
                >
                  <div className="mb-4">
                    <label className="block text-gray-700 font-medium mb-2">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                      required
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-gray-700 font-medium mb-2">
                      Avatar
                    </label>
                    <div className="flex items-start gap-4">
                      {/* Avatar Preview */}
                      <div className="flex-shrink-0">
                        {editAvatarUrl ? (
                          <img
                            src={editAvatarUrl}
                            alt="Avatar preview"
                            className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-slack-purple flex items-center justify-center text-white text-2xl font-medium">
                            {editDisplayName?.charAt(0).toUpperCase() || '?'}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="block">
                          <span className="btn btn-secondary cursor-pointer inline-block">
                            {avatarUploading ? 'Uploading...' : 'Upload Photo'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            disabled={avatarUploading}
                            className="hidden"
                          />
                        </label>
                        <p className="text-xs text-gray-500 mt-2">
                          Max 10MB. JPG, PNG, GIF, WebP.
                        </p>
                        {editAvatarUrl && (
                          <button
                            type="button"
                            onClick={() => setEditAvatarUrl('')}
                            className="text-xs text-red-500 hover:text-red-700 mt-1"
                          >
                            Remove avatar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowSettings(false)}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={settingsLoading}
                      className="btn btn-primary"
                    >
                      {settingsLoading ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </form>
              )}

              {/* Theme Tab */}
              {settingsTab === 'theme' && (
                <div>
                  <p className="text-gray-600 mb-4">Choose a theme for your sidebar</p>
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(themes).map(([id, theme]) => (
                      <button
                        key={id}
                        onClick={() => setTheme(id)}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          currentTheme === id
                            ? 'border-blue-500 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex gap-1 mb-2">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: theme.sidebar }}
                          />
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: theme.sidebarActive }}
                          />
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: theme.primary }}
                          />
                        </div>
                        <div className="text-xs font-medium text-gray-700">
                          {theme.name}
                        </div>
                        {currentTheme === id && (
                          <div className="text-xs text-blue-500 mt-1">Active</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Members Tab (Admin only) */}
              {settingsTab === 'members' && (
                <div className="space-y-2">
                  {workspace.members?.map((member) => (
                    <div
                      key={member.user.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-slack-purple flex items-center justify-center text-white font-medium">
                          {member.user.displayName?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {member.user.displayName}
                            {member.user.id === user?.id && (
                              <span className="text-gray-500 ml-1">(you)</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">{member.user.email}</div>
                        </div>
                      </div>
                      <select
                        value={member.role}
                        onChange={async (e) => {
                          try {
                            await api.updateMemberRole(
                              workspace.id,
                              member.user.id,
                              e.target.value
                            );
                            window.location.reload();
                          } catch (err) {
                            alert(err.message);
                          }
                        }}
                        className="px-2 py-1 border border-gray-300 rounded text-gray-900"
                      >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* What's New Tab */}
              {settingsTab === 'whatsnew' && (
                <div className="space-y-4">
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">NEW</span>
                      <span className="text-sm text-gray-500">v1.01.22</span>
                    </div>
                    <h4 className="font-medium text-gray-900 mb-1">Bulk Song Import with Metadata</h4>
                    <p className="text-sm text-gray-600">
                      Import multiple songs at once! Paste a list of songs and we'll automatically fetch BPM, key, and duration.
                    </p>
                  </div>
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-500">v1.01.20</span>
                    </div>
                    <h4 className="font-medium text-gray-900 mb-1">MC Sections in Setlists</h4>
                    <p className="text-sm text-gray-600">
                      Add talking/banter breaks between songs in your setlists with customizable durations.
                    </p>
                  </div>
                  <div className="border-b border-gray-200 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-500">v1.01.18</span>
                    </div>
                    <h4 className="font-medium text-gray-900 mb-1">12 New Themes</h4>
                    <p className="text-sm text-gray-600">
                      Customize your sidebar with 12 beautiful color themes including Aubergine, Ocean, Forest, and more.
                    </p>
                  </div>
                  <div className="pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-500">v1.01.15</span>
                    </div>
                    <h4 className="font-medium text-gray-900 mb-1">Band Features</h4>
                    <p className="text-sm text-gray-600">
                      Songs, Setlists, Calendar, and Stats - everything you need to organize your band.
                    </p>
                  </div>
                </div>
              )}

              {/* About Tab */}
              {settingsTab === 'about' && (
                <div className="space-y-6">
                  <div className="text-center py-4">
                    <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl flex items-center justify-center">
                      <span className="text-3xl">🎸</span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">BandChat</h3>
                    <p className="text-gray-500">v{__APP_VERSION__}</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-gray-700 text-sm leading-relaxed">
                      BandChat is a communication and organization app built specifically for bands.
                      Chat with your bandmates, manage your song library, create setlists, and track your gigs - all in one place.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900">Features</h4>
                    <ul className="text-sm text-gray-600 space-y-2">
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        Real-time messaging with threads and reactions
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        Song database with BPM, key, and duration
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        Drag-and-drop setlist builder
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        Gig calendar and statistics
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-green-500">✓</span>
                        File sharing and image uploads
                      </li>
                    </ul>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="font-medium text-gray-900 mb-2">Credits</h4>
                    <p className="text-sm text-gray-600">
                      Song metadata (BPM, key) provided by{' '}
                      <a
                        href="https://getsongbpm.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 hover:text-purple-700 underline"
                      >
                        GetSongBPM.com
                      </a>
                    </p>
                  </div>

                  <div className="text-center text-xs text-gray-400 pt-4">
                    Made with ♥ for musicians everywhere
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sidebar;
