import { useState, useEffect } from 'react';
import { useParams, useNavigate, Routes, Route } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import Sidebar from '../channels/Sidebar';
import ChannelView from '../channels/ChannelView';
import ThreadView from '../threads/ThreadView';
import MobileNav from '../navigation/MobileNav';
import SongList from '../band/SongList';
import SetlistList from '../band/SetlistList';
import GigCalendar from '../band/GigCalendar';
import AvailabilityCalendar from '../band/AvailabilityCalendar';
import GigStats from '../band/GigStats';
import GigArchive from '../band/GigArchive';
import BandMembersList from '../band/BandMembers/BandMembersList';

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
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteExpiresIn, setInviteExpiresIn] = useState(24);
  const [inviteMaxUses, setInviteMaxUses] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState('home');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [activeBandView, setActiveBandView] = useState(() => {
    const saved = localStorage.getItem(`bandView:${workspaceId}`);
    return saved || null;
  });
  const [bandViewKey, setBandViewKey] = useState(0);
  const [pendingChannelId, setPendingChannelId] = useState(() => {
    return localStorage.getItem(`selectedChannel:${workspaceId}`) || null;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved, 10) : 256;
  });
  const [isResizing, setIsResizing] = useState(false);

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
      socket.on('dm:created', handleDMCreated);

      return () => {
        socket.off('channel:created', handleChannelCreated);
        socket.off('channel:deleted', handleChannelDeleted);
        socket.off('channel:moved', handleChannelMoved);
        socket.off('member:joined', handleMemberJoined);
        socket.off('member:removed', handleMemberRemoved);
        socket.off('channelGroup:created', handleGroupCreated);
        socket.off('channelGroup:updated', handleGroupUpdated);
        socket.off('channelGroup:deleted', handleGroupDeleted);
        socket.off('dm:created', handleDMCreated);
      };
    }
  }, [socket, workspaceId]);

  // Sidebar resize handling
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = Math.min(Math.max(180, e.clientX), 400);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        localStorage.setItem('sidebarWidth', sidebarWidth.toString());
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, sidebarWidth]);

  // Persist activeBandView to localStorage
  useEffect(() => {
    if (activeBandView) {
      localStorage.setItem(`bandView:${workspaceId}`, activeBandView);
    } else {
      localStorage.removeItem(`bandView:${workspaceId}`);
    }
  }, [activeBandView, workspaceId]);

  // Persist selectedChannel to localStorage
  useEffect(() => {
    if (selectedChannel?.id) {
      localStorage.setItem(`selectedChannel:${workspaceId}`, selectedChannel.id);
    }
  }, [selectedChannel, workspaceId]);

  const loadWorkspace = async () => {
    try {
      const [workspaceData, channelsData, groupsData, dmsData] = await Promise.all([
        api.getWorkspace(workspaceId),
        api.getChannels(workspaceId),
        api.getChannelGroups(workspaceId),
        api.getDMs(workspaceId)
      ]);
      setWorkspace(workspaceData);
      setChannels(channelsData);
      setChannelGroups(groupsData);
      setDirectMessages(dmsData);

      // Restore saved channel/DM or select first channel by default
      if (pendingChannelId && !selectedChannel) {
        const savedChannel = channelsData.find(c => c.id === pendingChannelId);
        const savedDM = dmsData.find(d => d.id === pendingChannelId);
        if (savedChannel) {
          setSelectedChannel(savedChannel);
        } else if (savedDM) {
          setSelectedChannel(savedDM);
        } else if (channelsData.length > 0) {
          const generalChannel = channelsData.find(c => c.name === 'general');
          setSelectedChannel(generalChannel || channelsData[0]);
        }
      } else if (channelsData.length > 0 && !selectedChannel) {
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

  const handleDMCreated = (dm) => {
    setDirectMessages(prev => {
      // Don't add if already exists
      if (prev.some(d => d.id === dm.id)) return prev;
      return [{ ...dm, unreadCount: 0 }, ...prev];
    });
  };

  const handleStartDM = async (userId) => {
    try {
      const dm = await api.createOrGetDM(workspaceId, [userId]);
      // Check if DM already exists in state
      const existingDM = directMessages.find(d => d.id === dm.id);
      if (!existingDM) {
        setDirectMessages(prev => [{ ...dm, unreadCount: 0 }, ...prev]);
      }
      // Select the DM channel
      setSelectedChannel(dm);
      setSelectedThread(null);
      setSidebarOpen(false);
      setMobileTab('home');
    } catch (err) {
      console.error('Failed to start DM:', err);
    }
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
    // Update channels
    setChannels(prev =>
      prev.map(c =>
        c.id === channelId ? { ...c, unreadCount: count } : c
      )
    );
    // Also update DMs
    setDirectMessages(prev =>
      prev.map(dm =>
        dm.id === channelId ? { ...dm, unreadCount: count } : dm
      )
    );
  };

  const handleSelectBandView = (view) => {
    setActiveBandView(view);
    setBandViewKey(prev => prev + 1); // Force remount to reset state
    setSelectedChannel(null);
    setSelectedThread(null);
    setSidebarOpen(false);
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

  const totalUnread = channels.reduce((sum, c) => sum + (c.unreadCount || 0), 0) +
    directMessages.reduce((sum, dm) => sum + (dm.unreadCount || 0), 0);

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
          setActiveBandView(null);
          setSidebarOpen(false);
        }}
        onCreateChannel={handleCreateChannel}
        onCreateGroup={handleCreateGroup}
        onShowInvite={() => setShowInvite(true)}
        onLogout={logout}
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        directMessages={directMessages}
        onStartDM={handleStartDM}
        activeBandView={activeBandView}
        onSelectBandView={handleSelectBandView}
        width={sidebarWidth}
        onResizeStart={() => setIsResizing(true)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col pb-16 md:pb-0 min-h-0">
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
            {activeBandView === 'songs' ? '🎵 Songs' :
             activeBandView === 'setlists' ? '📋 Setlists' :
             activeBandView === 'calendar' ? '📅 Calendar' :
             activeBandView === 'availability' ? '🗓️ Availability' :
             activeBandView === 'stats' ? '📊 Stats' :
             activeBandView === 'archive' ? '📸 Gig Archive' :
             activeBandView === 'members' ? '👥 Members' :
             selectedChannel
              ? selectedChannel.isDirect
                ? selectedChannel.otherMembers?.map(m => m.displayName).join(', ') || 'Direct Message'
                : `# ${selectedChannel.name}`
              : workspace.name}
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
        <div className="flex-1 flex min-h-0">
          {/* Channel View or Band View */}
          <div className={`flex-1 flex flex-col min-h-0 ${selectedThread ? 'hidden md:flex' : ''}`}>
            {activeBandView === 'songs' ? (
              <SongList key={bandViewKey} workspaceId={workspaceId} />
            ) : activeBandView === 'setlists' ? (
              <SetlistList key={bandViewKey} workspaceId={workspaceId} />
            ) : activeBandView === 'calendar' ? (
              <GigCalendar workspaceId={workspaceId} workspace={workspace} />
            ) : activeBandView === 'availability' ? (
              <AvailabilityCalendar workspaceId={workspaceId} workspace={workspace} />
            ) : activeBandView === 'stats' ? (
              <GigStats workspaceId={workspaceId} />
            ) : activeBandView === 'archive' ? (
              <GigArchive workspaceId={workspaceId} />
            ) : activeBandView === 'members' ? (
              <BandMembersList key={bandViewKey} workspaceId={workspaceId} />
            ) : selectedChannel ? (
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
      {showInvite && (() => {
        const isAdmin = workspace.members?.find(m => m.user.id === user?.id)?.role === 'ADMIN';
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--color-modal-bg)] rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Invite to {workspace.name}</h3>
              <button
                onClick={() => {
                  setShowInvite(false);
                  setInviteMessage('');
                  setInviteEmail('');
                }}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {inviteMessage && (
              <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
                inviteMessage.includes('Failed') || inviteMessage.includes('error')
                  ? 'bg-red-900/50 border border-red-500 text-red-200'
                  : 'bg-green-900/50 border border-green-500 text-green-200'
              }`}>
                {inviteMessage}
              </div>
            )}

            {/* Current Invite Code */}
            <div className="mb-6">
              <p className="text-gray-400 text-sm mb-2">Share this invite code:</p>
              <div className="bg-gray-800 rounded-lg p-4 text-center">
                <code className="text-2xl font-mono font-bold tracking-wider text-white">
                  {workspace.inviteCode}
                </code>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-2 justify-center">
                {workspace.inviteCodeExpiresAt && (
                  <span>
                    Expires: {new Date(workspace.inviteCodeExpiresAt).toLocaleString()}
                  </span>
                )}
                {workspace.inviteMaxUses !== null && (
                  <span>
                    • Uses: {workspace.inviteUsedCount || 0}/{workspace.inviteMaxUses}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-2 text-center">
                <code className="text-xs break-all">
                  {window.location.origin}/join/{workspace.inviteCode}
                </code>
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/join/${workspace.inviteCode}`);
                  setInviteMessage('Link copied to clipboard!');
                  setTimeout(() => setInviteMessage(''), 3000);
                }}
                className="w-full mt-2 btn btn-secondary text-sm"
              >
                Copy Invite Link
              </button>
            </div>

            {/* Email Invite - Admin only */}
            {isAdmin && (
            <div className="border-t border-gray-700 pt-4 mb-4">
              <p className="text-gray-400 text-sm mb-2">Send invite via email:</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!inviteEmail.trim()) return;
                  setInviteLoading(true);
                  setInviteMessage('');
                  try {
                    await api.sendInviteEmail(workspace.id, inviteEmail);
                    setInviteMessage(`Invite sent to ${inviteEmail}`);
                    setInviteEmail('');
                  } catch (err) {
                    setInviteMessage(`Failed: ${err.message}`);
                  } finally {
                    setInviteLoading(false);
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="bandmate@email.com"
                  className="flex-1 modal-input"
                  required
                />
                <button
                  type="submit"
                  disabled={inviteLoading || !inviteEmail.trim()}
                  className="btn bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {inviteLoading ? '...' : 'Send'}
                </button>
              </form>
            </div>
            )}

            {/* Generate New Code - Admin only */}
            {isAdmin && (
            <div className="border-t border-gray-700 pt-4">
              <p className="text-gray-400 text-sm mb-3">Generate new invite code:</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Expires in</label>
                  <select
                    value={inviteExpiresIn || ''}
                    onChange={(e) => setInviteExpiresIn(e.target.value ? parseInt(e.target.value) : null)}
                    className="modal-input text-sm"
                  >
                    <option value="">Never</option>
                    <option value="1">1 hour</option>
                    <option value="24">24 hours</option>
                    <option value="168">7 days</option>
                    <option value="720">30 days</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Max uses</label>
                  <select
                    value={inviteMaxUses || ''}
                    onChange={(e) => setInviteMaxUses(e.target.value ? parseInt(e.target.value) : null)}
                    className="modal-input text-sm"
                  >
                    <option value="">Unlimited</option>
                    <option value="1">1 use</option>
                    <option value="5">5 uses</option>
                    <option value="10">10 uses</option>
                    <option value="25">25 uses</option>
                  </select>
                </div>
              </div>
              <button
                onClick={async () => {
                  setInviteLoading(true);
                  setInviteMessage('');
                  try {
                    const result = await api.regenerateInviteCode(workspace.id, {
                      expiresInHours: inviteExpiresIn,
                      maxUses: inviteMaxUses
                    });
                    setWorkspace(prev => ({
                      ...prev,
                      inviteCode: result.inviteCode,
                      inviteCodeExpiresAt: result.expiresAt,
                      inviteMaxUses: result.maxUses,
                      inviteUsedCount: result.usedCount
                    }));
                    setInviteMessage('New invite code generated!');
                  } catch (err) {
                    setInviteMessage(`Failed: ${err.message}`);
                  } finally {
                    setInviteLoading(false);
                  }
                }}
                disabled={inviteLoading}
                className="w-full btn btn-secondary disabled:opacity-50"
              >
                {inviteLoading ? 'Generating...' : 'Generate New Code'}
              </button>
            </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-700">
              <button
                onClick={() => {
                  setShowInvite(false);
                  setInviteMessage('');
                  setInviteEmail('');
                }}
                className="w-full btn bg-green-600 hover:bg-green-700 text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
        );
      })()}

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

      {/* DMs Panel */}
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
          <div className="flex-1 overflow-y-auto">
            {directMessages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 h-full">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p>No direct messages yet</p>
                  <p className="text-sm mt-2">Click on a member to start a conversation</p>
                </div>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {directMessages.map((dm) => {
                  const displayName = dm.otherMembers?.length > 0
                    ? dm.otherMembers.map(m => m.displayName).join(', ')
                    : 'Unknown';
                  const initial = dm.otherMembers?.[0]?.displayName?.charAt(0).toUpperCase() || '?';

                  return (
                    <button
                      key={dm.id}
                      onClick={() => {
                        setSelectedChannel(dm);
                        setMobileTab('home');
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-medium">
                        {initial}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-white font-medium">{displayName}</div>
                        {dm.lastMessage && (
                          <div className="text-gray-400 text-sm truncate">
                            {dm.lastMessage.content}
                          </div>
                        )}
                      </div>
                      {dm.unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                          {dm.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
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
