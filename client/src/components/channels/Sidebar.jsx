import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { pushService } from '../../services/push';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import BandMemberForm from '../band/BandMembers/BandMemberForm';

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
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Email change
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [bandMembers, setBandMembers] = useState({ current: [], former: [], all: [] });
  const [bandMembersLoading, setBandMembersLoading] = useState(false);
  const [editingBandMember, setEditingBandMember] = useState(null);
  const [showBandMemberForm, setShowBandMemberForm] = useState(false);

  useEffect(() => {
    // Check if notifications are already enabled
    pushService.isSubscribed().then(setNotificationsEnabled);
  }, []);

  // ESC key to close settings modal
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && showSettings) {
        setShowSettings(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showSettings]);

  // Load band members when bandmembers tab is selected
  useEffect(() => {
    if (settingsTab === 'bandmembers' && workspace?.id) {
      loadBandMembers();
    }
  }, [settingsTab, workspace?.id]);

  const loadBandMembers = async () => {
    setBandMembersLoading(true);
    try {
      const data = await api.getBandMembers(workspace.id);
      setBandMembers(data);
    } catch (err) {
      setSettingsError(err.message);
    } finally {
      setBandMembersLoading(false);
    }
  };

  const handleSaveBandMember = async (data) => {
    setSettingsLoading(true);
    setSettingsError('');
    try {
      if (editingBandMember) {
        await api.updateBandMember(editingBandMember.id, data);
      } else {
        await api.createBandMember(workspace.id, data);
      }
      await loadBandMembers();
      setShowBandMemberForm(false);
      setEditingBandMember(null);
    } catch (err) {
      setSettingsError(err.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleDeleteBandMember = async (memberId) => {
    if (!confirm('Delete this band member?')) return;
    try {
      await api.deleteBandMember(memberId);
      await loadBandMembers();
    } catch (err) {
      setSettingsError(err.message);
    }
  };

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

  // Organize channels by group and sort alphabetically
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

    // Sort channels alphabetically within each group
    Object.keys(grouped).forEach(groupId => {
      grouped[groupId].sort((a, b) => a.name.localeCompare(b.name));
    });

    // Sort ungrouped channels alphabetically
    ungrouped.sort((a, b) => a.name.localeCompare(b.name));

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
        pb-20 md:pb-0
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
              className="text-gray-400 hover:text-white transition-colors text-sm px-2 py-1 min-w-[36px] min-h-[36px] flex items-center justify-center"
              title="Create group"
              aria-label="Create group"
            >
              📁
            </button>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="text-gray-400 hover:text-white transition-colors text-lg px-2 py-1 min-w-[36px] min-h-[36px] flex items-center justify-center"
              title="Create channel"
              aria-label="Create channel"
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
              className="w-full px-4 py-2.5 sm:py-1 flex items-center gap-1 text-gray-400 hover:text-white transition-colors text-sm min-h-[44px] sm:min-h-0"
              aria-expanded={!collapsedGroups[group.id]}
              aria-label={`${group.name} channel group`}
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
            onClick={() => onSelectBandView?.('availability')}
            className={`channel-item w-full ${activeBandView === 'availability' ? 'active' : ''}`}
          >
            <span className="text-gray-400">🗓️</span>
            <span className="flex-1 truncate">Availability</span>
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
          <button
            onClick={() => onSelectBandView?.('members')}
            className={`channel-item w-full ${activeBandView === 'members' ? 'active' : ''}`}
          >
            <span className="text-gray-400">👥</span>
            <span className="flex-1 truncate">Members</span>
          </button>
          <button
            onClick={() => onSelectBandView?.('contacts')}
            className={`channel-item w-full ${activeBandView === 'contacts' ? 'active' : ''}`}
          >
            <span className="text-gray-400">📇</span>
            <span className="flex-1 truncate">Contacts</span>
          </button>
          <button
            onClick={() => onSelectBandView?.('announcements')}
            className={`channel-item w-full ${activeBandView === 'announcements' ? 'active' : ''}`}
          >
            <span className="text-gray-400">📢</span>
            <span className="flex-1 truncate">Announcements</span>
          </button>
          <button
            onClick={() => onSelectBandView?.('polls')}
            className={`channel-item w-full ${activeBandView === 'polls' ? 'active' : ''}`}
          >
            <span className="text-gray-400">🗳️</span>
            <span className="flex-1 truncate">Polls</span>
          </button>
          <button
            onClick={() => onSelectBandView?.('medleys')}
            className={`channel-item w-full ${activeBandView === 'medleys' ? 'active' : ''}`}
          >
            <span className="text-gray-400">🎶</span>
            <span className="flex-1 truncate">Medleys</span>
          </button>
        </div>

        {/* Members Section */}
        <div className="mt-6 px-4 mb-2 flex items-center justify-between">
          <span className="text-sm font-medium uppercase tracking-wide text-gray-400">
            Members ({workspace.members?.length || 0})
          </span>
          {workspace.members?.find(m => m.user.id === user?.id)?.role === 'ADMIN' && (
            <button
              onClick={onShowInvite}
              className="text-gray-400 hover:text-white transition-colors text-lg px-2 py-1 min-w-[36px] min-h-[36px] flex items-center justify-center"
              title="Invite people"
              aria-label="Invite people"
            >
              +
            </button>
          )}
        </div>

        <div className="space-y-0.5">
          {workspace.members?.slice(0, 10).map((member) => (
            <button
              key={member.user.id}
              onClick={() => member.user.id !== user?.id && onStartDM?.(member.user.id)}
              className={`flex items-center gap-2 px-4 py-2.5 sm:py-1 text-gray-300 w-full text-left min-h-[44px] sm:min-h-0 ${
                member.user.id !== user?.id ? 'hover:bg-slack-hover cursor-pointer' : ''
              }`}
              disabled={member.user.id === user?.id}
              aria-label={`${member.user.displayName}${member.user.id === user?.id ? ' (you)' : ' - Start direct message'}`}
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
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-slack-green flex items-center justify-center text-white font-medium">
              {user?.displayName?.charAt(0).toUpperCase()}
            </div>
          )}
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
                setSettingsSuccess('');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setNewEmail('');
                setEmailPassword('');
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

      {/* Create Channel Modal - Portal to body to escape sidebar transform */}
      {showCreateChannel && createPortal(
        <div className="modal-backdrop">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h3>Create a Channel</h3>
              <button
                onClick={() => {
                  setShowCreateChannel(false);
                  setNewChannelName('');
                  setIsPrivate(false);
                  setSelectedGroupId('');
                }}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleCreateChannel}>
                <div className="mb-4">
                  <label className="modal-label">Channel Name</label>
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
                      className="modal-input flex-1"
                      placeholder="new-channel"
                      required
                    />
                  </div>
                </div>
                {channelGroups.length > 0 && (
                  <div className="mb-4">
                    <label className="modal-label">Group (optional)</label>
                    <select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      className="modal-input"
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
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-gray-300">Make private</span>
                  </label>
                  <p className="text-sm text-gray-500 mt-1 ml-6">
                    Private channels are only visible to invited members.
                  </p>
                </div>
                <div className="flex gap-2 justify-end pt-2">
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
                  <button type="submit" className="btn bg-green-600 hover:bg-green-700 text-white">
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Create Group Modal - Portal to body to escape sidebar transform */}
      {showCreateGroup && createPortal(
        <div className="modal-backdrop">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h3>Create a Channel Group</h3>
              <button
                onClick={() => {
                  setShowCreateGroup(false);
                  setNewGroupName('');
                }}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleCreateGroup}>
                <div className="mb-4">
                  <label className="modal-label">Group Name</label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="modal-input"
                    placeholder="e.g., Projects, Rehearsals, Admin"
                    required
                  />
                </div>
                <div className="flex gap-2 justify-end pt-2">
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
                  <button type="submit" className="btn bg-green-600 hover:bg-green-700 text-white">
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Settings Modal - Portal to body to escape sidebar transform */}
      {showSettings && createPortal(
        <div className="modal-backdrop">
          <div className="modal-content max-w-3xl max-h-[90vh] flex flex-col">
            <div className="modal-header">
              <h3>Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--color-modal-border)] overflow-x-auto">
              <button
                onClick={() => setSettingsTab('profile')}
                className={`px-4 py-3 font-medium whitespace-nowrap transition-colors ${
                  settingsTab === 'profile'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => setSettingsTab('theme')}
                className={`px-4 py-3 font-medium whitespace-nowrap transition-colors ${
                  settingsTab === 'theme'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Theme
              </button>
              {workspace.members?.find(m => m.user.id === user?.id)?.role === 'ADMIN' && (
                <>
                  <button
                    onClick={() => setSettingsTab('members')}
                    className={`px-4 py-3 font-medium whitespace-nowrap transition-colors ${
                      settingsTab === 'members'
                        ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Members
                  </button>
                  <button
                    onClick={() => setSettingsTab('bandmembers')}
                    className={`px-4 py-3 font-medium whitespace-nowrap transition-colors ${
                      settingsTab === 'bandmembers'
                        ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Band Members
                  </button>
                </>
              )}
              <button
                onClick={() => setSettingsTab('whatsnew')}
                className={`px-4 py-3 font-medium whitespace-nowrap transition-colors ${
                  settingsTab === 'whatsnew'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                What's New
              </button>
              <button
                onClick={() => setSettingsTab('about')}
                className={`px-4 py-3 font-medium whitespace-nowrap transition-colors ${
                  settingsTab === 'about'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                About
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {settingsError && (
                <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4">
                  {settingsError}
                </div>
              )}
              {settingsSuccess && (
                <div className="bg-green-900/50 border border-green-500 text-green-200 px-4 py-2 rounded-lg mb-4">
                  {settingsSuccess}
                </div>
              )}

              {/* Profile Tab */}
              {settingsTab === 'profile' && (
                <div className="space-y-6">
                  {/* Profile Info Section */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setSettingsLoading(true);
                      setSettingsError('');
                      setSettingsSuccess('');
                      try {
                        const updated = await api.updateProfile({
                          displayName: editDisplayName,
                          avatarUrl: editAvatarUrl || null
                        });
                        updateUser(updated);
                        setSettingsSuccess('Profile updated successfully');
                      } catch (err) {
                        setSettingsError(err.message);
                      } finally {
                        setSettingsLoading(false);
                      }
                    }}
                  >
                    <h4 className="text-lg font-medium text-white mb-4">Profile Information</h4>
                    <div className="mb-4">
                      <label className="modal-label">Display Name</label>
                      <input
                        type="text"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        className="modal-input"
                        required
                      />
                    </div>
                    <div className="mb-4">
                      <label className="modal-label">Avatar</label>
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          {editAvatarUrl ? (
                            <img
                              src={editAvatarUrl}
                              alt="Avatar preview"
                              className="w-16 h-16 rounded-full object-cover border-2 border-[var(--color-modal-border)]"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white text-2xl font-medium">
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
                          <p className="text-xs text-gray-400 mt-2">
                            Max 10MB. JPG, PNG, GIF, WebP.
                          </p>
                          {editAvatarUrl && (
                            <button
                              type="button"
                              onClick={() => setEditAvatarUrl('')}
                              className="text-xs text-red-400 hover:text-red-300 mt-1"
                            >
                              Remove avatar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={settingsLoading}
                        className="btn bg-green-600 hover:bg-green-700 text-white"
                      >
                        {settingsLoading ? 'Saving...' : 'Update Profile'}
                      </button>
                    </div>
                  </form>

                  {/* Divider */}
                  <div className="border-t border-[var(--color-modal-border)]" />

                  {/* Email Section */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setSettingsLoading(true);
                      setSettingsError('');
                      setSettingsSuccess('');
                      try {
                        await api.requestEmailChange(newEmail, emailPassword);
                        setSettingsSuccess('Verification email sent to ' + newEmail);
                        setNewEmail('');
                        setEmailPassword('');
                      } catch (err) {
                        setSettingsError(err.message);
                      } finally {
                        setSettingsLoading(false);
                      }
                    }}
                  >
                    <h4 className="text-lg font-medium text-white mb-4">Change Email</h4>
                    <p className="text-sm text-gray-400 mb-4">
                      Current email: <span className="text-white">{user?.email}</span>
                    </p>
                    <div className="mb-4">
                      <label className="modal-label">New Email Address</label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="modal-input"
                        placeholder="new@email.com"
                        required
                      />
                    </div>
                    <div className="mb-4">
                      <label className="modal-label">Current Password</label>
                      <input
                        type="password"
                        value={emailPassword}
                        onChange={(e) => setEmailPassword(e.target.value)}
                        className="modal-input"
                        placeholder="Enter your password to confirm"
                        required
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={settingsLoading || !newEmail}
                        className="btn bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                      >
                        {settingsLoading ? 'Sending...' : 'Send Verification Email'}
                      </button>
                    </div>
                  </form>

                  {/* Divider */}
                  <div className="border-t border-[var(--color-modal-border)]" />

                  {/* Password Section */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (newPassword !== confirmPassword) {
                        setSettingsError('New passwords do not match');
                        return;
                      }
                      setSettingsLoading(true);
                      setSettingsError('');
                      setSettingsSuccess('');
                      try {
                        await api.changePassword(currentPassword, newPassword);
                        setSettingsSuccess('Password changed successfully');
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                      } catch (err) {
                        setSettingsError(err.message);
                      } finally {
                        setSettingsLoading(false);
                      }
                    }}
                  >
                    <h4 className="text-lg font-medium text-white mb-4">Change Password</h4>
                    <div className="mb-4">
                      <label className="modal-label">Current Password</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="modal-input"
                        placeholder="Enter current password"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Leave blank if you signed up with Google and haven't set a password
                      </p>
                    </div>
                    <div className="mb-4">
                      <label className="modal-label">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="modal-input"
                        placeholder="At least 6 characters"
                        minLength={6}
                        required
                      />
                    </div>
                    <div className="mb-4">
                      <label className="modal-label">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="modal-input"
                        placeholder="Confirm new password"
                        required
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={settingsLoading || !newPassword || !confirmPassword}
                        className="btn bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                      >
                        {settingsLoading ? 'Changing...' : 'Change Password'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Theme Tab */}
              {settingsTab === 'theme' && (
                <div>
                  <p className="text-gray-400 mb-4">Choose a theme for your sidebar</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {Object.entries(themes).map(([id, theme]) => (
                      <button
                        key={id}
                        onClick={() => setTheme(id)}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          currentTheme === id
                            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30'
                            : 'border-[var(--color-modal-border)] hover:border-gray-500'
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
                        <div className="text-xs font-medium text-gray-300">
                          {theme.name}
                        </div>
                        {currentTheme === id && (
                          <div className="text-xs text-[var(--color-primary)] mt-1">Active</div>
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
                      className="flex items-center justify-between p-3 bg-[var(--color-modal-card)] rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-[var(--color-accent)] flex items-center justify-center text-white font-medium">
                          {member.user.displayName?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-white">
                            {member.user.displayName}
                            {member.user.id === user?.id && (
                              <span className="text-gray-400 ml-1">(you)</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-400">{member.user.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {member.user.id !== user?.id && (
                          <button
                            onClick={async () => {
                              const newPassword = prompt(`Enter new password for ${member.user.displayName} (min 6 characters):`);
                              if (!newPassword) return;
                              if (newPassword.length < 6) {
                                alert('Password must be at least 6 characters');
                                return;
                              }
                              try {
                                await api.adminResetPassword(workspace.id, member.user.id, newPassword);
                                alert(`Password reset for ${member.user.displayName}`);
                              } catch (err) {
                                alert(err.message);
                              }
                            }}
                            className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1"
                          >
                            Reset PW
                          </button>
                        )}
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
                          className="modal-input w-auto"
                        >
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Band Members Tab (Admin only) */}
              {settingsTab === 'bandmembers' && (
                <div>
                  {showBandMemberForm ? (
                    <div>
                      <h4 className="text-lg font-medium text-white mb-4">
                        {editingBandMember ? 'Edit Band Member' : 'Add Band Member'}
                      </h4>
                      <BandMemberForm
                        member={editingBandMember}
                        onSave={handleSaveBandMember}
                        onCancel={() => {
                          setShowBandMemberForm(false);
                          setEditingBandMember(null);
                        }}
                        loading={settingsLoading}
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-gray-400">Manage band member history for the timeline</p>
                        <button
                          onClick={() => setShowBandMemberForm(true)}
                          className="btn bg-green-600 hover:bg-green-700 text-white"
                        >
                          + Add Member
                        </button>
                      </div>

                      {bandMembersLoading ? (
                        <div className="text-center py-8 text-gray-400">Loading...</div>
                      ) : (
                        <div className="space-y-4">
                          {(() => {
                            // Separate guests from regular members
                            const currentRegular = bandMembers.current.filter(m => !m.isGuest);
                            const formerRegular = bandMembers.former.filter(m => !m.isGuest);
                            const guests = bandMembers.all.filter(m => m.isGuest);
                            // Find incomplete members (no stints, not guests) - these are orphaned records
                            const currentIds = new Set(bandMembers.current.map(m => m.id));
                            const formerIds = new Set(bandMembers.former.map(m => m.id));
                            const incomplete = bandMembers.all.filter(m =>
                              !m.isGuest && !currentIds.has(m.id) && !formerIds.has(m.id)
                            );
                            const hasMembers = currentRegular.length > 0 || formerRegular.length > 0 || guests.length > 0 || incomplete.length > 0;

                            return (
                              <>
                                {/* Current Members */}
                                {currentRegular.length > 0 && (
                                  <div>
                                    <h5 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
                                      Current Members ({currentRegular.length})
                                    </h5>
                                    <div className="space-y-2">
                                      {currentRegular.map((member) => {
                                        const instruments = [...new Set(member.stints?.flatMap(s => s.instruments || (s.instrument ? [s.instrument] : [])) || [])];
                                        const earliestYear = member.stints?.length > 0
                                          ? Math.min(...member.stints.map(s => new Date(s.startDate).getFullYear()))
                                          : null;
                                        return (
                                        <div
                                          key={member.id}
                                          className="flex items-center justify-between p-3 bg-[var(--color-modal-card)] rounded-lg"
                                        >
                                          <div className="flex items-center gap-3">
                                            {member.imageUrl ? (
                                              <img src={member.imageUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                            ) : (
                                              <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-medium flex-shrink-0">
                                                {member.name?.charAt(0).toUpperCase()}
                                              </div>
                                            )}
                                            <div>
                                              <div className="font-medium text-white">{member.name}</div>
                                              <div className="text-sm text-gray-400">
                                                {instruments.length > 0 ? instruments.join(', ') : 'Unknown'} {earliestYear && `• Since ${earliestYear}`}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => {
                                                setEditingBandMember(member);
                                                setShowBandMemberForm(true);
                                              }}
                                              className="text-blue-400 hover:text-blue-300 text-sm"
                                            >
                                              Edit
                                            </button>
                                            <button
                                              onClick={() => handleDeleteBandMember(member.id)}
                                              className="text-red-400 hover:text-red-300 text-sm"
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Former Members */}
                                {formerRegular.length > 0 && (
                                  <div>
                                    <h5 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
                                      Former Members ({formerRegular.length})
                                    </h5>
                                    <div className="space-y-2">
                                      {formerRegular.map((member) => {
                                        const instruments = [...new Set(member.stints?.flatMap(s => s.instruments || (s.instrument ? [s.instrument] : [])) || [])];
                                        const years = member.stints?.length > 0 ? (() => {
                                          const starts = member.stints.map(s => new Date(s.startDate).getFullYear());
                                          const ends = member.stints.filter(s => s.endDate).map(s => new Date(s.endDate).getFullYear());
                                          const minYear = Math.min(...starts);
                                          const maxYear = ends.length > 0 ? Math.max(...ends) : minYear;
                                          return minYear === maxYear ? `${minYear}` : `${minYear}–${maxYear}`;
                                        })() : '';
                                        return (
                                        <div
                                          key={member.id}
                                          className="flex items-center justify-between p-3 bg-[var(--color-modal-card)] rounded-lg opacity-75"
                                        >
                                          <div className="flex items-center gap-3">
                                            {member.imageUrl ? (
                                              <img src={member.imageUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                            ) : (
                                              <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-medium flex-shrink-0">
                                                {member.name?.charAt(0).toUpperCase()}
                                              </div>
                                            )}
                                            <div>
                                              <div className="font-medium text-white">{member.name}</div>
                                              <div className="text-sm text-gray-400">
                                                {instruments.length > 0 ? instruments.join(', ') : 'Unknown'} {years && `• ${years}`}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => {
                                                setEditingBandMember(member);
                                                setShowBandMemberForm(true);
                                              }}
                                              className="text-blue-400 hover:text-blue-300 text-sm"
                                            >
                                              Edit
                                            </button>
                                            <button
                                              onClick={() => handleDeleteBandMember(member.id)}
                                              className="text-red-400 hover:text-red-300 text-sm"
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Guest Musicians */}
                                {guests.length > 0 && (
                                  <div>
                                    <h5 className="text-sm font-medium text-purple-400 uppercase tracking-wide mb-2">
                                      Guest Musicians ({guests.length})
                                    </h5>
                                    <div className="space-y-2">
                                      {guests.map((member) => {
                                        const instruments = [...new Set(member.stints?.flatMap(s => s.instruments || (s.instrument ? [s.instrument] : [])) || [])];
                                        return (
                                        <div
                                          key={member.id}
                                          className="flex items-center justify-between p-3 bg-purple-900/20 border border-purple-800/30 rounded-lg"
                                        >
                                          <div className="flex items-center gap-3">
                                            {member.imageUrl ? (
                                              <img src={member.imageUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                            ) : (
                                              <div className="w-10 h-10 rounded-full bg-purple-700 flex items-center justify-center text-white font-medium flex-shrink-0">
                                                {member.name?.charAt(0).toUpperCase()}
                                              </div>
                                            )}
                                            <div>
                                              <div className="font-medium text-white">{member.name}</div>
                                              <div className="text-sm text-purple-300">
                                                {instruments.length > 0 ? instruments.join(', ') : 'Guest musician'}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => {
                                                setEditingBandMember(member);
                                                setShowBandMemberForm(true);
                                              }}
                                              className="text-blue-400 hover:text-blue-300 text-sm"
                                            >
                                              Edit
                                            </button>
                                            <button
                                              onClick={() => handleDeleteBandMember(member.id)}
                                              className="text-red-400 hover:text-red-300 text-sm"
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Incomplete/Orphaned Members (no stints defined) */}
                                {incomplete.length > 0 && (
                                  <div>
                                    <h5 className="text-sm font-medium text-red-400 uppercase tracking-wide mb-2">
                                      Incomplete Members ({incomplete.length})
                                    </h5>
                                    <p className="text-xs text-gray-500 mb-2">These members have no instruments/dates. Edit or delete them.</p>
                                    <div className="space-y-2">
                                      {incomplete.map((member) => (
                                        <div
                                          key={member.id}
                                          className="flex items-center justify-between p-3 bg-red-900/20 border border-red-800/30 rounded-lg"
                                        >
                                          <div className="flex items-center gap-3">
                                            {member.imageUrl ? (
                                              <img src={member.imageUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                            ) : (
                                              <div className="w-10 h-10 rounded-full bg-red-700 flex items-center justify-center text-white font-medium flex-shrink-0">
                                                {member.name?.charAt(0).toUpperCase()}
                                              </div>
                                            )}
                                            <div>
                                              <div className="font-medium text-white">{member.name}</div>
                                              <div className="text-sm text-red-300">No instruments defined</div>
                                            </div>
                                          </div>
                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => {
                                                setEditingBandMember(member);
                                                setShowBandMemberForm(true);
                                              }}
                                              className="text-blue-400 hover:text-blue-300 text-sm"
                                            >
                                              Edit
                                            </button>
                                            <button
                                              onClick={() => handleDeleteBandMember(member.id)}
                                              className="text-red-400 hover:text-red-300 text-sm"
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {!hasMembers && (
                                  <div className="text-center py-8 text-gray-400">
                                    <p className="mb-2">No band members added yet</p>
                                    <p className="text-sm">Add members to see them on the Band Members timeline</p>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* What's New Tab */}
              {settingsTab === 'whatsnew' && (
                <div className="space-y-4">
                  <div className="border-b border-[var(--color-modal-border)] pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded">NEW</span>
                      <span className="text-sm text-gray-500">v1.01.22</span>
                    </div>
                    <h4 className="font-medium text-white mb-1">Bulk Song Import with Metadata</h4>
                    <p className="text-sm text-gray-400">
                      Import multiple songs at once! Paste a list of songs and we'll automatically fetch BPM, key, and duration.
                    </p>
                  </div>
                  <div className="border-b border-[var(--color-modal-border)] pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-500">v1.01.20</span>
                    </div>
                    <h4 className="font-medium text-white mb-1">MC Sections in Setlists</h4>
                    <p className="text-sm text-gray-400">
                      Add talking/banter breaks between songs in your setlists with customizable durations.
                    </p>
                  </div>
                  <div className="border-b border-[var(--color-modal-border)] pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-500">v1.01.18</span>
                    </div>
                    <h4 className="font-medium text-white mb-1">12 New Themes</h4>
                    <p className="text-sm text-gray-400">
                      Customize your sidebar with 12 beautiful color themes including Aubergine, Ocean, Forest, and more.
                    </p>
                  </div>
                  <div className="pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-500">v1.01.15</span>
                    </div>
                    <h4 className="font-medium text-white mb-1">Band Features</h4>
                    <p className="text-sm text-gray-400">
                      Songs, Setlists, Calendar, and Stats - everything you need to organize your band.
                    </p>
                  </div>
                </div>
              )}

              {/* About Tab */}
              {settingsTab === 'about' && (
                <div className="space-y-6">
                  <div className="text-center py-4">
                    <img
                      src="/logo.jpg"
                      alt="BandChat"
                      className="w-20 h-20 mx-auto mb-3 rounded-xl shadow-lg"
                    />
                    <h3 className="text-xl font-bold text-white">BandChat</h3>
                    <p className="text-gray-400">v{__APP_VERSION__}</p>
                  </div>

                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4">
                    <p className="text-gray-300 text-sm leading-relaxed">
                      BandChat is a communication and organization app built specifically for bands.
                      Chat with your bandmates, manage your song library, create setlists, and track your gigs - all in one place.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium text-white">Features</h4>
                    <ul className="text-sm text-gray-300 space-y-2">
                      <li className="flex items-center gap-2">
                        <span className="text-[var(--color-primary)]">✓</span>
                        Real-time messaging with threads and reactions
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-[var(--color-primary)]">✓</span>
                        Song database with BPM, key, and duration
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-[var(--color-primary)]">✓</span>
                        Drag-and-drop setlist builder
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-[var(--color-primary)]">✓</span>
                        Gig calendar and statistics
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-[var(--color-primary)]">✓</span>
                        File sharing and image uploads
                      </li>
                    </ul>
                  </div>

                  <div className="border-t border-[var(--color-modal-border)] pt-4">
                    <h4 className="font-medium text-white mb-2">Credits</h4>
                    <p className="text-sm text-gray-400">
                      Song metadata (BPM, key) provided by{' '}
                      <a
                        href="https://getsongbpm.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        GetSongBPM.com
                      </a>
                    </p>
                  </div>

                  <div className="text-center text-xs text-gray-500 pt-4">
                    Made with ♥ for musicians everywhere
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Sidebar;
