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
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import BandMemberForm from '../band/BandMembers/BandMemberForm';
import MemberProfile from '../common/MemberProfile';
import MemberHoverCard from '../common/MemberHoverCard';
import ConfirmDialog from '../common/ConfirmDialog';
import ContextMenu from '../common/ContextMenu';
import useLongPress from '../../hooks/useLongPress';
import NewMessageModal from './NewMessageModal';
import SlackImportWizard from '../workspaces/SlackImportWizard';
import Skeleton from '../common/Skeleton';
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
function ChannelItem({ channel, isSelected, onSelect, onLongPress, isAdmin }) {
  const longPress = useLongPress({
    onLongPress: isAdmin ? (pos) => onLongPress(pos) : undefined,
    onTap: onSelect,
    disabled: !isAdmin,
  });

  return (
    <button
      className={`channel-item w-full ${isSelected ? 'active' : ''}`}
      {...longPress}
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
  onReorderGroups
}) {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const { currentTheme, setTheme, themes, mode, toggleMode } = useTheme();
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
  const [showSlackImport, setShowSlackImport] = useState(false);
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
  const [deleteBandMemberId, setDeleteBandMemberId] = useState(null);
  const [passwordResetMember, setPasswordResetMember] = useState(null);
  const [resetAdminPassword, setResetAdminPassword] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [removingMember, setRemovingMember] = useState(null);
  const [removePostAction, setRemovePostAction] = useState('keep');
  const [removeMergeUserId, setRemoveMergeUserId] = useState('');
  const [removeLoading, setRemoveLoading] = useState(false);
  // Member profile
  const [showProfileUserId, setShowProfileUserId] = useState(null);
  const [showAllMembers, setShowAllMembers] = useState(false);
  // Bio editing
  const [editBio, setEditBio] = useState('');
  // Account deletion
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  // Workspace leave/delete
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [deleteWsConfirmOpen, setDeleteWsConfirmOpen] = useState(false);
  const [deleteWsName, setDeleteWsName] = useState('');
  const [wsActionLoading, setWsActionLoading] = useState(false);
  const [wsActionError, setWsActionError] = useState('');
  // Admin member editing
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editMemberName, setEditMemberName] = useState('');
  const [editMemberEmail, setEditMemberEmail] = useState('');
  const [editMemberLoading, setEditMemberLoading] = useState(false);
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
    try {
      await api.deleteBandMember(memberId);
      await loadBandMembers();
      setDeleteBandMemberId(null);
    } catch (err) {
      setSettingsError(err.message);
      setDeleteBandMemberId(null);
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
    if (!isAdmin) return;
    setContextMenu({ type: 'channel', id: channel.id, name: channel.name, x: pos.x, y: pos.y });
  };

  const renderChannel = (channel) => {
    const channelButton = (
      <ChannelItem
        key={channel.id}
        channel={channel}
        isSelected={selectedChannel?.id === channel.id}
        onSelect={() => onSelectChannel(channel)}
        onLongPress={(pos) => handleChannelLongPress(channel, pos)}
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
    <div
      data-sidebar
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
                              {groupedChannels[group.id]?.length || 0}
                            </span>
                          </button>
                        </div>
                        {!collapsedGroups[group.id] && (
                          <div className="space-y-0.5 ml-2">
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
            className="hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Settings
          </button>
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
        <div className="modal-backdrop !items-start !pt-12">
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
            <div className="flex border-b border-[var(--color-modal-border)] justify-center">
              <button
                onClick={() => setSettingsTab('profile')}
                className={`px-3 pt-2.5 pb-3 font-medium whitespace-nowrap transition-colors text-sm ${
                  settingsTab === 'profile'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Profile
              </button>
              <button
                onClick={() => setSettingsTab('workspace')}
                className={`px-3 pt-2.5 pb-3 font-medium whitespace-nowrap transition-colors text-sm ${
                  settingsTab === 'workspace'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Workspace
              </button>
              <button
                onClick={() => setSettingsTab('theme')}
                className={`px-3 pt-2.5 pb-3 font-medium whitespace-nowrap transition-colors text-sm ${
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
                    className={`px-3 pt-2.5 pb-3 font-medium whitespace-nowrap transition-colors text-sm ${
                      settingsTab === 'members'
                        ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Members
                  </button>
                  <button
                    onClick={() => setSettingsTab('bandmembers')}
                    className={`px-3 pt-2.5 pb-3 font-medium whitespace-nowrap transition-colors text-sm ${
                      settingsTab === 'bandmembers'
                        ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Band
                  </button>
                  <button
                    onClick={() => setSettingsTab('import')}
                    className={`px-3 pt-2.5 pb-3 font-medium whitespace-nowrap transition-colors text-sm ${
                      settingsTab === 'import'
                        ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Import
                  </button>
                </>
              )}
              <button
                onClick={() => setSettingsTab('whatsnew')}
                className={`px-3 pt-2.5 pb-3 font-medium whitespace-nowrap transition-colors text-sm ${
                  settingsTab === 'whatsnew'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                New
              </button>
              <button
                onClick={() => setSettingsTab('about')}
                className={`px-3 pt-2.5 pb-3 font-medium whitespace-nowrap transition-colors text-sm ${
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
                <div className="space-y-4">
                  {/* Profile Info Section */}
                  <form
                    className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-[var(--color-modal-border)]"
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

                  {/* Email Section */}
                  <form
                    className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-[var(--color-modal-border)]"
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

                  {/* Password Section */}
                  <form
                    className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-[var(--color-modal-border)]"
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

                  {/* Export My Data */}
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-[var(--color-modal-border)]">
                    <h4 className="text-lg font-medium text-white mb-2">Export My Data</h4>
                    <p className="text-sm text-gray-400 mb-3">
                      Download all your data as a JSON file including your profile, messages, and content you created.
                    </p>
                    <button
                      onClick={async () => {
                        setSettingsLoading(true);
                        setSettingsError('');
                        try {
                          await api.exportUserData();
                          setSettingsSuccess('Export downloaded');
                        } catch (err) {
                          setSettingsError(err.message);
                        } finally {
                          setSettingsLoading(false);
                        }
                      }}
                      disabled={settingsLoading}
                      className="btn bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                    >
                      {settingsLoading ? 'Exporting...' : 'Download My Data'}
                    </button>
                  </div>

                  {/* Delete Account */}
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-red-900/50">
                    <h4 className="text-lg font-medium text-red-400 mb-2">Delete Account</h4>
                    <p className="text-sm text-gray-400 mb-3">
                      Permanently delete your account. Your messages will be anonymized and your profile data removed. This cannot be undone.
                    </p>
                    {!deleteConfirmOpen ? (
                      <button
                        onClick={() => setDeleteConfirmOpen(true)}
                        className="btn bg-red-600 hover:bg-red-700 text-white"
                      >
                        Delete My Account
                      </button>
                    ) : (
                      <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 space-y-3">
                        <p className="text-sm text-red-300 font-medium">
                          Are you sure? Enter your password to confirm.
                        </p>
                        <input
                          type="password"
                          value={deletePassword}
                          onChange={(e) => setDeletePassword(e.target.value)}
                          className="modal-input"
                          placeholder={user?.authProvider === 'google' && !user?.password ? 'No password needed for Google accounts' : 'Enter your password'}
                          disabled={user?.authProvider === 'google' && !user?.password}
                        />
                        {deleteError && (
                          <p className="text-sm text-red-400">{deleteError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              setDeleteError('');
                              setSettingsLoading(true);
                              try {
                                await api.deleteAccount(deletePassword || undefined);
                                onLogout();
                              } catch (err) {
                                setDeleteError(err.message);
                              } finally {
                                setSettingsLoading(false);
                              }
                            }}
                            disabled={settingsLoading || (user?.authProvider !== 'google' && !deletePassword)}
                            className="btn bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                          >
                            {settingsLoading ? 'Deleting...' : 'Permanently Delete'}
                          </button>
                          <button
                            onClick={() => { setDeleteConfirmOpen(false); setDeletePassword(''); setDeleteError(''); }}
                            className="btn btn-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Theme Tab */}
              {settingsTab === 'theme' && (
                <div>
                  {/* Dark/Light Mode Toggle */}
                  <div className="flex items-center justify-between mb-6 p-3 bg-gray-800 rounded-lg">
                    <span className="text-gray-300 text-sm font-medium">Appearance</span>
                    <div className="flex rounded-lg bg-gray-900 p-0.5">
                      <button
                        onClick={() => mode !== 'dark' && toggleMode()}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                          mode === 'dark' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                        Dark
                      </button>
                      <button
                        onClick={() => mode !== 'light' && toggleMode()}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                          mode === 'light' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        Light
                      </button>
                    </div>
                  </div>
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
                  {/* Export Workspace Data (Admin) */}
                  <div className="p-3 bg-[var(--color-modal-card)] rounded-lg mb-4">
                    <h4 className="text-sm font-medium text-white mb-1">Export Workspace Data</h4>
                    <p className="text-xs text-gray-400 mb-2">Download all workspace data as JSON (channels, messages, songs, gigs, etc.)</p>
                    <button
                      onClick={async () => {
                        setSettingsLoading(true);
                        setSettingsError('');
                        try {
                          await api.exportWorkspaceData(workspace.id);
                          setSettingsSuccess('Workspace export downloaded');
                        } catch (err) {
                          setSettingsError(err.message);
                        } finally {
                          setSettingsLoading(false);
                        }
                      }}
                      disabled={settingsLoading}
                      className="btn bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50"
                    >
                      {settingsLoading ? 'Exporting...' : 'Download Workspace Data'}
                    </button>
                  </div>

                  {workspace.members?.map((member) => (
                    <div
                      key={member.user.id}
                      className="p-3 bg-[var(--color-modal-card)] rounded-lg"
                    >
                      {editingMemberId === member.user.id ? (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            setEditMemberLoading(true);
                            try {
                              const updates = {};
                              if (editMemberName.trim() !== member.user.displayName) {
                                updates.displayName = editMemberName.trim();
                              }
                              if (editMemberEmail.trim().toLowerCase() !== member.user.email?.toLowerCase()) {
                                updates.email = editMemberEmail.trim();
                              }
                              if (Object.keys(updates).length > 0) {
                                await api.adminUpdateMember(workspace.id, member.user.id, updates);
                                window.location.reload();
                              } else {
                                setEditingMemberId(null);
                              }
                            } catch (err) {
                              toast.error(err.message);
                            } finally {
                              setEditMemberLoading(false);
                            }
                          }}
                          className="space-y-2"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-[var(--color-accent)] flex items-center justify-center text-white font-medium flex-shrink-0">
                              {editMemberName?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                value={editMemberName}
                                onChange={(e) => setEditMemberName(e.target.value)}
                                className="modal-input w-full"
                                placeholder="Display name"
                                required
                                minLength={2}
                                maxLength={50}
                                autoFocus
                              />
                              <input
                                type="email"
                                value={editMemberEmail}
                                onChange={(e) => setEditMemberEmail(e.target.value)}
                                className="modal-input w-full"
                                placeholder="Email address"
                                required
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setEditingMemberId(null)}
                              className="btn btn-secondary text-xs"
                              disabled={editMemberLoading}
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="btn bg-blue-600 hover:bg-blue-700 text-white text-xs"
                              disabled={editMemberLoading}
                            >
                              {editMemberLoading ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between">
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
                                  onClick={() => {
                                    setEditingMemberId(member.user.id);
                                    setEditMemberName(member.user.displayName || '');
                                    setEditMemberEmail(member.user.email || '');
                                  }}
                                  className="text-xs text-green-400 hover:text-green-300 px-2 py-1"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    setPasswordResetMember(member);
                                    setResetAdminPassword('');
                                    setResetNewPassword('');
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
                                  toast.error(err.message);
                                }
                              }}
                              className="modal-input w-auto"
                            >
                              <option value="MEMBER">Member</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Remove Member Modal */}
                  {removingMember && createPortal(
                    <div className="modal-backdrop">
                      <div className="modal-content max-w-md mx-4">
                        <div className="p-6">
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
                                  toast.warning('Please select a member to transfer messages to');
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
                                  toast.error(err.message);
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
                    </div>,
                    document.body
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
                        <div className="space-y-4 p-4">
                          {Array.from({length: 3}).map((_, i) => <Skeleton.ListItem key={i} />)}
                        </div>
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
                                              onClick={() => setDeleteBandMemberId(member.id)}
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
                                              onClick={() => setDeleteBandMemberId(member.id)}
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
                                              onClick={() => setDeleteBandMemberId(member.id)}
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
                                              onClick={() => setDeleteBandMemberId(member.id)}
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

              {/* Workspace Tab */}
              {settingsTab === 'workspace' && (
                <div className="space-y-4">
                  {/* Workspace Info */}
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-[var(--color-modal-border)]">
                    <h4 className="text-lg font-medium text-white mb-1">Workspace</h4>
                    <p className="text-sm text-gray-400">{workspace.name}</p>
                    <p className="text-xs text-gray-500 mt-2">{workspace.members?.length || 0} members</p>
                  </div>

                  {wsActionError && (
                    <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg">
                      {wsActionError}
                    </div>
                  )}

                  {/* Leave Workspace */}
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-[var(--color-modal-border)]">
                    <h4 className="text-lg font-medium text-white mb-2">Leave Workspace</h4>
                    <p className="text-sm text-gray-400 mb-4">
                      You will lose access to all channels and messages in this workspace. You can rejoin later with an invite code.
                    </p>
                    {!leaveConfirmOpen ? (
                      <button
                        onClick={() => { setLeaveConfirmOpen(true); setWsActionError(''); }}
                        className="btn bg-red-600 hover:bg-red-700 text-white"
                      >
                        Leave Workspace
                      </button>
                    ) : (
                      <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 space-y-3">
                        <p className="text-sm text-red-300 font-medium">
                          Are you sure you want to leave {workspace.name}?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              setWsActionLoading(true);
                              setWsActionError('');
                              try {
                                await api.leaveWorkspace(workspace.id);
                                setShowSettings(false);
                                navigate('/');
                              } catch (err) {
                                setWsActionError(err.message);
                              } finally {
                                setWsActionLoading(false);
                              }
                            }}
                            disabled={wsActionLoading}
                            className="btn bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                          >
                            {wsActionLoading ? 'Leaving...' : 'Confirm Leave'}
                          </button>
                          <button
                            onClick={() => { setLeaveConfirmOpen(false); setWsActionError(''); }}
                            className="btn btn-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Delete Workspace (Admin only) */}
                  {workspace.members?.find(m => m.user.id === user?.id)?.role === 'ADMIN' && (
                    <div className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-red-900/50">
                      <h4 className="text-lg font-medium text-red-400 mb-2">Delete Workspace</h4>
                      <p className="text-sm text-gray-400 mb-4">
                        Permanently delete this workspace and all its data including channels, messages, songs, setlists, and gigs. This cannot be undone.
                      </p>
                      {!deleteWsConfirmOpen ? (
                        <button
                          onClick={() => { setDeleteWsConfirmOpen(true); setDeleteWsName(''); setWsActionError(''); }}
                          className="btn bg-red-600 hover:bg-red-700 text-white"
                        >
                          Delete Workspace
                        </button>
                      ) : (
                        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 space-y-3">
                          <p className="text-sm text-red-300 font-medium">
                            Type <span className="font-bold text-white">{workspace.name}</span> to confirm deletion:
                          </p>
                          <input
                            type="text"
                            value={deleteWsName}
                            onChange={(e) => setDeleteWsName(e.target.value)}
                            className="modal-input"
                            placeholder={workspace.name}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                setWsActionLoading(true);
                                setWsActionError('');
                                try {
                                  await api.deleteWorkspace(workspace.id);
                                  setShowSettings(false);
                                  navigate('/');
                                } catch (err) {
                                  setWsActionError(err.message);
                                } finally {
                                  setWsActionLoading(false);
                                }
                              }}
                              disabled={wsActionLoading || deleteWsName !== workspace.name}
                              className="btn bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                            >
                              {wsActionLoading ? 'Deleting...' : 'Permanently Delete'}
                            </button>
                            <button
                              onClick={() => { setDeleteWsConfirmOpen(false); setDeleteWsName(''); setWsActionError(''); }}
                              className="btn btn-secondary"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* What's New Tab */}
              {settingsTab === 'whatsnew' && (
                <div className="space-y-4">
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 border border-[var(--color-modal-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded">NEW</span>
                      <span className="text-sm text-gray-500">v1.01.22</span>
                    </div>
                    <h4 className="font-medium text-white mb-1">Bulk Song Import with Metadata</h4>
                    <p className="text-sm text-gray-400">
                      Import multiple songs at once! Paste a list of songs and we'll automatically fetch BPM, key, and duration.
                    </p>
                  </div>
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 border border-[var(--color-modal-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-500">v1.01.20</span>
                    </div>
                    <h4 className="font-medium text-white mb-1">MC Sections in Setlists</h4>
                    <p className="text-sm text-gray-400">
                      Add talking/banter breaks between songs in your setlists with customizable durations.
                    </p>
                  </div>
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 border border-[var(--color-modal-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-500">v1.01.18</span>
                    </div>
                    <h4 className="font-medium text-white mb-1">12 New Themes</h4>
                    <p className="text-sm text-gray-400">
                      Customize your sidebar with 12 beautiful color themes including Aubergine, Ocean, Forest, and more.
                    </p>
                  </div>
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 border border-[var(--color-modal-border)]">
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
                      src="/icon-192.png"
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

              {settingsTab === 'import' && (
                <div className="space-y-6">
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-6 text-center">
                    <div className="text-4xl mb-3">📦</div>
                    <h3 className="text-lg font-bold text-white mb-2">Import from Slack</h3>
                    <p className="text-gray-400 text-sm mb-4 leading-relaxed">
                      Import your Slack workspace history into BandChat. Upload a Slack export ZIP file and
                      choose how to map users, channels, and gigs.
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setShowSettings(false);
                        setShowSlackImport(true);
                      }}
                    >
                      Start Import Wizard
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSlackImport && (
        <SlackImportWizard
          workspace={workspace}
          onClose={() => setShowSlackImport(false)}
        />
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
      <ContextMenu
        isOpen={contextMenu !== null}
        position={contextMenu || { x: 0, y: 0 }}
        onClose={closeContextMenu}
        items={[
          {
            label: `Rename ${contextMenu?.type || ''}`,
            icon: '✏️',
            onClick: openRenameModal
          },
          {
            label: `Delete ${contextMenu?.type || ''}`,
            icon: '🗑️',
            variant: 'danger',
            onClick: openDeleteConfirm
          }
        ]}
      />

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

      <ConfirmDialog
        isOpen={deleteBandMemberId !== null}
        title="Delete Band Member"
        message="Delete this band member?"
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDeleteBandMember(deleteBandMemberId)}
        onCancel={() => setDeleteBandMemberId(null)}
      />

      {/* Password Reset Modal */}
      {passwordResetMember && createPortal(
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPasswordResetMember(null); }}>
          <div className="modal-content max-w-sm">
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">Reset Password for {passwordResetMember.user.displayName}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Your password (confirm)</label>
                  <input
                    type="password"
                    value={resetAdminPassword}
                    onChange={(e) => setResetAdminPassword(e.target.value)}
                    className="modal-input w-full"
                    placeholder="Your admin password"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">New password (min 6 characters)</label>
                  <input
                    type="password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    className="modal-input w-full"
                    placeholder="New password"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button
                  onClick={() => setPasswordResetMember(null)}
                  className="btn btn-secondary min-h-[44px] px-4"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!resetAdminPassword || !resetNewPassword) return;
                    if (resetNewPassword.length < 6) {
                      toast.warning('Password must be at least 6 characters');
                      return;
                    }
                    try {
                      await api.adminResetPassword(workspace.id, passwordResetMember.user.id, resetNewPassword, resetAdminPassword);
                      toast.success(`Password reset for ${passwordResetMember.user.displayName}`);
                      setPasswordResetMember(null);
                    } catch (err) {
                      toast.error(err.message);
                    }
                  }}
                  disabled={!resetAdminPassword || !resetNewPassword}
                  className="btn bg-blue-600 hover:bg-blue-700 text-white min-h-[44px] px-4 disabled:opacity-50"
                >
                  Reset Password
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Sidebar;
