import { useState, useEffect } from 'react';
import { useParams, useNavigate, Routes, Route } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import Sidebar from '../channels/Sidebar';
import ChannelView from '../channels/ChannelView';
import ThreadView from '../threads/ThreadView';
import MobileNav from '../navigation/MobileNav';

function WorkspaceView() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { socket, joinWorkspace } = useSocket();
  const [workspace, setWorkspace] = useState(null);
  const [channels, setChannels] = useState([]);
  const [channelGroups, setChannelGroups] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState('home');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    loadWorkspace();
  }, [workspaceId]);

  useEffect(() => {
    if (socket) {
      joinWorkspace(workspaceId);

      socket.on('channel:created', handleChannelCreated);
      socket.on('channel:deleted', handleChannelDeleted);
      socket.on('channel:moved', handleChannelMoved);
      socket.on('member:joined', handleMemberJoined);
      socket.on('member:removed', handleMemberRemoved);
      socket.on('channelGroup:created', handleGroupCreated);
      socket.on('channelGroup:updated', handleGroupUpdated);
      socket.on('channelGroup:deleted', handleGroupDeleted);

      return () => {
        socket.off('channel:created', handleChannelCreated);
        socket.off('channel:deleted', handleChannelDeleted);
        socket.off('channel:moved', handleChannelMoved);
        socket.off('member:joined', handleMemberJoined);
        socket.off('member:removed', handleMemberRemoved);
        socket.off('channelGroup:created', handleGroupCreated);
        socket.off('channelGroup:updated', handleGroupUpdated);
        socket.off('channelGroup:deleted', handleGroupDeleted);
      };
    }
  }, [socket, workspaceId]);

  const loadWorkspace = async () => {
    try {
      const [workspaceData, channelsData, groupsData] = await Promise.all([
        api.getWorkspace(workspaceId),
        api.getChannels(workspaceId),
        api.getChannelGroups(workspaceId)
      ]);
      setWorkspace(workspaceData);
      setChannels(channelsData);
      setChannelGroups(groupsData);

      // Select first channel by default
      if (channelsData.length > 0 && !selectedChannel) {
        const generalChannel = channelsData.find(c => c.name === 'general');
        setSelectedChannel(generalChannel || channelsData[0]);
      }
    } catch (err) {
      console.error('Failed to load workspace:', err);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleChannelCreated = (channel) => {
    setChannels(prev => [...prev, { ...channel, unreadCount: 0 }]);
  };

  const handleChannelDeleted = ({ channelId }) => {
    setChannels(prev => prev.filter(c => c.id !== channelId));
    if (selectedChannel?.id === channelId) {
      const remaining = channels.filter(c => c.id !== channelId);
      setSelectedChannel(remaining[0] || null);
    }
  };

  const handleChannelMoved = ({ channelId, groupId, position }) => {
    setChannels(prev =>
      prev.map(c =>
        c.id === channelId ? { ...c, groupId, position } : c
      )
    );
  };

  const handleGroupCreated = (group) => {
    setChannelGroups(prev => [...prev, group]);
  };

  const handleGroupUpdated = (group) => {
    setChannelGroups(prev =>
      prev.map(g => (g.id === group.id ? group : g))
    );
  };

  const handleGroupDeleted = ({ groupId }) => {
    setChannelGroups(prev => prev.filter(g => g.id !== groupId));
    // Channels in this group will have groupId set to null by the backend
    setChannels(prev =>
      prev.map(c => (c.groupId === groupId ? { ...c, groupId: null } : c))
    );
  };

  const handleMemberJoined = ({ user: newUser }) => {
    setWorkspace(prev => ({
      ...prev,
      members: [...prev.members, { user: newUser, role: 'MEMBER' }]
    }));
  };

  const handleMemberRemoved = ({ userId }) => {
    if (userId === user.id) {
      navigate('/');
      return;
    }
    setWorkspace(prev => ({
      ...prev,
      members: prev.members.filter(m => m.user.id !== userId)
    }));
  };

  const handleCreateChannel = async (name, isPrivate, groupId = null) => {
    try {
      const channel = await api.createChannel(workspaceId, { name, isPrivate, groupId });
      // Channel will be added via socket event
      setSelectedChannel(channel);
    } catch (err) {
      console.error('Failed to create channel:', err);
    }
  };

  const handleCreateGroup = async (name) => {
    try {
      await api.createChannelGroup(workspaceId, name);
      // Group will be added via socket event
    } catch (err) {
      console.error('Failed to create group:', err);
    }
  };

  const updateChannelUnread = (channelId, count) => {
    setChannels(prev =>
      prev.map(c =>
        c.id === channelId ? { ...c, unreadCount: count } : c
      )
    );
  };

  const handleMobileTabChange = (tab) => {
    setMobileTab(tab);
    if (tab === 'home') {
      setSidebarOpen(true);
    } else if (tab === 'search') {
      setShowSearch(true);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const results = await api.searchMessages(workspaceId, searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const totalUnread = channels.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-slack-sidebar flex items-center justify-center">
        <div className="text-white text-xl">Loading workspace...</div>
      </div>
    );
  }

  if (!workspace) {
    return null;
  }

  return (
    <div className="h-screen flex bg-gray-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => {
            setSidebarOpen(false);
            setMobileTab('home');
          }}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        workspace={workspace}
        channels={channels}
        channelGroups={channelGroups}
        selectedChannel={selectedChannel}
        onSelectChannel={(channel) => {
          setSelectedChannel(channel);
          setSelectedThread(null);
          setSidebarOpen(false);
        }}
        onCreateChannel={handleCreateChannel}
        onCreateGroup={handleCreateGroup}
        onShowInvite={() => setShowInvite(true)}
        onLogout={logout}
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col pb-16 md:pb-0">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center gap-3 p-3 border-b border-gray-700 bg-gray-900">
          <button
            onClick={() => {
              setSidebarOpen(true);
              setMobileTab('home');
            }}
            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-white font-medium truncate flex-1">
            {selectedChannel ? `# ${selectedChannel.name}` : workspace.name}
          </span>
          <button
            onClick={() => setShowSearch(true)}
            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 flex">
          {/* Channel View */}
          <div className={`flex-1 flex flex-col ${selectedThread ? 'hidden md:flex' : ''}`}>
            {selectedChannel ? (
              <ChannelView
                channel={selectedChannel}
                workspace={workspace}
                onOpenThread={setSelectedThread}
                onUpdateUnread={(count) => updateChannelUnread(selectedChannel.id, count)}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                Select a channel to start chatting
              </div>
            )}
          </div>

          {/* Thread Panel */}
          {selectedThread && (
            <div className="w-full md:w-96 border-l border-gray-700 flex flex-col">
              <ThreadView
                message={selectedThread}
                channelId={selectedChannel?.id}
                onClose={() => setSelectedThread(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Invite to {workspace.name}</h3>
            <p className="text-gray-600 mb-4">Share this invite code with your bandmates:</p>
            <div className="bg-gray-100 rounded-lg p-4 text-center mb-4">
              <code className="text-2xl font-mono font-bold tracking-wider">
                {workspace.inviteCode}
              </code>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Or share this link:<br />
              <code className="text-xs break-all">
                {window.location.origin}/join/{workspace.inviteCode}
              </code>
            </p>
            <button
              onClick={() => setShowInvite(false)}
              className="w-full btn btn-primary"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Search Modal */}
      {showSearch && (
        <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
          <div className="flex items-center gap-3 p-3 border-b border-gray-700">
            <button
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="p-2 text-gray-300 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <form onSubmit={handleSearch} className="flex-1 flex">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-l-lg outline-none"
                autoFocus
              />
              <button
                type="submit"
                className="bg-slack-blue text-white px-4 py-2 rounded-r-lg"
              >
                Search
              </button>
            </form>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {searchResults.length === 0 ? (
              <div className="text-center text-gray-400 mt-8">
                {searchQuery ? 'No results found' : 'Search for messages across all channels'}
              </div>
            ) : (
              <div className="space-y-3">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      const channel = channels.find(c => c.id === result.channelId);
                      if (channel) {
                        setSelectedChannel(channel);
                        setShowSearch(false);
                        setSearchQuery('');
                        setSearchResults([]);
                      }
                    }}
                    className="w-full text-left bg-gray-800 rounded-lg p-3 hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                      <span>#{result.channel?.name}</span>
                      <span>•</span>
                      <span>{result.author?.displayName}</span>
                    </div>
                    <div className="text-white">{result.content}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DMs Panel (Coming Soon) */}
      {mobileTab === 'dms' && (
        <div className="fixed inset-0 bg-gray-900 z-40 flex flex-col md:hidden">
          <div className="flex items-center gap-3 p-3 border-b border-gray-700">
            <button
              onClick={() => setMobileTab('home')}
              className="p-2 text-gray-300 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="text-white font-medium">Direct Messages</span>
          </div>
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p>Direct messages coming soon!</p>
            </div>
          </div>
        </div>
      )}

      {/* Activity Panel (Coming Soon) */}
      {mobileTab === 'activity' && (
        <div className="fixed inset-0 bg-gray-900 z-40 flex flex-col md:hidden">
          <div className="flex items-center gap-3 p-3 border-b border-gray-700">
            <button
              onClick={() => setMobileTab('home')}
              className="p-2 text-gray-300 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="text-white font-medium">Activity</span>
          </div>
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p>Activity feed coming soon!</p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <MobileNav
        activeTab={mobileTab}
        onTabChange={handleMobileTabChange}
        unreadCount={totalUnread}
      />
    </div>
  );
}

export default WorkspaceView;
