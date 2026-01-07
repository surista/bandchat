import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

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
  user
}) {
  const navigate = useNavigate();
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});

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
    </div>
  );
}

export default Sidebar;
