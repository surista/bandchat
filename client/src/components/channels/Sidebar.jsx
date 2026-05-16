/* global __APP_VERSION__ */
/**
 * @fileoverview Sidebar navigation component.
 * Contains channels, direct messages, band features, members list, and settings.
 * Supports drag-and-drop channel reordering for admins.
 */

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { pushService } from '../../services/push';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import { storage } from '../../services/storage';
import useIsAdmin from '../../hooks/useIsAdmin';
import MemberProfile from '../common/MemberProfile';
import ConfirmDialog from '../common/ConfirmDialog';
import Modal from '../common/Modal';
import ContextMenu from '../common/ContextMenu';
import useLongPress from '../../hooks/useLongPress';
import NewMessageModal from './NewMessageModal';
import SettingsModal from './SettingsModal';
import Skeleton from '../common/Skeleton';
import WorkspaceSwitcher from '../workspaces/WorkspaceSwitcher';
import { hapticMedium } from '../../services/haptic';

/** Draggable channel item wrapper for admin drag-and-drop */
function DraggableChannel({ channel, children, disabled }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: channel.id,
    data: { type: 'channel', channel },
    disabled
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : undefined
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

// Droppable section wrapper
function DroppableSection({ groupId, children }) {
  const { isOver, setNodeRef } = useDroppable({
    id: groupId || 'ungrouped',
    data: { type: 'section', groupId }
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-colors rounded ${isOver ? 'bg-blue-500/20' : ''}`}
    >
      {children}
    </div>
  );
}

/** Sortable wrapper for group sections (admin drag-and-drop reordering) */
function SortableGroupWrapper({ group, children, disabled }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: `sort-group-${group.id}`,
    data: { type: 'group', group },
    disabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : undefined
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandleProps: { ...listeners, ...attributes } })}
    </div>
  );
}

/** Channel item with long-press support for mobile context menus */
function ChannelItem({ channel, isSelected, onSelect, onLongPress, onContextMenu, isAdmin }) {
  const longPress = useLongPress({
    onLongPress: (pos) => onLongPress(pos),
    onTap: onSelect,
  });

  return (
    <button
      role="listitem"
      className={`channel-item w-full ${isSelected ? 'active' : ''} ${channel.muted ? 'opacity-60' : ''}`}
      {...longPress}
      onContextMenu={onContextMenu}
    >
      <span className="text-gray-400">
        {channel.isPrivate ? '🔒' : '#'}
      </span>
      <span className="flex-1 truncate">{channel.name}</span>
      {channel.starred && (
        <span className="text-yellow-500 text-xs flex-shrink-0" title="Starred">★</span>
      )}
      {channel.pinnedSetlistId && (
        <span className="text-green-400 text-xs flex-shrink-0" title="Setlist pinned">♫</span>
      )}
      {channel.muted && (
        <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
        </svg>
      )}
      {!channel.muted && channel.unreadCount > 0 && (
        <span className="bg-slack-red text-white text-xs px-1.5 py-0.5 rounded-full">
          {channel.unreadCount}
        </span>
      )}
    </button>
  );
}

/**
 * Main sidebar navigation component.
 * Contains workspace header, channels, DMs, band features, members, and settings.
 *
 * @param {Object} props
 * @param {Object} props.workspace - Current workspace object
 * @param {Array} props.channels - Array of channel objects
 * @param {Array} props.channelGroups - Array of channel group objects
 * @param {Object} props.selectedChannel - Currently selected channel
 * @param {function} props.onSelectChannel - Callback when channel is selected
 * @param {function} props.onCreateChannel - Callback to create new channel
 * @param {function} props.onCreateGroup - Callback to create channel group
 * @param {function} props.onShowInvite - Callback to show invite modal
 * @param {function} props.onLogout - Callback for logout action
 * @param {Object} props.user - Current authenticated user
 * @param {boolean} props.isOpen - Whether sidebar is open (mobile)
 * @param {function} props.onClose - Callback to close sidebar (mobile)
 * @param {Array} props.directMessages - Array of DM channels
 * @param {function} props.onStartDM - Callback to start new DM
 * @param {string} props.activeBandView - Currently active band view
 * @param {function} props.onSelectBandView - Callback when band view is selected
 * @param {number} props.width - Sidebar width in pixels
 * @param {function} props.onResizeStart - Callback when resize handle is dragged
 */
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
  onResizeStart,
  onReorderGroups,
  onRefreshWorkspace,
  onMuteChannel,
  onStarChannel,
  onOpenInSplit,
  allWorkspaces = []
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState(null);
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState(() => storage.getJSON(`collapsedGroups:${workspace.id}`, {}));
  const [collapsedSections, setCollapsedSections] = useState(() => storage.getJSON(`collapsedSections:${workspace.id}`, {}));
  const [showSettings, setShowSettings] = useState(false);
  // Member profile
  const [showProfileUserId, setShowProfileUserId] = useState(null);
  // Context menu for channels/sections (admin only)
  const [contextMenu, setContextMenu] = useState(null); // { type: 'channel' | 'section', id, name, x, y }
  const [renameModal, setRenameModal] = useState(null); // { type: 'channel' | 'section', id, name }
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'channel' | 'section', id, name }
  const [deleteLoading, setDeleteLoading] = useState(false);
  // Next upcoming gig banner
  const [nextGig, setNextGig] = useState(null);

  useEffect(() => {
    storage.setJSON(`collapsedGroups:${workspace.id}`, collapsedGroups);
  }, [collapsedGroups, workspace.id]);

  useEffect(() => {
    storage.setJSON(`collapsedSections:${workspace.id}`, collapsedSections);
  }, [collapsedSections, workspace.id]);


  // Fetch next upcoming gig
  useEffect(() => {
    if (!workspace?.id) return;
    const fetchNextGig = () => {
      api.getNextGig(workspace.id).then(setNextGig).catch(() => setNextGig(null));
    };
    fetchNextGig();
    const interval = setInterval(fetchNextGig, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [workspace?.id]);

  useEffect(() => {
    // Check if notifications are already enabled
    pushService.isSubscribed().then(setNotificationsEnabled);
    // Check snooze status
    api.getNotificationSnoozeStatus()
      .then(({ snoozedUntil }) => setSnoozedUntil(snoozedUntil))
      .catch(() => {});
  }, []);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isOpen && window.innerWidth < 768) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  const toggleNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const accessToken = api.accessToken;
      if (notificationsEnabled) {
        await pushService.unsubscribe(accessToken);
        setNotificationsEnabled(false);
      } else {
        await pushService.subscribe(accessToken);
        setNotificationsEnabled(true);
      }
    } catch (error) {
      console.error('Notification toggle error:', error);
      toast.error(error.message || 'Failed to toggle notifications');
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleSnooze = async (duration) => {
    try {
      const { snoozedUntil } = await api.setNotificationSnooze(duration);
      setSnoozedUntil(snoozedUntil);
      setSnoozeMenuOpen(false);
    } catch (error) {
      console.error('Snooze failed:', error);
    }
  };

  const getSnoozeLabel = () => {
    if (!snoozedUntil) return null;
    const until = new Date(snoozedUntil);
    if (until < new Date()) return null;
    if (until.getFullYear() > 2050) return 'Paused';
    const remaining = Math.round((until - new Date()) / 60000);
    if (remaining <= 60) return `${remaining}m`;
    return `${Math.round(remaining / 60)}h`;
  };

  const starredChannels = useMemo(() => channels.filter(c => c.starred), [channels]);
  const unreadChannels = useMemo(() =>
    channels.filter(c => !c.starred && !c.muted && c.unreadCount > 0),
  [channels]);

  // Total channel count per group (including promoted channels, for display in group headers)
  const groupTotalCounts = useMemo(() => {
    const counts = {};
    channels.forEach(c => {
      if (c.groupId) counts[c.groupId] = (counts[c.groupId] || 0) + 1;
    });
    return counts;
  }, [channels]);

  // Organize channels by group, excluding those already shown in Starred/Unread sections
  const { groupedChannels, ungroupedChannels } = useMemo(() => {
    const promotedIds = new Set([
      ...starredChannels.map(c => c.id),
      ...unreadChannels.map(c => c.id),
    ]);
    const grouped = {};
    const ungrouped = [];

    channels.forEach(channel => {
      if (promotedIds.has(channel.id)) return; // skip — already in Starred or Unread
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
  }, [channels, starredChannels, unreadChannels]);

  const isAdmin = useIsAdmin(workspace);

  // Drag and drop setup for channels and groups (admin only)
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 }
    })
  );

  const handleDragStart = (event) => {
    hapticMedium();
    const { active } = event;
    const type = active.data?.current?.type;

    if (type === 'group') {
      setActiveGroup(active.data.current.group);
      setActiveChannel(null);
    } else {
      const channel = channels.find(c => c.id === active.id);
      setActiveChannel(channel);
      setActiveGroup(null);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    const type = active.data?.current?.type;

    // Reset drag state
    setActiveChannel(null);
    setActiveGroup(null);

    if (!over || !isAdmin) return;

    // Handle group reorder
    if (type === 'group') {
      if (active.id === over.id) return;

      const activeGroupId = String(active.id).replace('sort-group-', '');
      const overGroupId = String(over.id).replace('sort-group-', '');
      const oldIndex = channelGroups.findIndex(g => g.id === activeGroupId);
      const newIndex = channelGroups.findIndex(g => g.id === overGroupId);
      if (oldIndex === -1 || newIndex === -1) return;

      const previousOrder = [...channelGroups];
      const newOrder = arrayMove(channelGroups, oldIndex, newIndex);
      const newGroupIds = newOrder.map(g => g.id);

      // Optimistic update
      onReorderGroups?.(newOrder);

      try {
        await api.reorderChannelGroups(workspace.id, newGroupIds);
      } catch (error) {
        console.error('Failed to reorder groups:', error);
        // Revert on error
        onReorderGroups?.(previousOrder);
      }
      return;
    }

    // Handle channel move (existing logic)
    const channelId = active.id;
    const targetGroupId = over.data?.current?.groupId;
    const channel = channels.find(c => c.id === channelId);

    // Don't do anything if dropped in the same group
    if (channel?.groupId === targetGroupId) return;
    if (!channel?.groupId && !targetGroupId) return; // Both ungrouped

    try {
      if (targetGroupId) {
        // Move to a group
        await api.moveChannelToGroup(targetGroupId, channelId);
      } else {
        // Move to ungrouped
        await api.removeChannelFromGroup(channelId);
      }
    } catch (error) {
      console.error('Failed to move channel:', error);
    }
  };

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

  const toggleSectionCollapse = (section) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Context menu handlers (admin only)
  const handleContextMenu = (e, type, id, name) => {
    e.preventDefault();
    e.stopPropagation();
    // Non-admins can only right-click channels (for mute/star)
    if (!isAdmin && type !== 'channel') return;
    const channel = type === 'channel' ? channels.find(c => c.id === id) : null;
    setContextMenu({ type, id, name, muted: channel?.muted, starred: channel?.starred, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const openRenameModal = () => {
    if (!contextMenu) return;
    setRenameModal({ type: contextMenu.type, id: contextMenu.id, name: contextMenu.name });
    setRenameValue(contextMenu.name);
    setContextMenu(null);
  };

  const openDeleteConfirm = () => {
    if (!contextMenu) return;
    setDeleteConfirm({ type: contextMenu.type, id: contextMenu.id, name: contextMenu.name });
    setContextMenu(null);
  };

  const handleRename = async (e) => {
    e.preventDefault();
    if (!renameModal || !renameValue.trim()) return;

    setRenameLoading(true);
    try {
      if (renameModal.type === 'channel') {
        await api.updateChannel(renameModal.id, { name: renameValue.toLowerCase().replace(/\s+/g, '-') });
      } else {
        await api.updateChannelGroup(renameModal.id, { name: renameValue });
      }
      setRenameModal(null);
      setRenameValue('');
    } catch (err) {
      toast.error(err.message || 'Failed to rename');
    } finally {
      setRenameLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setDeleteLoading(true);
    try {
      if (deleteConfirm.type === 'channel') {
        await api.deleteChannel(deleteConfirm.id);
      } else {
        await api.deleteChannelGroup(deleteConfirm.id);
      }
      setDeleteConfirm(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete');
      setDeleteLoading(false);
    }
  };

  // handleLongPress for channel items (enables mobile context menu)
  const handleChannelLongPress = (channel, pos) => {
    setContextMenu({ type: 'channel', id: channel.id, name: channel.name, muted: channel.muted, starred: channel.starred, x: pos.x, y: pos.y });
  };

  const handleToggleMute = async () => {
    if (!contextMenu || contextMenu.type !== 'channel') return;
    const newMuted = !contextMenu.muted;
    try {
      await api.muteChannel(contextMenu.id, newMuted);
      onMuteChannel?.(contextMenu.id, newMuted);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to toggle mute:', err);
    }
    setContextMenu(null);
  };

  const handleToggleStar = async () => {
    if (!contextMenu || contextMenu.type !== 'channel') return;
    const newStarred = !contextMenu.starred;
    try {
      await api.starChannel(contextMenu.id, newStarred);
      onStarChannel?.(contextMenu.id, newStarred);
      toast.success(newStarred ? 'Channel starred' : 'Channel unstarred');
    } catch (err) {
      toast.error('Failed to update star');
    }
    setContextMenu(null);
  };

  const renderChannel = (channel) => {
    const channelButton = (
      <ChannelItem
        key={channel.id}
        channel={channel}
        isSelected={selectedChannel?.id === channel.id}
        onSelect={() => onSelectChannel(channel)}
        onLongPress={(pos) => handleChannelLongPress(channel, pos)}
        onContextMenu={(e) => handleContextMenu(e, 'channel', channel.id, channel.name)}
        isAdmin={isAdmin}
      />
    );

    // Wrap with draggable for admins
    if (isAdmin) {
      return (
        <DraggableChannel key={channel.id} channel={channel}>
          {channelButton}
        </DraggableChannel>
      );
    }

    return channelButton;
  };

  return (
    <nav
      data-sidebar
      role="navigation"
      aria-label="Channels"
      className={`
        h-full bg-slack-sidebar flex flex-col text-gray-300
        fixed md:relative inset-y-0 left-0 z-50
        transform transition-transform duration-200 ease-in-out
        pb-20 md:pb-0
        ${isOpen ? 'translate-x-0 pointer-events-auto' : '-translate-x-full md:translate-x-0 pointer-events-none md:pointer-events-auto'}
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
      <div className="p-4 border-b border-white/10 safe-area-top">
        <WorkspaceSwitcher
          currentWorkspace={workspace}
          allWorkspaces={allWorkspaces}
        />
      </div>

      {/* Channels List */}
      <div className="flex-1 overflow-y-auto py-4">
        {/* Quick Links (collapsible) */}
        <div className="px-4 mb-2 flex items-center justify-between">
          <button
            onClick={() => toggleSectionCollapse('quickLinks')}
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
            aria-expanded={!collapsedSections.quickLinks}
          >
            <span className={`transform transition-transform text-xs ${collapsedSections.quickLinks ? '' : 'rotate-90'}`}>▶</span>
            <span className="text-xs font-semibold uppercase tracking-wide">Quick Links</span>
          </button>
        </div>

        {!collapsedSections.quickLinks && (
          <>
            {/* Next upcoming event banner */}
            {nextGig && (() => {
              const gigDate = new Date(nextGig.date);
              const now = new Date();
              // Normalize to start of local day for accurate day comparison
              const gigDay = new Date(gigDate.getFullYear(), gigDate.getMonth(), gigDate.getDate());
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const diffMs = gigDay.getTime() - today.getTime();
              const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
              const countdown = diffDays <= 0 ? 'Today!' : diffDays === 1 ? 'Tomorrow!' : `${diffDays} days away`;
              const hasSetlist = nextGig.setlists?.length > 0;
              const isUrgent = diffDays <= 1;
              // Use performanceStartTime or eventStartTime for display, fall back to time from date
              const displayTime = nextGig.performanceStartTime || nextGig.eventStartTime ||
                (gigDate.getHours() !== 0 || gigDate.getMinutes() !== 0
                  ? gigDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                  : null);

              return (
                <button
                  onClick={() => onSelectBandView?.('calendar', { focusGigId: nextGig.id })}
                  className="mx-3 mb-3 px-3 py-2 rounded-lg text-left transition-colors hover:brightness-110"
                  title={nextGig.notes || undefined}
                  style={{
                    background: nextGig.type === 'GIG' ? 'rgba(34,197,94,0.15)' : nextGig.type === 'REHEARSAL' ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                    border: `1px solid ${nextGig.type === 'GIG' ? 'rgba(34,197,94,0.3)' : nextGig.type === 'REHEARSAL' ? 'rgba(59,130,246,0.3)' : 'rgba(168,85,247,0.3)'}`,
                  }}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span>{nextGig.type === 'GIG' ? '🎸' : nextGig.type === 'REHEARSAL' ? '🥁' : '📅'}</span>
                    <span className="font-semibold text-white truncate">{nextGig.title}</span>
                    <span className={`ml-auto flex-shrink-0 font-bold ${isUrgent ? 'text-yellow-400' : 'text-gray-300'}`}>{countdown}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                    <span>{gigDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    {displayTime && <span>· {displayTime}</span>}
                    {nextGig.venue && <span className="truncate">· {nextGig.venue}</span>}
                    {nextGig._count?.comments > 0 && (
                      <span title={`${nextGig._count.comments} comment${nextGig._count.comments === 1 ? '' : 's'}`}>
                        · 💬 {nextGig._count.comments}
                      </span>
                    )}
                  </div>
                  {diffDays <= 7 && (
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span className={hasSetlist ? 'text-green-400' : 'text-yellow-400'}>
                        {hasSetlist ? '✓ Setlist' : '✗ No setlist'}
                      </span>
                      {nextGig.myAttendance && (
                        <span className={nextGig.myAttendance === 'GOING' ? 'text-green-400' : nextGig.myAttendance === 'NOT_GOING' ? 'text-red-400' : 'text-yellow-400'}>
                          {nextGig.myAttendance === 'GOING' ? '✓ Going' : nextGig.myAttendance === 'NOT_GOING' ? '✗ Not going' : '? Maybe'}
                        </span>
                      )}
                      {!nextGig.myAttendance && (
                        <span className="text-yellow-400">? RSVP needed</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })()}

            {/* Pinned Calendar shortcut */}
            <button
              onClick={() => onSelectBandView?.('calendar')}
              className={`channel-item w-full mx-2 mb-1 ${activeBandView === 'calendar' ? 'active' : ''}`}
            >
              <span className="text-gray-400">📅</span>
              <span className="flex-1 truncate">Calendar</span>
            </button>

            {/* All Messages shortcut */}
            <button
              onClick={() => onSelectBandView?.('all-messages')}
              className={`channel-item w-full mx-2 mb-1 ${activeBandView === 'all-messages' ? 'active' : ''}`}
            >
              <span className="text-gray-400">💬</span>
              <span className="flex-1 truncate">All Messages</span>
            </button>

            {/* Activity shortcut */}
            <button
              onClick={() => onSelectBandView?.('activity')}
              className={`channel-item w-full mx-2 mb-1 ${activeBandView === 'activity' ? 'active' : ''}`}
            >
              <span className="text-gray-400">🔔</span>
              <span className="flex-1 truncate">Activity</span>
            </button>

            {/* Saved Messages shortcut */}
            <button
              onClick={() => onSelectBandView?.('saved')}
              className={`channel-item w-full mx-2 mb-2 ${activeBandView === 'saved' ? 'active' : ''}`}
            >
              <span className="text-gray-400">🔖</span>
              <span className="flex-1 truncate">Saved Messages</span>
            </button>
          </>
        )}

        {/* Starred Channels */}
        {starredChannels.length > 0 && (
          <>
            <div className="px-4 mb-1 mt-1 flex items-center">
              <button
                onClick={() => toggleSectionCollapse('starred')}
                className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                aria-expanded={!collapsedSections.starred}
              >
                <span className={`transform transition-transform text-xs ${collapsedSections.starred ? '' : 'rotate-90'}`}>▶</span>
                <span className="text-xs font-semibold uppercase tracking-wide">Starred</span>
              </button>
            </div>
            {!collapsedSections.starred && (
              <div className="mb-2">
                {starredChannels.map(renderChannel)}
              </div>
            )}
          </>
        )}

        {/* Unread Channels */}
        {unreadChannels.length > 0 && (
          <>
            <div className="px-4 mb-1 mt-1 flex items-center">
              <button
                onClick={() => toggleSectionCollapse('unread')}
                className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                aria-expanded={!collapsedSections.unread}
              >
                <span className={`transform transition-transform text-xs ${collapsedSections.unread ? '' : 'rotate-90'}`}>▶</span>
                <span className="text-xs font-semibold uppercase tracking-wide">Unread</span>
              </button>
            </div>
            {!collapsedSections.unread && (
              <div className="mb-2">
                {unreadChannels.map(renderChannel)}
              </div>
            )}
          </>
        )}

        <div className="px-4 mb-2 flex items-center justify-between">
          <button
            onClick={() => toggleSectionCollapse('channels')}
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
            aria-expanded={!collapsedSections.channels}
          >
            <span className={`transform transition-transform text-xs ${collapsedSections.channels ? '' : 'rotate-90'}`}>
              ▶
            </span>
            <span className="text-sm font-bold uppercase tracking-wide">
              CHANNELS
            </span>
          </button>
          {!collapsedSections.channels && (
            <div className="flex gap-1">
              {isAdmin && (
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="text-gray-400 hover:text-white transition-colors text-sm px-2 py-1 min-w-[36px] min-h-[36px] flex items-center justify-center"
                  title="Create section"
                  aria-label="Create section"
                >
                  📁
                </button>
              )}
              <button
                onClick={() => setShowCreateChannel(true)}
                className="text-gray-400 hover:text-white transition-colors text-lg px-2 py-1 min-w-[36px] min-h-[36px] flex items-center justify-center"
                title="Create channel"
                aria-label="Create channel"
              >
                +
              </button>
            </div>
          )}
        </div>

        {/* Channel Groups */}
        {!collapsedSections.channels && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={channelGroups.map(g => `sort-group-${g.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {channelGroups.map((group) => (
                <SortableGroupWrapper key={group.id} group={group} disabled={!isAdmin}>
                  {({ dragHandleProps }) => (
                    <DroppableSection groupId={group.id}>
                      <div className="mb-2 ml-2">
                        <div className="flex items-center">
                          {isAdmin && (
                            <span
                              {...dragHandleProps}
                              className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-200 px-1 text-xs select-none"
                              title="Drag to reorder section"
                            >
                              ⋮⋮
                            </span>
                          )}
                          <button
                            onClick={() => toggleGroupCollapse(group.id)}
                            onContextMenu={(e) => handleContextMenu(e, 'section', group.id, group.name)}
                            className="flex-1 px-2 py-2.5 sm:py-1 flex items-center gap-1 text-gray-400 hover:text-white transition-colors text-sm min-h-[44px] sm:min-h-0"
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
                              {groupTotalCounts[group.id] || 0}
                            </span>
                          </button>
                        </div>
                        {!collapsedGroups[group.id] && (
                          <div className="space-y-0.5 ml-2" role="list">
                            {groupedChannels[group.id]?.map(renderChannel)}
                          </div>
                        )}
                      </div>
                    </DroppableSection>
                  )}
                </SortableGroupWrapper>
              ))}
            </SortableContext>

            {/* Ungrouped Channels */}
            <DroppableSection groupId={null}>
              {ungroupedChannels.length > 0 && (
                <div className="space-y-0.5 ml-2" role="list">
                  {channelGroups.length > 0 && (
                    <div className="px-4 py-1 text-xs text-gray-500 uppercase tracking-wide">
                      Other Channels
                    </div>
                  )}
                  {ungroupedChannels.map(renderChannel)}
                </div>
              )}
            </DroppableSection>

            {/* Drag overlay for visual feedback */}
            {createPortal(
              <DragOverlay>
                {activeChannel ? (
                  <div className="channel-item bg-slack-sidebar border border-blue-500 rounded shadow-lg opacity-90">
                    <span className="text-gray-400">
                      {activeChannel.isPrivate ? '🔒' : '#'}
                    </span>
                    <span className="flex-1 truncate">{activeChannel.name}</span>
                  </div>
                ) : activeGroup ? (
                  <div className="flex items-center gap-1 px-4 py-1 bg-slack-sidebar border border-blue-500 rounded shadow-lg opacity-90 text-gray-300 text-sm">
                    <span>▶</span>
                    <span className="font-medium uppercase tracking-wide">{activeGroup.name}</span>
                  </div>
                ) : null}
              </DragOverlay>,
              document.body
            )}
          </DndContext>
        )}

        {/* Direct Messages Section */}
        <div className="mt-6 px-4 mb-2 flex items-center justify-between">
          <button
            onClick={() => toggleSectionCollapse('dms')}
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
            aria-expanded={!collapsedSections.dms}
          >
            <span className={`transform transition-transform text-xs ${collapsedSections.dms ? '' : 'rotate-90'}`}>
              ▶
            </span>
            <span className="text-sm font-bold uppercase tracking-wide">
              DIRECT MESSAGES
            </span>
          </button>
          {!collapsedSections.dms && (
            <button
              onClick={() => setShowNewMessage(true)}
              className="text-gray-400 hover:text-white transition-colors text-lg px-2 py-1 min-w-[36px] min-h-[36px] flex items-center justify-center"
              title="New message"
              aria-label="New message"
            >
              +
            </button>
          )}
        </div>

        {!collapsedSections.dms && (
          <div className="space-y-0.5 ml-2">
            {directMessages.map((dm) => {
              const displayName = dm.otherMembers?.length > 0
                ? dm.otherMembers.map(m => m.displayName).join(', ')
                : 'Unknown';
              const dmPartner = dm.otherMembers?.[0];
              const initial = dmPartner?.displayName?.charAt(0).toUpperCase() || '?';

              return (
                <button
                  key={dm.id}
                  onClick={() => onSelectChannel(dm)}
                  className={`channel-item w-full ${
                    selectedChannel?.id === dm.id ? 'active' : ''
                  }`}
                >
                  {dmPartner?.avatarUrl ? (
                    <img
                      src={dmPartner.avatarUrl}
                      alt={displayName}
                      className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded bg-gray-600 flex items-center justify-center text-xs text-white flex-shrink-0">
                      {initial}
                    </div>
                  )}
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
        )}

        {/* Band Section */}
        <div className="mt-6 px-4 mb-2">
          <button
            onClick={() => toggleSectionCollapse('band')}
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
            aria-expanded={!collapsedSections.band}
          >
            <span className={`transform transition-transform text-xs ${collapsedSections.band ? '' : 'rotate-90'}`}>
              ▶
            </span>
            <span className="text-sm font-bold uppercase tracking-wide">
              BAND
            </span>
          </button>
        </div>
        {!collapsedSections.band && (
          <div className="ml-2">
            {[
              {
                key: 'band-music',
                label: 'Music',
                icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>,
                items: [
                  { id: 'songs', label: 'Songs', icon: '🎵' },
                  { id: 'setlists', label: 'Setlists', icon: '📋' },
                  { id: 'medleys', label: 'Medleys', icon: '🎶' },
                  { id: 'recordings', label: 'Recordings', icon: '🎙️' },
                  { id: 'practice', label: 'Practice', icon: '🎯' },
                  { id: 'suggestions', label: 'Song Intelligence', icon: '💡' },
                  { id: 'analyzer', label: 'Audio Analyzer', icon: '🔊' },
                ]
              },
              {
                key: 'band-gigs',
                label: 'Gigs',
                icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
                items: [
                  { id: 'calendar', label: 'Calendar', icon: '📅' },
                  { id: 'venues', label: 'Venues', icon: '📍' },
                  { id: 'stage-plots', label: 'Stage Plots', icon: '🎤' },
                  { id: 'archive', label: 'Gig Archive', icon: '📸' },
                  { id: 'bookings', label: 'Booking Inbox', icon: '📬' },
                  { id: 'stats', label: 'Stats', icon: '📊' },
                ]
              },
              {
                key: 'band-people',
                label: 'People',
                icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
                items: [
                  { id: 'members', label: 'Members', icon: '👥' },
                  { id: 'contacts', label: 'Contacts', icon: '📇' },
                  { id: 'achievements', label: 'Achievements', icon: '🏆' },
                  { id: 'timeline', label: 'Timeline', icon: '📜' },
                ]
              },
              {
                key: 'band-community',
                label: 'Community',
                icon: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>,
                items: [
                  { id: 'announcements', label: 'Announcements', icon: '📢' },
                  { id: 'polls', label: 'Polls', icon: '🗳️' },
                  { id: 'kitty', label: 'Band Kitty', icon: '💰' },
                ]
              }
            ].map(category => (
              <div key={category.key} className="mb-1">
                <button
                  onClick={() => toggleSectionCollapse(category.key)}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-gray-500 hover:text-gray-300 transition-colors text-xs w-full"
                  aria-expanded={!collapsedSections[category.key]}
                >
                  <span className={`transform transition-transform ${collapsedSections[category.key] ? '' : 'rotate-90'}`}>
                    ▶
                  </span>
                  <span className="text-gray-400">{category.icon}</span>
                  <span className="uppercase tracking-wider font-medium">{category.label}</span>
                </button>
                {!collapsedSections[category.key] && (
                  <div className="space-y-0.5 ml-3">
                    {category.items.map(item => {
                      const isProOnly = ['kitty', 'stats', 'practice', 'suggestions'].includes(item.id);
                      const isFree = workspace?.effectivePlan !== 'PRO';
                      return (
                        <button
                          key={item.id}
                          onClick={() => onSelectBandView?.(item.id)}
                          className={`channel-item w-full ${activeBandView === item.id ? 'active' : ''}`}
                        >
                          <span className="text-gray-400">{item.icon}</span>
                          <span className="flex-1 truncate">{item.label}</span>
                          {isProOnly && isFree && (
                            <span className="text-[10px] font-bold bg-yellow-600/20 text-yellow-500 px-1.5 py-0.5 rounded">PRO</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

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

        {showUserMenu && <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />}
        {showUserMenu && (
          <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-gray-800 rounded-lg shadow-xl border border-gray-700 overflow-hidden z-50">
            {/* Notifications with snooze options */}
            <div className="relative">
              <button
                onClick={() => {
                  if (!notificationsEnabled) {
                    toggleNotifications();
                    setSnoozeMenuOpen(false);
                  } else {
                    setSnoozeMenuOpen(!snoozeMenuOpen);
                  }
                }}
                disabled={notificationsLoading}
                className="w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors flex items-center justify-between"
              >
                <span>Notifications</span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  !notificationsEnabled ? 'bg-gray-600' :
                  getSnoozeLabel() ? 'bg-yellow-600' : 'bg-green-600'
                }`}>
                  {notificationsLoading ? '...' : !notificationsEnabled ? 'OFF' : getSnoozeLabel() || 'ON'}
                </span>
              </button>
              {snoozeMenuOpen && (
                <div className="absolute bottom-full left-0 mb-1 bg-gray-800 rounded-lg shadow-xl border border-gray-700 min-w-[160px] z-50">
                  {!notificationsEnabled ? (
                    <button
                      onClick={() => { toggleNotifications(); setSnoozeMenuOpen(false); }}
                      className="block w-full px-4 py-2 text-left hover:bg-gray-700 text-sm text-green-400"
                    >
                      Enable Notifications
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleSnooze('off')}
                        className={`block w-full px-4 py-2 text-left hover:bg-gray-700 text-sm ${!getSnoozeLabel() ? 'text-green-400' : ''}`}
                      >
                        Active {!getSnoozeLabel() && '✓'}
                      </button>
                      <button
                        onClick={() => handleSnooze(30)}
                        className="block w-full px-4 py-2 text-left hover:bg-gray-700 text-sm"
                      >
                        Snooze 30 min
                      </button>
                      <button
                        onClick={() => handleSnooze(60)}
                        className="block w-full px-4 py-2 text-left hover:bg-gray-700 text-sm"
                      >
                        Snooze 1 hour
                      </button>
                      <button
                        onClick={() => handleSnooze(120)}
                        className="block w-full px-4 py-2 text-left hover:bg-gray-700 text-sm"
                      >
                        Snooze 2 hours
                      </button>
                      <button
                        onClick={() => handleSnooze('indefinitely')}
                        className={`block w-full px-4 py-2 text-left hover:bg-gray-700 text-sm ${getSnoozeLabel() === 'Paused' ? 'text-yellow-400' : ''}`}
                      >
                        Pause indefinitely {getSnoozeLabel() === 'Paused' && '✓'}
                      </button>
                      <div className="border-t border-gray-700 mt-1 pt-1">
                        <button
                          onClick={() => { toggleNotifications(); setSnoozeMenuOpen(false); }}
                          className="block w-full px-4 py-2 text-left hover:bg-gray-700 text-sm text-red-400"
                        >
                          Disable Notifications
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
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
            {workspace.members?.find(m => m.user.id === user?.id)?.role === 'ADMIN' && (
              <button
                onClick={onShowInvite}
                className="hover:text-gray-300 transition-colors flex items-center gap-1"
                aria-label="Invite people"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                Invite
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="hover:text-gray-300 transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Create Channel Modal */}
      <Modal isOpen={showCreateChannel} onClose={() => { setShowCreateChannel(false); setNewChannelName(''); setIsPrivate(false); setSelectedGroupId(''); }} title="Create a Channel">
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
                onClick={() => { setShowCreateChannel(false); setNewChannelName(''); setIsPrivate(false); setSelectedGroupId(''); }}
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
      </Modal>

      {/* Create Group Modal */}
      <Modal isOpen={showCreateGroup} onClose={() => { setShowCreateGroup(false); setNewGroupName(''); }} title="Create a Channel Group">
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
                onClick={() => { setShowCreateGroup(false); setNewGroupName(''); }}
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
      </Modal>

      {/* New Message Modal */}
      {showNewMessage && (
        <NewMessageModal
          workspace={workspace}
          user={user}
          onStartDM={onStartDM}
          onClose={() => setShowNewMessage(false)}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        workspace={workspace}
        user={user}
        onLogout={onLogout}
        onRefreshWorkspace={onRefreshWorkspace}
      />

      {/* Member Profile Modal */}
      {showProfileUserId && (
        <MemberProfile
          userId={showProfileUserId}
          workspaceId={workspace.id}
          onClose={() => setShowProfileUserId(null)}
          onStartDM={showProfileUserId !== user?.id ? onStartDM : null}
        />
      )}

      {/* Context Menu for Channels/Sections */}
      <ContextMenu
        isOpen={contextMenu !== null}
        position={contextMenu || { x: 0, y: 0 }}
        onClose={closeContextMenu}
        items={[
          ...(contextMenu?.type === 'channel' && onOpenInSplit ? [{
            label: 'Open in split right',
            icon: '⫶',
            onClick: () => {
              onOpenInSplit({ type: 'channel', channelId: contextMenu.id });
              closeContextMenu();
            }
          }] : []),
          ...(contextMenu?.type === 'channel' ? [{
            label: contextMenu?.starred ? 'Unstar channel' : 'Star channel',
            icon: contextMenu?.starred ? '★' : '☆',
            onClick: handleToggleStar
          }, {
            label: contextMenu?.muted ? 'Unmute channel' : 'Mute channel',
            icon: contextMenu?.muted ? '🔔' : '🔕',
            onClick: handleToggleMute
          }] : []),
          ...(isAdmin ? [{
            label: `Rename ${contextMenu?.type || ''}`,
            icon: '✏️',
            onClick: openRenameModal
          },
          {
            label: `Delete ${contextMenu?.type || ''}`,
            icon: '🗑️',
            variant: 'danger',
            onClick: openDeleteConfirm
          }] : [])
        ]}
      />

      {/* Rename Modal */}
      <Modal
        isOpen={renameModal !== null}
        onClose={() => setRenameModal(null)}
        title={`Rename ${renameModal?.type === 'channel' ? 'Channel' : 'Section'}`}
      >
        <div className="modal-body">
          <form onSubmit={handleRename}>
            <div className="mb-4">
              <label className="modal-label">Name</label>
              <div className="flex items-center gap-2">
                {renameModal?.type === 'channel' && <span className="text-gray-400">#</span>}
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(
                    renameModal?.type === 'channel'
                      ? e.target.value.toLowerCase().replace(/\s+/g, '-')
                      : e.target.value
                  )}
                  className="modal-input flex-1"
                  placeholder={renameModal?.type === 'channel' ? 'channel-name' : 'Section Name'}
                  required
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setRenameModal(null)}
                className="btn btn-secondary"
                disabled={renameLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={renameLoading || !renameValue.trim()}
              >
                {renameLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title={`Delete ${deleteConfirm?.type === 'channel' ? 'Channel' : 'Section'}`}
        message={
          deleteConfirm?.type === 'channel'
            ? `Are you sure you want to delete #${deleteConfirm?.name}? This will permanently delete all messages in this channel.`
            : `Are you sure you want to delete the "${deleteConfirm?.name}" section? Channels in this section will be moved to "Other Channels".`
        }
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        loading={deleteLoading}
      />

    </nav>
  );
}

export default Sidebar;
