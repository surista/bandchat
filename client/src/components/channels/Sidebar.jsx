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
import { pushService } from '../../services/push';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import BandMemberForm from '../band/BandMembers/BandMemberForm';
import MemberProfile from '../common/MemberProfile';
import MemberHoverCard from '../common/MemberHoverCard';
import ConfirmDialog from '../common/ConfirmDialog';
import NewMessageModal from './NewMessageModal';

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
  onResizeStart
}) {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const { currentTheme, setTheme, themes } = useTheme();
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
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem(`collapsedGroups:${workspace.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try {
      const saved = localStorage.getItem(`collapsedSections:${workspace.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
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
  const [removingMember, setRemovingMember] = useState(null);
  const [removePostAction, setRemovePostAction] = useState('keep');
  const [removeMergeUserId, setRemoveMergeUserId] = useState('');
  const [removeLoading, setRemoveLoading] = useState(false);
  // Member profile
  const [showProfileUserId, setShowProfileUserId] = useState(null);
  const [showAllMembers, setShowAllMembers] = useState(false);
  // Bio editing
  const [editBio, setEditBio] = useState('');
  // Context menu for channels/sections (admin only)
  const [contextMenu, setContextMenu] = useState(null); // { type: 'channel' | 'section', id, name, x, y }
  const [renameModal, setRenameModal] = useState(null); // { type: 'channel' | 'section', id, name }
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'channel' | 'section', id, name }
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(`collapsedGroups:${workspace.id}`, JSON.stringify(collapsedGroups));
  }, [collapsedGroups, workspace.id]);

  useEffect(() => {
    localStorage.setItem(`collapsedSections:${workspace.id}`, JSON.stringify(collapsedSections));
  }, [collapsedSections, workspace.id]);

  useEffect(() => {
    // Check if notifications are already enabled
    pushService.isSubscribed().then(setNotificationsEnabled);
    // Check snooze status
    api.getNotificationSnoozeStatus()
      .then(({ snoozedUntil }) => setSnoozedUntil(snoozedUntil))
      .catch(() => {});
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

  // Check if current user is admin
  const isAdmin = useMemo(() => {
    return workspace?.members?.find(m => m.user?.id === user?.id)?.role === 'ADMIN';
  }, [workspace, user]);

  // Drag and drop setup for channels (admin only)
  const [activeChannel, setActiveChannel] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 }
    })
  );

  const handleDragStart = (event) => {
    const channel = channels.find(c => c.id === event.active.id);
    setActiveChannel(channel);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveChannel(null);

    if (!over || !isAdmin) return;

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

  // Context menu handlers (admin only)
  const handleContextMenu = (e, type, id, name) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ type, id, name, x: e.clientX, y: e.clientY });
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
      alert(err.message || 'Failed to rename');
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
      alert(err.message || 'Failed to delete');
      setDeleteLoading(false);
    }
  };

  // Close context menu on click outside or escape
  useEffect(() => {
    if (!contextMenu) return;

    const handleClick = () => closeContextMenu();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    const handleScroll = () => closeContextMenu();

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu]);

  const renderChannel = (channel) => {
    const channelButton = (
      <button
        key={channel.id}
        onClick={() => onSelectChannel(channel)}
        onContextMenu={(e) => handleContextMenu(e, 'channel', channel.id, channel.name)}
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
    <div
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
            {channelGroups.map((group) => (
              <DroppableSection key={group.id} groupId={group.id}>
                <div className="mb-2 ml-2">
                  <button
                    onClick={() => toggleGroupCollapse(group.id)}
                    onContextMenu={(e) => handleContextMenu(e, 'section', group.id, group.name)}
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
              </DroppableSection>
            ))}

            {/* Ungrouped Channels */}
            <DroppableSection groupId={null}>
              {ungroupedChannels.length > 0 && (
                <div className="space-y-0.5 ml-2">
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
            <DragOverlay>
              {activeChannel ? (
                <div className="channel-item bg-slack-sidebar border border-blue-500 rounded shadow-lg opacity-90">
                  <span className="text-gray-400">
                    {activeChannel.isPrivate ? '🔒' : '#'}
                  </span>
                  <span className="flex-1 truncate">{activeChannel.name}</span>
                </div>
              ) : null}
            </DragOverlay>
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
          <div className="space-y-0.5 ml-2">
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
            <button
              onClick={() => onSelectBandView?.('timeline')}
              className={`channel-item w-full ${activeBandView === 'timeline' ? 'active' : ''}`}
            >
              <span className="text-gray-400">📜</span>
              <span className="flex-1 truncate">Timeline</span>
            </button>
            <button
              onClick={() => onSelectBandView?.('achievements')}
              className={`channel-item w-full ${activeBandView === 'achievements' ? 'active' : ''}`}
            >
              <span className="text-gray-400">🏆</span>
              <span className="flex-1 truncate">Achievements</span>
            </button>
            <button
              onClick={() => onSelectBandView?.('recordings')}
              className={`channel-item w-full ${activeBandView === 'recordings' ? 'active' : ''}`}
            >
              <span className="text-gray-400">🎙️</span>
              <span className="flex-1 truncate">Recordings</span>
            </button>
            <button
              onClick={() => onSelectBandView?.('suggestions')}
              className={`channel-item w-full ${activeBandView === 'suggestions' ? 'active' : ''}`}
            >
              <span className="text-gray-400">💡</span>
              <span className="flex-1 truncate">Song Intelligence</span>
            </button>
            <button
              onClick={() => onSelectBandView?.('kitty')}
              className={`channel-item w-full ${activeBandView === 'kitty' ? 'active' : ''}`}
            >
              <span className="text-gray-400">💰</span>
              <span className="flex-1 truncate">Band Kitty</span>
            </button>
            <button
              onClick={() => onSelectBandView?.('analyzer')}
              className={`channel-item w-full ${activeBandView === 'analyzer' ? 'active' : ''}`}
            >
              <span className="text-gray-400">🔊</span>
              <span className="flex-1 truncate">Audio Analyzer</span>
            </button>
          </div>
        )}

        {/* Members Section */}
        <div className="mt-6 px-4 mb-2 flex items-center justify-between">
          <button
            onClick={() => toggleSectionCollapse('members')}
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
            aria-expanded={!collapsedSections.members}
          >
            <span className={`transform transition-transform text-xs ${collapsedSections.members ? '' : 'rotate-90'}`}>
              ▶
            </span>
            <span className="text-sm font-bold uppercase tracking-wide">
              MEMBERS ({workspace.members?.length || 0})
            </span>
          </button>
          {!collapsedSections.members && workspace.members?.find(m => m.user.id === user?.id)?.role === 'ADMIN' && (
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

        {!collapsedSections.members && (
          <div className="space-y-0.5 ml-2">
            {(showAllMembers ? workspace.members : workspace.members?.slice(0, 10))?.map((member) => (
              <MemberHoverCard
                key={member.user.id}
                userId={member.user.id}
                workspaceId={workspace.id}
                onClick={() => setShowProfileUserId(member.user.id)}
              >
                <button
                  className="flex items-center gap-2 px-4 py-2.5 sm:py-1 text-gray-300 w-full text-left min-h-[44px] sm:min-h-0 hover:bg-slack-hover cursor-pointer"
                  aria-label={`View ${member.user.displayName}'s profile`}
                >
                  {member.user.avatarUrl ? (
                    <img
                      src={member.user.avatarUrl}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs flex-shrink-0">
                      {member.user.displayName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="truncate flex-1">
                    {member.user.displayName}
                    {member.user.id === user?.id && ' (you)'}
                  </span>
                  {member.role === 'ADMIN' && (
                    <span className="text-xs text-gray-500">admin</span>
                  )}
                </button>
              </MemberHoverCard>
            ))}
            {workspace.members?.length > 10 && (
              <button
                onClick={() => setShowAllMembers(prev => !prev)}
                className="px-4 py-1 text-gray-500 hover:text-gray-300 text-sm"
              >
                {showAllMembers ? 'Show less' : `+${workspace.members.length - 10} more`}
              </button>
            )}
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

        {showUserMenu && (
          <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-gray-800 rounded-lg shadow-xl border border-gray-700 overflow-hidden">
            {/* Notifications with snooze options */}
            <div className="relative">
              <button
                onClick={() => setSnoozeMenuOpen(!snoozeMenuOpen)}
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
                <div className="absolute left-full bottom-0 ml-1 bg-gray-800 rounded-lg shadow-xl border border-gray-700 min-w-[160px] z-50">
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
                setEditBio(user?.bio || '');
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

      {/* New Message Modal */}
      {showNewMessage && (
        <NewMessageModal
          workspace={workspace}
          user={user}
          onStartDM={onStartDM}
          onClose={() => setShowNewMessage(false)}
        />
      )}

      {/* Settings Modal - Portal to body to escape sidebar transform */}
      {showSettings && createPortal(
        <div className="modal-backdrop">
          <div className="modal-content max-w-3xl max-h-modal flex flex-col">
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
                          avatarUrl: editAvatarUrl || null,
                          bio: editBio || null
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
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Bio
                      </label>
                      <textarea
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        className="w-full bg-[var(--color-modal-input)] border border-[var(--color-modal-border)] rounded px-3 py-2 text-white placeholder-gray-400"
                        placeholder="Tell others about yourself..."
                        rows={3}
                        maxLength={500}
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        {editBio.length}/500 characters
                      </p>
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
                          <>
                            <button
                              onClick={async () => {
                                const adminPassword = prompt('Enter YOUR password to confirm:');
                                if (!adminPassword) return;
                                const newPassword = prompt(`Enter new password for ${member.user.displayName} (min 6 characters):`);
                                if (!newPassword) return;
                                if (newPassword.length < 6) {
                                  alert('Password must be at least 6 characters');
                                  return;
                                }
                                try {
                                  await api.adminResetPassword(workspace.id, member.user.id, newPassword, adminPassword);
                                  alert(`Password reset for ${member.user.displayName}`);
                                } catch (err) {
                                  alert(err.message);
                                }
                              }}
                              className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1"
                            >
                              Reset PW
                            </button>
                            <button
                              onClick={() => {
                                setRemovingMember(member);
                                setRemovePostAction('keep');
                                setRemoveMergeUserId('');
                              }}
                              className="text-xs text-red-400 hover:text-red-300 px-2 py-1"
                            >
                              Remove
                            </button>
                          </>
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

                  {/* Remove Member Modal */}
                  {removingMember && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                      <div className="bg-[var(--color-modal-bg)] rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-bold text-white mb-4">
                          Remove {removingMember.user.displayName}?
                        </h3>
                        <p className="text-gray-400 text-sm mb-4">
                          What should happen to their messages?
                        </p>
                        <div className="space-y-2 mb-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="postAction"
                              value="keep"
                              checked={removePostAction === 'keep'}
                              onChange={(e) => setRemovePostAction(e.target.value)}
                            />
                            <span className="text-gray-200">Keep messages as-is</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="postAction"
                              value="hide"
                              checked={removePostAction === 'hide'}
                              onChange={(e) => setRemovePostAction(e.target.value)}
                            />
                            <span className="text-gray-200">Hide all messages</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="postAction"
                              value="delete"
                              checked={removePostAction === 'delete'}
                              onChange={(e) => setRemovePostAction(e.target.value)}
                            />
                            <span className="text-gray-200">Delete all messages</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="postAction"
                              value="anonymize"
                              checked={removePostAction === 'anonymize'}
                              onChange={(e) => setRemovePostAction(e.target.value)}
                            />
                            <span className="text-gray-200">Show as "Removed User"</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="postAction"
                              value="merge"
                              checked={removePostAction === 'merge'}
                              onChange={(e) => setRemovePostAction(e.target.value)}
                            />
                            <span className="text-gray-200">Transfer messages to another member</span>
                          </label>
                          {removePostAction === 'merge' && (
                            <select
                              value={removeMergeUserId}
                              onChange={(e) => setRemoveMergeUserId(e.target.value)}
                              className="modal-input ml-6 mt-2"
                            >
                              <option value="">Select member...</option>
                              {workspace.members
                                ?.filter(m => m.user.id !== removingMember.user.id && m.user.id !== user?.id)
                                .map(m => (
                                  <option key={m.user.id} value={m.user.id}>
                                    {m.user.displayName}
                                  </option>
                                ))}
                            </select>
                          )}
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setRemovingMember(null)}
                            className="btn btn-secondary"
                            disabled={removeLoading}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={async () => {
                              if (removePostAction === 'merge' && !removeMergeUserId) {
                                alert('Please select a member to transfer messages to');
                                return;
                              }
                              setRemoveLoading(true);
                              try {
                                await api.removeMember(
                                  workspace.id,
                                  removingMember.user.id,
                                  removePostAction,
                                  removeMergeUserId || null
                                );
                                setRemovingMember(null);
                                window.location.reload();
                              } catch (err) {
                                alert(err.message);
                              } finally {
                                setRemoveLoading(false);
                              }
                            }}
                            className="btn bg-red-600 hover:bg-red-700 text-white"
                            disabled={removeLoading}
                          >
                            {removeLoading ? 'Removing...' : 'Remove Member'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
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
                        workspaceMembers={workspace?.members || []}
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

      {/* Member Profile Modal */}
      {showProfileUserId && (
        <MemberProfile
          userId={showProfileUserId}
          workspaceId={workspace.id}
          onClose={() => setShowProfileUserId(null)}
          onStartDM={showProfileUserId !== user?.id ? onStartDM : null}
        />
      )}

      {/* Context Menu for Channels/Sections (Admin Only) */}
      {contextMenu && createPortal(
        <div
          className="fixed bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 z-[100] min-w-[160px]"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 100),
            left: Math.min(contextMenu.x, window.innerWidth - 180)
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={openRenameModal}
            className="w-full px-4 py-2 text-left text-gray-200 hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <span>Rename {contextMenu.type}</span>
          </button>
          <button
            onClick={openDeleteConfirm}
            className="w-full px-4 py-2 text-left text-red-400 hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <span>Delete {contextMenu.type}</span>
          </button>
        </div>,
        document.body
      )}

      {/* Rename Modal */}
      {renameModal && createPortal(
        <div className="modal-backdrop" onClick={() => setRenameModal(null)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rename {renameModal.type === 'channel' ? 'Channel' : 'Section'}</h3>
              <button
                onClick={() => setRenameModal(null)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleRename}>
                <div className="mb-4">
                  <label className="modal-label">Name</label>
                  <div className="flex items-center gap-2">
                    {renameModal.type === 'channel' && <span className="text-gray-400">#</span>}
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(
                        renameModal.type === 'channel'
                          ? e.target.value.toLowerCase().replace(/\s+/g, '-')
                          : e.target.value
                      )}
                      className="modal-input flex-1"
                      placeholder={renameModal.type === 'channel' ? 'channel-name' : 'Section Name'}
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
                    className="btn bg-green-600 hover:bg-green-700 text-white"
                    disabled={renameLoading || !renameValue.trim()}
                  >
                    {renameLoading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

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
    </div>
  );
}

export default Sidebar;
