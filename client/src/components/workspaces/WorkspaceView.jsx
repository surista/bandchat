import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate, Routes, Route } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import { updateBadge, clearBadge } from '../../services/badge';
import Sidebar from '../channels/Sidebar';
import ChannelView from '../channels/ChannelView';
import ThreadView from '../threads/ThreadView';
import MobileNav from '../navigation/MobileNav';
import Skeleton from '../common/Skeleton';
import ErrorMessage from '../common/ErrorMessage';
import UpgradePrompt from '../common/UpgradePrompt';
import useSwipeGesture from '../../hooks/useSwipeGesture';

// Error component for failed chunk loads
function ChunkLoadError({ onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="text-4xl mb-4">&#x26a0;&#xfe0f;</div>
      <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
        Failed to load component
      </h3>
      <p className="text-[var(--color-text-muted)] max-w-sm mb-4">
        This may happen after an app update. Try refreshing to get the latest version.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)] transition-colors"
        >
          Try Again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
        >
          Refresh Page
        </button>
      </div>
    </div>
  );
}

// Retry dynamic import on failure (handles stale chunks after deploy)
// Returns a component that shows error UI on failure instead of abruptly reloading
function lazyRetry(importFn, retries = 1) {
  return lazy(() =>
    importFn().catch((error) => {
      // Try once more before giving up
      if (retries > 0) {
        return new Promise((resolve) => setTimeout(resolve, 500))
          .then(() => importFn())
          .catch(() => {
            // Final failure - return error component
            return { default: () => <ChunkLoadError onRetry={() => window.location.reload()} /> };
          });
      }
      // Return error component instead of reloading
      return { default: () => <ChunkLoadError onRetry={() => window.location.reload()} /> };
    })
  );
}

// Lazy-loaded band components (only loaded when user navigates to band view)
const SongList = lazyRetry(() => import('../band/SongList'));
const SetlistList = lazyRetry(() => import('../band/SetlistList'));
const GigCalendar = lazyRetry(() => import('../band/GigCalendar'));
const GigStats = lazyRetry(() => import('../band/GigStats'));
const GigArchive = lazyRetry(() => import('../band/GigArchive'));
const BandMembersList = lazyRetry(() => import('../band/BandMembers/BandMembersList'));
const ContactsList = lazyRetry(() => import('../band/ContactsList'));
const AnnouncementsList = lazyRetry(() => import('../band/AnnouncementsList'));
const PollsList = lazyRetry(() => import('../band/PollsList'));
const MedleyList = lazyRetry(() => import('../band/MedleyList'));
const BandTimeline = lazyRetry(() => import('../band/BandTimeline'));
const Achievements = lazyRetry(() => import('../band/Achievements'));
const RecordingsList = lazyRetry(() => import('../band/RecordingsList'));
const SongSuggestions = lazyRetry(() => import('../band/SongSuggestions'));
const BandKitty = lazyRetry(() => import('../band/BandKitty'));
const AudioAnalyzer = lazyRetry(() => import('../band/AudioAnalyzer'));
const PracticeDashboard = lazyRetry(() => import('../band/PracticeDashboard'));
const SavedMessages = lazyRetry(() => import('../messages/SavedMessages'));

/** Safe search-highlight renderer — no dangerouslySetInnerHTML */
function HighlightedText({ text, query }) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i}>{part}</mark>
      : part
  );
}

/** Lookup for mobile header titles per band view */
const BAND_VIEW_TITLES = {
  songs: 'Songs',
  setlists: 'Setlists',
  calendar: 'Calendar',
  stats: 'Stats',
  archive: 'Gig Archive',
  members: 'Members',
  contacts: 'Contacts',
  announcements: 'Announcements',
  polls: 'Polls',
  medleys: 'Medleys',
  timeline: 'Timeline',
  achievements: 'Achievements',
  recordings: 'Recordings',
  suggestions: 'Song Intelligence',
  kitty: 'Band Kitty',
  analyzer: 'Audio Analyzer',
  practice: 'Practice',
  saved: 'Saved Messages',
};

/** Lookup for band view components */
const BAND_VIEW_COMPONENTS = {
  songs: SongList,
  setlists: SetlistList,
  calendar: GigCalendar,
  stats: GigStats,
  archive: GigArchive,
  members: BandMembersList,
  contacts: ContactsList,
  announcements: AnnouncementsList,
  polls: PollsList,
  medleys: MedleyList,
  timeline: BandTimeline,
  achievements: Achievements,
  recordings: RecordingsList,
  suggestions: SongSuggestions,
  kitty: BandKitty,
  analyzer: AudioAnalyzer,
  practice: PracticeDashboard,
  saved: SavedMessages,
};

/** Band views that require a Pro plan */
const PRO_ONLY_VIEWS = {
  archive: { feature: 'Gig Archive', description: 'Browse your complete gig history with setlists, stats, and media.' },
  kitty: { feature: 'Band Kitty', description: 'Track shared band finances, expenses, and contributions.' },
  stats: { feature: 'Gig Stats', description: 'View gig statistics, revenue tracking, and performance insights.' },
  practice: { feature: 'Practice Dashboard', description: 'Track practice streaks, set goals, and build consistency.' },
  suggestions: { feature: 'Song Intelligence', description: 'Get AI-powered song suggestions based on your repertoire.' },
  timeline: { feature: 'Band Timeline', description: 'View your band\'s history, milestones, and member journey.' },
};

/** Props that need extra data beyond workspaceId */
const BAND_VIEW_EXTRA_PROPS = {
  setlists: (ctx) => ({ workspaceName: ctx.workspace?.name }),
  calendar: (ctx) => ({ workspace: ctx.workspace }),
  availability: (ctx) => ({ workspace: ctx.workspace }),
  members: (ctx) => ({ workspace: ctx.workspace }),
  announcements: (ctx) => ({ workspace: ctx.workspace }),
  archive: (ctx) => ({ isAdmin: ctx.isAdmin, workspace: ctx.workspace }),
  timeline: (ctx) => ({ isAdmin: ctx.isAdmin }),
  kitty: (ctx) => ({ isAdmin: ctx.isAdmin }),
};

/** Views that should use bandViewKey as key prop */
const KEYED_BAND_VIEWS = new Set(['songs', 'setlists', 'members']);

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
  const [loadError, setLoadError] = useState(null);
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
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchChannelFilter, setSearchChannelFilter] = useState('');
  const [searchAuthorFilter, setSearchAuthorFilter] = useState('');
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
  const lastRefreshRef = useRef(0);
  const swipeRef = useSwipeGesture({
    onSwipeRight: () => setSidebarOpen(true),
    edgeOnly: true,
  });

  useEffect(() => {
    loadWorkspace();
  }, [workspaceId]);

  // Update pendingChannelId when workspaceId changes
  useEffect(() => {
    setPendingChannelId(localStorage.getItem(`selectedChannel:${workspaceId}`) || null);
  }, [workspaceId]);

  // Cmd+K / Ctrl+K to open search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (socket) {
      joinWorkspace(workspaceId);

      // Handle new messages for unread counts
      const handleNewMessage = (message) => {
        // Only increment unread if from another user and for a different channel
        if (message.author?.id !== user.id && message.channelId !== selectedChannelRef.current?.id) {
          setChannels(prev =>
            prev.map(c =>
              c.id === message.channelId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
            )
          );
          setDirectMessages(prev =>
            prev.map(dm =>
              dm.id === message.channelId ? { ...dm, unreadCount: (dm.unreadCount || 0) + 1 } : dm
            )
          );
        }
      };

      // Handle thread replies for unread counts
      const handleReplyUnread = ({ parentId, message: reply }) => {
        if (reply.author?.id === user.id) return;
        const isThreadOpen = selectedThreadRef.current?.id === parentId;
        // If the thread is open, ThreadView will mark it as read
        if (isThreadOpen) return;
        // Increment thread unread count for the channel
        const channelId = reply.channelId;
        setChannels(prev =>
          prev.map(c =>
            c.id === channelId ? { ...c, unreadThreadReplies: (c.unreadThreadReplies || 0) + 1 } : c
          )
        );
        setDirectMessages(prev =>
          prev.map(dm =>
            dm.id === channelId ? { ...dm, unreadThreadReplies: (dm.unreadThreadReplies || 0) + 1 } : dm
          )
        );
      };

      // Handle reconnection - refresh data without resetting selected channel
      const handleReconnect = () => {
        console.log('Socket reconnected, refreshing data...');
        joinWorkspace(workspaceId);
        refreshWorkspaceData();
      };

      socket.on('channel:created', handleChannelCreated);
      socket.on('channel:deleted', handleChannelDeleted);
      socket.on('channel:moved', handleChannelMoved);
      socket.on('member:joined', handleMemberJoined);
      socket.on('member:removed', handleMemberRemoved);
      socket.on('channelGroup:created', handleGroupCreated);
      socket.on('channelGroup:updated', handleGroupUpdated);
      socket.on('channelGroup:deleted', handleGroupDeleted);
      socket.on('channelGroups:reordered', handleGroupsReordered);
      socket.on('dm:created', handleDMCreated);
      socket.on('message:new', handleNewMessage);
      socket.on('message:reply', handleReplyUnread);
      socket.on('plan:updated', (data) => {
        setWorkspace(prev => prev ? { ...prev, effectivePlan: data.effectivePlan, planLimits: data.planLimits } : prev);
      });
      socket.io.on('reconnect', handleReconnect);

      return () => {
        socket.off('channel:created', handleChannelCreated);
        socket.off('channel:deleted', handleChannelDeleted);
        socket.off('channel:moved', handleChannelMoved);
        socket.off('member:joined', handleMemberJoined);
        socket.off('member:removed', handleMemberRemoved);
        socket.off('channelGroup:created', handleGroupCreated);
        socket.off('channelGroup:updated', handleGroupUpdated);
        socket.off('channelGroup:deleted', handleGroupDeleted);
        socket.off('channelGroups:reordered', handleGroupsReordered);
        socket.off('dm:created', handleDMCreated);
        socket.off('message:new', handleNewMessage);
        socket.off('message:reply', handleReplyUnread);
        socket.off('plan:updated');
        socket.io.off('reconnect', handleReconnect);
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

  // Soft refresh: update channels/groups/DMs and selectedChannel metadata without resetting loading state
  const selectedChannelRef = useRef(null);
  selectedChannelRef.current = selectedChannel;
  const selectedThreadRef = useRef(null);
  selectedThreadRef.current = selectedThread;

  const refreshWorkspaceData = useCallback(async () => {
    try {
      const [channelsData, groupsData, dmsData] = await Promise.all([
        api.getChannels(workspaceId),
        api.getChannelGroups(workspaceId),
        api.getDMs(workspaceId)
      ]);
      // Zero out unread for the currently viewed channel (user is already reading it)
      const viewingId = selectedChannelRef.current?.id;
      setChannels(channelsData.map(c =>
        c.id === viewingId ? { ...c, unreadCount: 0, unreadThreadReplies: 0 } : c
      ));
      setChannelGroups(groupsData);
      setDirectMessages(dmsData.map(dm =>
        dm.id === viewingId ? { ...dm, unreadCount: 0, unreadThreadReplies: 0 } : dm
      ));
      lastRefreshRef.current = Date.now();

      // Update selectedChannel with fresh data if it still exists
      setSelectedChannel(prev => {
        if (!prev) return prev;
        const updated = channelsData.find(c => c.id === prev.id)
          || dmsData.find(d => d.id === prev.id);
        return updated || prev;
      });
    } catch (err) {
      console.error('Failed to refresh workspace data:', err);
    }
  }, [workspaceId]);

  // Refresh data when tab becomes visible again (soft refresh to preserve selected channel)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Only refresh if more than 30 seconds since last refresh
        if (Date.now() - lastRefreshRef.current > 30000) {
          refreshWorkspaceData();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refreshWorkspaceData]);

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
      setLoadError(err.message || 'Failed to load workspace');
    } finally {
      setLoading(false);
    }
  };

  const handleChannelCreated = (channel) => {
    setChannels(prev => [...prev, { ...channel, unreadCount: 0 }]);
  };

  const handleChannelDeleted = ({ channelId }) => {
    setChannels(prev => {
      const remaining = prev.filter(c => c.id !== channelId);
      // If the deleted channel was selected, pick the first remaining
      setSelectedChannel(sel => sel?.id === channelId ? (remaining[0] || null) : sel);
      return remaining;
    });
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

  const handleGroupsReordered = (groups) => {
    setChannelGroups(groups);
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
      // Socket event may not include otherMembers — derive from members
      const otherMembers = dm.otherMembers
        || dm.members?.filter(m => m.user.id !== user.id).map(m => m.user)
        || [];
      return [{ ...dm, otherMembers, unreadCount: 0 }, ...prev];
    });
  };

  const handleStartDM = async (userIdOrIds) => {
    try {
      const userIds = Array.isArray(userIdOrIds) ? userIdOrIds : [userIdOrIds];
      const dm = await api.createOrGetDM(workspaceId, userIds);
      // Use functional updater to avoid race with socket dm:created event
      setDirectMessages(prev => {
        if (prev.some(d => d.id === dm.id)) return prev;
        return [{ ...dm, unreadCount: 0 }, ...prev];
      });
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

  const handleUpdateUnread = useCallback((count) => {
    if (selectedChannel) updateChannelUnread(selectedChannel.id, count);
  }, [selectedChannel?.id]);

  const handleSelectBandView = (view) => {
    setActiveBandView(view);
    setBandViewKey(prev => prev + 1); // Force remount to reset state
    setSelectedChannel(null);
    setSelectedThread(null);
    setSidebarOpen(false);
  };

  const handleMobileTabChange = (tab) => {
    setMobileTab(tab);
    // Always close the search modal when switching to a different tab
    if (tab !== 'search') {
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
    }
    if (tab === 'home') {
      setSidebarOpen(true);
    } else if (tab === 'search') {
      setShowSearch(true);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const results = await api.searchMessages(
        workspaceId,
        searchQuery,
        searchChannelFilter || null,
        searchAuthorFilter || null
      );
      setSearchResults(results);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleOpenSearch = () => {
    setShowSearch(true);
  };

  const totalUnread = channels.reduce((sum, c) => sum + (c.unreadCount || 0) + (c.unreadThreadReplies || 0), 0) +
    directMessages.reduce((sum, dm) => sum + (dm.unreadCount || 0) + (dm.unreadThreadReplies || 0), 0);

  // Update browser tab badge and PWA app badge when unread count changes
  useEffect(() => {
    updateBadge(totalUnread);
    return () => clearBadge();
  }, [totalUnread]);

  if (loading) {
    return (
      <div className="h-screen-safe flex bg-gray-900">
        <div className="w-64 bg-slack-sidebar flex flex-col border-r border-gray-700 hidden md:flex">
          <div className="p-4"><Skeleton className="h-6 w-40" /></div>
          <div className="px-2 space-y-1">
            {Array.from({length: 6}).map((_, i) => <Skeleton.Channel key={i} />)}
          </div>
        </div>
        <div className="flex-1 flex flex-col bg-gray-800">
          <div className="h-14 border-b border-gray-700 px-4 flex items-center">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="flex-1 px-4 py-2">
            {Array.from({length: 8}).map((_, i) => <Skeleton.Message key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-screen-safe flex items-center justify-center bg-gray-900">
        <ErrorMessage
          title="Failed to load workspace"
          message={loadError}
          onRetry={() => {
            setLoadError(null);
            setLoading(true);
            loadWorkspace();
          }}
        />
      </div>
    );
  }

  if (!workspace) {
    return null;
  }

  const isAdmin = workspace.members?.find(m => m.user.id === user?.id)?.role === 'ADMIN';

  return (
    <div className="h-screen-safe flex bg-gray-900">
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
        onReorderGroups={(newGroups) => setChannelGroups(newGroups)}
        onRefreshWorkspace={loadWorkspace}
        onMuteChannel={(channelId, muted) => {
          setChannels(prev => prev.map(c => c.id === channelId ? { ...c, muted } : c));
          setDirectMessages(prev => prev.map(dm => dm.id === channelId ? { ...dm, muted } : dm));
          if (selectedChannel?.id === channelId) {
            setSelectedChannel(prev => prev ? { ...prev, muted } : prev);
          }
        }}
      />

      {/* Main Content */}
      <div ref={swipeRef} id="main-content" className="flex-1 flex flex-col pb-16 md:pb-0 min-h-0">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center gap-3 p-3 border-b border-gray-700 bg-gray-900 safe-area-top">
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
            {BAND_VIEW_TITLES[activeBandView] ||
             (selectedChannel
              ? selectedChannel.isDirect
                ? selectedChannel.otherMembers?.map(m => m.displayName).join(', ') || 'Direct Message'
                : `# ${selectedChannel.name}`
              : workspace.name)}
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
            {activeBandView ? (
              PRO_ONLY_VIEWS[activeBandView] && workspace?.effectivePlan !== 'PRO' ? (
                <UpgradePrompt
                  feature={PRO_ONLY_VIEWS[activeBandView].feature}
                  description={PRO_ONLY_VIEWS[activeBandView].description}
                />
              ) : (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Skeleton type="channel" /></div>}>
                {(() => {
                  const BandComponent = BAND_VIEW_COMPONENTS[activeBandView];
                  if (!BandComponent) return null;
                  const extraProps = BAND_VIEW_EXTRA_PROPS[activeBandView]?.({ workspace, isAdmin }) || {};
                  const keyProp = KEYED_BAND_VIEWS.has(activeBandView) ? bandViewKey : undefined;
                  return <BandComponent key={keyProp} workspaceId={workspaceId} {...extraProps} />;
                })()}
              </Suspense>
              )
            ) : selectedChannel ? (
              <ChannelView
                key={selectedChannel.id}
                channel={selectedChannel}
                workspace={workspace}
                onOpenThread={setSelectedThread}
                onUpdateUnread={handleUpdateUnread}
                openThreadId={selectedThread?.id || null}
                onOpenSearch={handleOpenSearch}
                onStartDM={handleStartDM}
                onMuteChannel={(channelId, muted) => {
                  setChannels(prev => prev.map(c => c.id === channelId ? { ...c, muted } : c));
                  setDirectMessages(prev => prev.map(dm => dm.id === channelId ? { ...dm, muted } : dm));
                  if (selectedChannel?.id === channelId) {
                    setSelectedChannel(prev => prev ? { ...prev, muted } : prev);
                  }
                }}
                onAddToLibrary={(url, title) => {
                  setSelectedChannel(null);
                  setActiveBandView('songs');
                  // Store pre-fill data for SongForm
                  sessionStorage.setItem('prefillSong', JSON.stringify({ title: title || '', referenceUrl: url }));
                }}
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
                workspaceId={workspace?.id}
                onClose={() => setSelectedThread(null)}
                members={workspace?.members || []}
                onThreadRead={(messageId) => {
                  // Find the message's unreadReplies and subtract from channel thread unread count
                  const msg = selectedThreadRef.current;
                  const unread = msg?.unreadReplies || 0;
                  if (unread > 0 && selectedChannel) {
                    const chId = selectedChannel.id;
                    setChannels(prev =>
                      prev.map(c =>
                        c.id === chId ? { ...c, unreadThreadReplies: Math.max(0, (c.unreadThreadReplies || 0) - unread) } : c
                      )
                    );
                    setDirectMessages(prev =>
                      prev.map(dm =>
                        dm.id === chId ? { ...dm, unreadThreadReplies: Math.max(0, (dm.unreadThreadReplies || 0) - unread) } : dm
                      )
                    );
                  }
                }}
                onStartDM={handleStartDM}
              />
            </div>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--color-modal-bg)] rounded-lg p-6 w-full max-w-md max-h-modal overflow-y-auto">
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
                  className="btn btn-blue"
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
                className="w-full btn btn-secondary"
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
                className="w-full btn btn-primary"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Modal */}
      {showSearch && (
        <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col pb-16 md:pb-0 safe-area-top">
          <div className="p-3 border-b border-gray-700 space-y-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchChannelFilter('');
                  setSearchAuthorFilter('');
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
                  disabled={searchLoading}
                  className="bg-slack-blue text-white px-4 py-2 rounded-r-lg disabled:opacity-50"
                >
                  {searchLoading ? 'Searching...' : 'Search'}
                </button>
              </form>
            </div>
            <div className="flex gap-2 ml-11">
              <select
                value={searchChannelFilter}
                onChange={(e) => setSearchChannelFilter(e.target.value)}
                className="bg-gray-800 text-gray-300 text-sm px-3 py-1.5 rounded-lg border border-gray-700 outline-none"
              >
                <option value="">All channels</option>
                {channels.map(c => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
                {directMessages.map(dm => {
                  const dmLabel = dm.otherMembers?.length > 0
                    ? dm.otherMembers.map(m => m.displayName).join(', ')
                    : 'Unknown';
                  return (
                    <option key={dm.id} value={dm.id}>{dmLabel}</option>
                  );
                })}
              </select>
              <select
                value={searchAuthorFilter}
                onChange={(e) => setSearchAuthorFilter(e.target.value)}
                className="bg-gray-800 text-gray-300 text-sm px-3 py-1.5 rounded-lg border border-gray-700 outline-none"
              >
                <option value="">All members</option>
                {workspace?.members?.map(m => (
                  <option key={m.user.id} value={m.user.id}>{m.user.displayName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {searchLoading ? (
              <div className="text-center text-gray-400 mt-8">
                <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Searching...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center text-gray-400 mt-8">
                {searchQuery ? 'No results found' : 'Search for messages across all channels'}
              </div>
            ) : (
              <div className="space-y-3">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      const channel = channels.find(c => c.id === result.channelId) || directMessages.find(d => d.id === result.channelId);
                      if (channel) {
                        setSelectedChannel(channel);
                        setShowSearch(false);
                        setSearchQuery('');
                        setSearchResults([]);
                        setSearchChannelFilter('');
                        setSearchAuthorFilter('');
                      }
                    }}
                    className="w-full text-left bg-gray-800 rounded-lg p-3 hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                      <span>#{result.channel?.name}</span>
                      <span>•</span>
                      <span>{result.author?.displayName}</span>
                    </div>
                    <div className="text-white search-highlight">
                      <HighlightedText text={result.content} query={searchQuery} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DMs Panel */}
      {mobileTab === 'dms' && (
        <div className="fixed inset-0 bg-gray-900 z-40 flex flex-col md:hidden pb-16 safe-area-top">
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

      {/* Activity Panel - Unread Messages */}
      {mobileTab === 'activity' && (
        <div className="fixed inset-0 bg-gray-900 z-40 flex flex-col md:hidden pb-16 safe-area-top">
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
          <div className="flex-1 overflow-y-auto">
            {(() => {
              const unreadChannels = channels.filter(c => (c.unreadCount || 0) + (c.unreadThreadReplies || 0) > 0);
              const unreadDMs = directMessages.filter(dm => (dm.unreadCount || 0) + (dm.unreadThreadReplies || 0) > 0);
              const hasUnread = unreadChannels.length > 0 || unreadDMs.length > 0;

              if (!hasUnread) {
                return (
                  <div className="flex-1 flex items-center justify-center text-gray-400 h-full">
                    <div className="text-center py-20">
                      <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <p>You're all caught up!</p>
                    </div>
                  </div>
                );
              }

              return (
                <div className="p-3 space-y-2">
                  {unreadChannels.length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 pt-2">Channels</div>
                      {unreadChannels.map(ch => (
                        <button
                          key={ch.id}
                          onClick={() => {
                            setSelectedChannel(ch);
                            setMobileTab('home');
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors"
                        >
                          <span className="text-gray-400 text-lg">#</span>
                          <div className="flex-1 text-left">
                            <div className="text-white font-medium">{ch.name}</div>
                            {ch.unreadThreadReplies > 0 && (
                              <div className="text-gray-400 text-sm">{ch.unreadThreadReplies} thread {ch.unreadThreadReplies === 1 ? 'reply' : 'replies'}</div>
                            )}
                          </div>
                          <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                            {(ch.unreadCount || 0) + (ch.unreadThreadReplies || 0)}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  {unreadDMs.length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 pt-2">Direct Messages</div>
                      {unreadDMs.map(dm => {
                        const otherUser = dm.otherMembers?.[0];
                        const displayName = otherUser?.displayName || 'Unknown';
                        const initial = displayName.charAt(0).toUpperCase();
                        return (
                          <button
                            key={dm.id}
                            onClick={() => {
                              setSelectedChannel(dm);
                              setMobileTab('home');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-sm font-medium">
                              {initial}
                            </div>
                            <div className="flex-1 text-left">
                              <div className="text-white font-medium">{displayName}</div>
                              {dm.lastMessage && (
                                <div className="text-gray-400 text-sm truncate">{dm.lastMessage.content}</div>
                              )}
                            </div>
                            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                              {(dm.unreadCount || 0) + (dm.unreadThreadReplies || 0)}
                            </span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })()}
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
