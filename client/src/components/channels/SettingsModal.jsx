/**
 * @fileoverview Settings modal extracted from Sidebar.
 * Contains profile, workspace, theme, members, band members, import, what's new, and support tabs.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import { CURRENCIES } from '../../utils/currencies';
import BandMemberForm from '../band/BandMembers/BandMemberForm';
import Skeleton from '../common/Skeleton';
import ConfirmDialog from '../common/ConfirmDialog';
import SlackImportWizard from '../workspaces/SlackImportWizard';

function SettingsModal({ isOpen, onClose, workspace, user, onLogout, onRefreshWorkspace }) {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const { currentTheme, setTheme, themes, mode, toggleMode } = useTheme();
  const toast = useToast();

  const [settingsTab, setSettingsTab] = useState('profile');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
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
  // Bio editing
  const [editBio, setEditBio] = useState('');
  // Account deletion
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
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
  // Slack import
  const [showSlackImport, setShowSlackImport] = useState(false);
  // Relink messages
  const [relinkLoading, setRelinkLoading] = useState(false);
  const [relinkResult, setRelinkResult] = useState(null);
  const [orphanedAuthors, setOrphanedAuthors] = useState(null);
  const [orphanLoading, setOrphanLoading] = useState(false);
  const [manualMappings, setManualMappings] = useState({});
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  // Workspace defaults
  const [wsDefaultsLoading, setWsDefaultsLoading] = useState(false);
  const [wsCurrency, setWsCurrency] = useState(workspace?.currency || 'USD');
  const [wsEventType, setWsEventType] = useState(workspace?.defaultEventType || 'GIG');
  const [wsStartTime, setWsStartTime] = useState(workspace?.defaultStartTime || '19:00');
  const [wsEndTime, setWsEndTime] = useState(workspace?.defaultEndTime || '21:00');
  const [wsVenue, setWsVenue] = useState(workspace?.defaultVenue || '');
  const [wsDefaultsSaved, setWsDefaultsSaved] = useState(false);
  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState(null);
  const [notifPrefsLoading, setNotifPrefsLoading] = useState(false);

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
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
      // Re-sync workspace defaults
      setWsCurrency(workspace?.currency || 'USD');
      setWsEventType(workspace?.defaultEventType || 'GIG');
      setWsStartTime(workspace?.defaultStartTime || '19:00');
      setWsEndTime(workspace?.defaultEndTime || '21:00');
      setWsVenue(workspace?.defaultVenue || '');
      setWsDefaultsSaved(false);
    }
  }, [isOpen, user?.displayName, user?.avatarUrl, user?.bio]);

  // ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Clear error/success messages when switching tabs
  useEffect(() => {
    setSettingsError('');
    setSettingsSuccess('');
  }, [settingsTab]);

  // Load band members when bandmembers tab is selected
  useEffect(() => {
    if (settingsTab === 'bandmembers' && workspace?.id) {
      loadBandMembers();
    }
  }, [settingsTab, workspace?.id]);

  // Load notification preferences when notifications tab is selected
  useEffect(() => {
    if (settingsTab === 'notifications' && workspace?.id) {
      setNotifPrefsLoading(true);
      api.getNotificationPreferences(workspace.id)
        .then(data => setNotifPrefs(data))
        .catch(() => setNotifPrefs({ notifyDMs: true, notifyMentions: true, notifyGigChanges: true, notifyAnnouncements: true, notifyChannelMessages: true }))
        .finally(() => setNotifPrefsLoading(false));
    }
  }, [settingsTab, workspace?.id]);

  const isAdmin = workspace?.members?.find(m => m.user?.id === user?.id)?.role === 'ADMIN';

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
    setProfileLoading(true);
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
      setProfileLoading(false);
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
      const result = await api.uploadFile(file, workspace.id);
      setEditAvatarUrl(result.url);
    } catch (err) {
      setSettingsError(err.message || 'Failed to upload avatar');
    } finally {
      setAvatarUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {createPortal(
        <div className="modal-backdrop !items-start !pt-12" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <div className="modal-content max-w-3xl max-h-modal flex flex-col">
            <div className="modal-header">
              <h3>Settings</h3>
              <button
                onClick={onClose}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--color-modal-border)] overflow-x-auto scrollbar-hide" role="tablist" style={{ scrollbarWidth: 'none' }}>
              <button
                role="tab"
                aria-selected={settingsTab === 'profile'}
                onClick={() => setSettingsTab('profile')}
                className={`px-3 pt-3 pb-3.5 font-medium whitespace-nowrap transition-colors text-sm ${
                  settingsTab === 'profile'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                Profile
              </button>
              <button
                role="tab"
                aria-selected={settingsTab === 'workspace'}
                onClick={() => setSettingsTab('workspace')}
                className={`px-3 pt-3 pb-3.5 font-medium whitespace-nowrap transition-colors text-sm ${
                  settingsTab === 'workspace'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                Workspace
              </button>
              <button
                role="tab"
                aria-selected={settingsTab === 'theme'}
                onClick={() => setSettingsTab('theme')}
                className={`px-3 pt-3 pb-3.5 font-medium whitespace-nowrap transition-colors text-sm ${
                  settingsTab === 'theme'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                Theme
              </button>
              <button
                role="tab"
                aria-selected={settingsTab === 'notifications'}
                onClick={() => setSettingsTab('notifications')}
                className={`px-3 pt-3 pb-3.5 font-medium whitespace-nowrap transition-colors text-sm ${
                  settingsTab === 'notifications'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                Notifications
              </button>
              {isAdmin && (
                <>
                  <button
                    role="tab"
                    aria-selected={settingsTab === 'members'}
                    onClick={() => setSettingsTab('members')}
                    className={`px-3 pt-3 pb-3.5 font-medium whitespace-nowrap transition-colors text-sm ${
                      settingsTab === 'members'
                        ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    Members
                  </button>
                  <button
                    role="tab"
                    aria-selected={settingsTab === 'bandmembers'}
                    onClick={() => setSettingsTab('bandmembers')}
                    className={`px-3 pt-3 pb-3.5 font-medium whitespace-nowrap transition-colors text-sm ${
                      settingsTab === 'bandmembers'
                        ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    Band
                  </button>
                  <button
                    role="tab"
                    aria-selected={settingsTab === 'import'}
                    onClick={() => setSettingsTab('import')}
                    className={`px-3 pt-3 pb-3.5 font-medium whitespace-nowrap transition-colors text-sm ${
                      settingsTab === 'import'
                        ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    Import
                  </button>
                </>
              )}
              <button
                role="tab"
                aria-selected={settingsTab === 'whatsnew'}
                onClick={() => setSettingsTab('whatsnew')}
                className={`px-3 pt-3 pb-3.5 font-medium whitespace-nowrap transition-colors text-sm ${
                  settingsTab === 'whatsnew'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                New
              </button>
              <button
                role="tab"
                aria-selected={settingsTab === 'plan'}
                onClick={() => setSettingsTab('plan')}
                className={`px-3 pt-3 pb-3.5 font-medium whitespace-nowrap transition-colors text-sm ${
                  settingsTab === 'plan'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                Plan
              </button>
              <button
                role="tab"
                aria-selected={settingsTab === 'support'}
                onClick={() => setSettingsTab('support')}
                className={`px-3 pt-3 pb-3.5 font-medium whitespace-nowrap transition-colors text-sm ${
                  settingsTab === 'support'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                Support
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6" role="tabpanel">
              {settingsError && (
                <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4" role="alert">
                  {settingsError}
                </div>
              )}
              {settingsSuccess && (
                <div className="bg-green-900/50 border border-green-500 text-green-200 px-4 py-2 rounded-lg mb-4" role="alert">
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
                      setProfileLoading(true);
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
                        setProfileLoading(false);
                      }
                    }}
                  >
                    <h4 className="text-lg font-medium text-[var(--color-text-primary)] mb-4">Profile Information</h4>
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
                          <p className="text-xs text-[var(--color-text-muted)] mt-2">
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
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                        Bio
                      </label>
                      <textarea
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        className="w-full bg-[var(--color-modal-input)] border border-[var(--color-modal-border)] rounded px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]"
                        placeholder="Tell others about yourself..."
                        rows={3}
                        maxLength={500}
                      />
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        {editBio.length}/500 characters
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={profileLoading}
                        className="btn btn-primary"
                      >
                        {profileLoading ? 'Saving...' : 'Update Profile'}
                      </button>
                    </div>
                  </form>

                  {/* Email Section */}
                  <form
                    className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-[var(--color-modal-border)]"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setEmailLoading(true);
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
                        setEmailLoading(false);
                      }
                    }}
                  >
                    <h4 className="text-lg font-medium text-[var(--color-text-primary)] mb-4">Change Email</h4>
                    <p className="text-sm text-[var(--color-text-muted)] mb-4">
                      Current email: <span className="text-[var(--color-text-primary)]">{user?.email}</span>
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
                        disabled={emailLoading || !newEmail}
                        className="btn btn-blue"
                      >
                        {emailLoading ? 'Sending...' : 'Send Verification Email'}
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
                      setPasswordLoading(true);
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
                        setPasswordLoading(false);
                      }
                    }}
                  >
                    <h4 className="text-lg font-medium text-[var(--color-text-primary)] mb-4">Change Password</h4>
                    <div className="mb-4">
                      <label className="modal-label">Current Password</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="modal-input"
                        placeholder="Enter current password"
                      />
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
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
                        placeholder="Min 8 chars, upper + lower + number"
                        minLength={8}
                        maxLength={128}
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
                        maxLength={128}
                        required
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={passwordLoading || !newPassword || !confirmPassword}
                        className="btn btn-blue"
                      >
                        {passwordLoading ? 'Changing...' : 'Change Password'}
                      </button>
                    </div>
                  </form>

                  {/* Export My Data */}
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-[var(--color-modal-border)]">
                    <h4 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">Export My Data</h4>
                    <p className="text-sm text-[var(--color-text-muted)] mb-3">
                      Download all your data as a JSON file including your profile, messages, and content you created.
                    </p>
                    <button
                      onClick={async () => {
                        setExportLoading(true);
                        setSettingsError('');
                        try {
                          await api.exportUserData();
                          setSettingsSuccess('Export downloaded');
                        } catch (err) {
                          setSettingsError(err.message);
                        } finally {
                          setExportLoading(false);
                        }
                      }}
                      disabled={exportLoading}
                      className="btn btn-blue"
                    >
                      {exportLoading ? 'Exporting...' : 'Download My Data'}
                    </button>
                  </div>

                  {/* Delete Account */}
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-red-900/50">
                    <h4 className="text-lg font-medium text-red-400 mb-2">Delete Account</h4>
                    <p className="text-sm text-[var(--color-text-muted)] mb-3">
                      This will permanently delete your account across all workspaces. Your messages will be anonymized and your profile data removed. This cannot be undone. If you just want to leave this workspace, you can do that under the Workspace tab.
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
                          Are you sure? This will permanently delete your account. Your messages will be anonymized and your profile data removed.
                        </p>
                        {deleteError && (
                          <p className="text-sm text-red-400">{deleteError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              setDeleteError('');
                              setDeleteLoading(true);
                              try {
                                await api.deleteAccount();
                                onLogout();
                              } catch (err) {
                                setDeleteError(err.message);
                              } finally {
                                setDeleteLoading(false);
                              }
                            }}
                            disabled={deleteLoading}
                            className="btn btn-danger"
                          >
                            {deleteLoading ? 'Deleting...' : 'Permanently Delete'}
                          </button>
                          <button
                            onClick={() => { setDeleteConfirmOpen(false); setDeleteError(''); }}
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
                  <div className="flex items-center justify-between mb-6 p-3 bg-[var(--color-bg-secondary)] rounded-lg">
                    <span className="text-[var(--color-text-secondary)] text-sm font-medium">Appearance</span>
                    <div className="flex rounded-lg bg-[var(--color-bg-primary)] p-0.5">
                      <button
                        onClick={() => mode !== 'dark' && toggleMode()}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                          mode === 'dark' ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
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
                          mode === 'light' ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        Light
                      </button>
                    </div>
                  </div>
                  <p className="text-[var(--color-text-muted)] mb-4">Choose a theme for your sidebar</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {Object.entries(themes).map(([id, theme]) => {
                      // Note: FREE_THEME_IDS is also defined in server/src/lib/planLimits.js.
                      // If these values change, update both locations.
                      const FREE_THEME_IDS = ['default', 'midnight', 'ocean'];
                      const isLocked = workspace?.effectivePlan !== 'PRO' && !FREE_THEME_IDS.includes(id);
                      return (
                      <button
                        key={id}
                        onClick={() => !isLocked && setTheme(id)}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          isLocked ? 'opacity-50 cursor-not-allowed' :
                          currentTheme === id
                            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30'
                            : 'border-[var(--color-modal-border)] hover:border-[var(--color-border)]'
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
                        <div className="text-xs font-medium text-[var(--color-text-secondary)]">
                          {isLocked ? '🔒 ' : ''}{theme.name}
                        </div>
                        {currentTheme === id && (
                          <div className="text-xs text-[var(--color-primary)] mt-1">Active</div>
                        )}
                      </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Members Tab (Admin only) */}
              {settingsTab === 'members' && (
                <div className="space-y-2">
                  {/* Export Workspace Data (Admin) */}
                  <div className="p-3 bg-[var(--color-modal-card)] rounded-lg mb-4">
                    <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-1">Export Workspace Data</h4>
                    <p className="text-xs text-[var(--color-text-muted)] mb-2">Download all workspace data as JSON (channels, messages, songs, gigs, etc.)</p>
                    <button
                      onClick={async () => {
                        setExportLoading(true);
                        setSettingsError('');
                        try {
                          await api.exportWorkspaceData(workspace.id);
                          setSettingsSuccess('Workspace export downloaded');
                        } catch (err) {
                          setSettingsError(err.message);
                        } finally {
                          setExportLoading(false);
                        }
                      }}
                      disabled={exportLoading}
                      className="btn btn-blue text-sm"
                    >
                      {exportLoading ? 'Exporting...' : 'Download Workspace Data'}
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
                                setEditingMemberId(null);
                                if (onRefreshWorkspace) onRefreshWorkspace();
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
                              className="btn btn-blue text-xs"
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
                              <div className="font-medium text-[var(--color-text-primary)]">
                                {member.user.displayName}
                                {member.user.id === user?.id && (
                                  <span className="text-[var(--color-text-muted)] ml-1">(you)</span>
                                )}
                              </div>
                              <div className="text-sm text-[var(--color-text-muted)]">{member.user.email}</div>
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
                              disabled={member.user.id === user?.id}
                              onChange={async (e) => {
                                try {
                                  await api.updateMemberRole(
                                    workspace.id,
                                    member.user.id,
                                    e.target.value
                                  );
                                  if (onRefreshWorkspace) onRefreshWorkspace();
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
                          <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">
                            Remove {removingMember.user.displayName}?
                          </h3>
                          <p className="text-[var(--color-text-muted)] text-sm mb-4">
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
                              <span className="text-[var(--color-text-primary)]">Keep messages as-is</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="postAction"
                                value="hide"
                                checked={removePostAction === 'hide'}
                                onChange={(e) => setRemovePostAction(e.target.value)}
                              />
                              <span className="text-[var(--color-text-primary)]">Hide all messages</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="postAction"
                                value="delete"
                                checked={removePostAction === 'delete'}
                                onChange={(e) => setRemovePostAction(e.target.value)}
                              />
                              <span className="text-[var(--color-text-primary)]">Delete all messages</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="postAction"
                                value="anonymize"
                                checked={removePostAction === 'anonymize'}
                                onChange={(e) => setRemovePostAction(e.target.value)}
                              />
                              <span className="text-[var(--color-text-primary)]">Show as "Removed User"</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="postAction"
                                value="merge"
                                checked={removePostAction === 'merge'}
                                onChange={(e) => setRemovePostAction(e.target.value)}
                              />
                              <span className="text-[var(--color-text-primary)]">Transfer messages to another member</span>
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
                                  if (onRefreshWorkspace) onRefreshWorkspace();
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
                      <h4 className="text-lg font-medium text-[var(--color-text-primary)] mb-4">
                        {editingBandMember ? 'Edit Band Member' : 'Add Band Member'}
                      </h4>
                      <BandMemberForm
                        member={editingBandMember}
                        onSave={handleSaveBandMember}
                        onCancel={() => {
                          setShowBandMemberForm(false);
                          setEditingBandMember(null);
                        }}
                        loading={profileLoading}
                        workspaceMembers={workspace?.members || []}
                        workspaceId={workspace?.id}
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-[var(--color-text-muted)]">Manage band member history for the timeline</p>
                        <button
                          onClick={() => setShowBandMemberForm(true)}
                          className="btn btn-primary"
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
                            const currentRegular = bandMembers.current.filter(m => !m.isGuest);
                            const formerRegular = bandMembers.former.filter(m => !m.isGuest);
                            const guests = bandMembers.all.filter(m => m.isGuest);
                            const currentIds = new Set(bandMembers.current.map(m => m.id));
                            const formerIds = new Set(bandMembers.former.map(m => m.id));
                            const incomplete = bandMembers.all.filter(m =>
                              !m.isGuest && !currentIds.has(m.id) && !formerIds.has(m.id)
                            );
                            const hasMembers = currentRegular.length > 0 || formerRegular.length > 0 || guests.length > 0 || incomplete.length > 0;

                            const renderMemberCard = (member, variant = 'default') => {
                              const instruments = [...new Set(member.stints?.flatMap(s => s.instruments || (s.instrument ? [s.instrument] : [])) || [])];

                              let subtitle = '';
                              if (variant === 'current') {
                                const earliestYear = member.stints?.length > 0
                                  ? Math.min(...member.stints.map(s => new Date(s.startDate).getFullYear()))
                                  : null;
                                subtitle = `${instruments.length > 0 ? instruments.join(', ') : 'Unknown'} ${earliestYear ? `• Since ${earliestYear}` : ''}`;
                              } else if (variant === 'former') {
                                const years = member.stints?.length > 0 ? (() => {
                                  const starts = member.stints.map(s => new Date(s.startDate).getFullYear());
                                  const ends = member.stints.filter(s => s.endDate).map(s => new Date(s.endDate).getFullYear());
                                  const minYear = Math.min(...starts);
                                  const maxYear = ends.length > 0 ? Math.max(...ends) : minYear;
                                  return minYear === maxYear ? `${minYear}` : `${minYear}–${maxYear}`;
                                })() : '';
                                subtitle = `${instruments.length > 0 ? instruments.join(', ') : 'Unknown'} ${years ? `• ${years}` : ''}`;
                              } else if (variant === 'guest') {
                                subtitle = instruments.length > 0 ? instruments.join(', ') : 'Guest musician';
                              } else if (variant === 'incomplete') {
                                subtitle = 'No instruments defined';
                              }

                              const cardClasses = {
                                current: 'bg-[var(--color-modal-card)] rounded-lg',
                                former: 'bg-[var(--color-modal-card)] rounded-lg opacity-75',
                                guest: 'bg-purple-900/20 border border-purple-800/30 rounded-lg',
                                incomplete: 'bg-red-900/20 border border-red-800/30 rounded-lg'
                              };
                              const avatarClasses = {
                                current: 'bg-gray-600',
                                former: 'bg-gray-600',
                                guest: 'bg-purple-700',
                                incomplete: 'bg-red-700'
                              };
                              const subtitleClasses = {
                                current: 'text-[var(--color-text-muted)]',
                                former: 'text-[var(--color-text-muted)]',
                                guest: 'text-purple-300',
                                incomplete: 'text-red-300'
                              };

                              return (
                                <div key={member.id} className={`flex items-center justify-between p-3 ${cardClasses[variant] || cardClasses.current}`}>
                                  <div className="flex items-center gap-3">
                                    {member.imageUrl ? (
                                      <img src={member.imageUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                                    ) : (
                                      <div className={`w-10 h-10 rounded-full ${avatarClasses[variant] || avatarClasses.current} flex items-center justify-center text-white font-medium flex-shrink-0`}>
                                        {member.name?.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div>
                                      <div className="font-medium text-[var(--color-text-primary)]">{member.name}</div>
                                      <div className={`text-sm ${subtitleClasses[variant] || subtitleClasses.current}`}>
                                        {subtitle}
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
                            };

                            return (
                              <>
                                {currentRegular.length > 0 && (
                                  <div>
                                    <h5 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                                      Current Members ({currentRegular.length})
                                    </h5>
                                    <div className="space-y-2">
                                      {currentRegular.map(m => renderMemberCard(m, 'current'))}
                                    </div>
                                  </div>
                                )}
                                {formerRegular.length > 0 && (
                                  <div>
                                    <h5 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                                      Former Members ({formerRegular.length})
                                    </h5>
                                    <div className="space-y-2">
                                      {formerRegular.map(m => renderMemberCard(m, 'former'))}
                                    </div>
                                  </div>
                                )}
                                {guests.length > 0 && (
                                  <div>
                                    <h5 className="text-sm font-medium text-purple-400 uppercase tracking-wide mb-2">
                                      Guest Musicians ({guests.length})
                                    </h5>
                                    <div className="space-y-2">
                                      {guests.map(m => renderMemberCard(m, 'guest'))}
                                    </div>
                                  </div>
                                )}
                                {incomplete.length > 0 && (
                                  <div>
                                    <h5 className="text-sm font-medium text-red-400 uppercase tracking-wide mb-2">
                                      Incomplete Members ({incomplete.length})
                                    </h5>
                                    <p className="text-xs text-[var(--color-text-muted)] mb-2">These members have no instruments/dates. Edit or delete them.</p>
                                    <div className="space-y-2">
                                      {incomplete.map(m => renderMemberCard(m, 'incomplete'))}
                                    </div>
                                  </div>
                                )}
                                {!hasMembers && (
                                  <div className="text-center py-8 text-[var(--color-text-muted)]">
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
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-[var(--color-modal-border)]">
                    <h4 className="text-lg font-medium text-[var(--color-text-primary)] mb-1">Workspace</h4>
                    {isAdmin ? (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="text"
                          defaultValue={workspace.name}
                          maxLength={100}
                          className="modal-input flex-1"
                          onBlur={async (e) => {
                            const newName = e.target.value.trim();
                            if (newName && newName !== workspace.name) {
                              try {
                                await api.updateWorkspace(workspace.id, { name: newName });
                                if (onRefreshWorkspace) onRefreshWorkspace();
                              } catch (err) {
                                e.target.value = workspace.name;
                                setWsActionError(err.message);
                              }
                            } else {
                              e.target.value = workspace.name;
                            }
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--color-text-muted)]">{workspace.name}</p>
                    )}
                    <p className="text-xs text-[var(--color-text-muted)] mt-2">{workspace.members?.length || 0} members</p>
                  </div>

                  {/* Workspace Defaults (Admin only) */}
                  {isAdmin && (
                    <div className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-[var(--color-modal-border)]">
                      <h4 className="text-lg font-medium text-[var(--color-text-primary)] mb-4">Workspace Defaults</h4>
                      <div className="space-y-4">
                        <div>
                          <label className="modal-label">Currency</label>
                          <select value={wsCurrency} onChange={(e) => setWsCurrency(e.target.value)} className="modal-input">
                            {CURRENCIES.map(c => (
                              <option key={c.code} value={c.code}>{c.symbol} - {c.name} ({c.code})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="modal-label">Default Event Type</label>
                          <select value={wsEventType} onChange={(e) => setWsEventType(e.target.value)} className="modal-input">
                            <option value="GIG">Gig</option>
                            <option value="REHEARSAL">Rehearsal</option>
                            <option value="RECORDING">Recording</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="modal-label">Default Start Time</label>
                            <input type="time" value={wsStartTime} onChange={(e) => setWsStartTime(e.target.value)} className="modal-input" />
                          </div>
                          <div>
                            <label className="modal-label">Default End Time</label>
                            <input type="time" value={wsEndTime} onChange={(e) => setWsEndTime(e.target.value)} className="modal-input" />
                          </div>
                        </div>
                        <div>
                          <label className="modal-label">Default Venue</label>
                          <input type="text" value={wsVenue} onChange={(e) => setWsVenue(e.target.value)} className="modal-input" placeholder="e.g., Ebisu Noah" />
                        </div>
                        {wsDefaultsSaved && (
                          <div className="text-green-400 text-sm">Defaults saved.</div>
                        )}
                        <button
                          className="btn bg-green-600 hover:bg-green-700 text-white"
                          disabled={wsDefaultsLoading}
                          onClick={async () => {
                            setWsDefaultsLoading(true);
                            setWsDefaultsSaved(false);
                            try {
                              await api.updateWorkspace(workspace.id, {
                                currency: wsCurrency,
                                defaultEventType: wsEventType,
                                defaultStartTime: wsStartTime,
                                defaultEndTime: wsEndTime,
                                defaultVenue: wsVenue
                              });
                              setWsDefaultsSaved(true);
                              if (onRefreshWorkspace) onRefreshWorkspace();
                            } catch (err) {
                              setWsActionError(err.message);
                            } finally {
                              setWsDefaultsLoading(false);
                            }
                          }}
                        >
                          {wsDefaultsLoading ? 'Saving...' : 'Save Defaults'}
                        </button>
                      </div>
                    </div>
                  )}

                  {wsActionError && (
                    <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg">
                      {wsActionError}
                    </div>
                  )}

                  {/* Leave Workspace */}
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-[var(--color-modal-border)]">
                    <h4 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">Leave Workspace</h4>
                    <p className="text-sm text-[var(--color-text-muted)] mb-4">
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
                                onClose();
                                navigate('/');
                              } catch (err) {
                                setWsActionError(err.message);
                              } finally {
                                setWsActionLoading(false);
                              }
                            }}
                            disabled={wsActionLoading}
                            className="btn btn-danger"
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
                  {isAdmin && (
                    <div className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-red-900/50">
                      <h4 className="text-lg font-medium text-red-400 mb-2">Delete Workspace</h4>
                      <p className="text-sm text-[var(--color-text-muted)] mb-4">
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
                            Type <span className="font-bold text-[var(--color-text-primary)]">{workspace.name}</span> to confirm deletion:
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
                                  onClose();
                                  navigate('/');
                                } catch (err) {
                                  setWsActionError(err.message);
                                } finally {
                                  setWsActionLoading(false);
                                }
                              }}
                              disabled={wsActionLoading || deleteWsName !== workspace.name}
                              className="btn btn-danger"
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
                      <span className="text-sm text-[var(--color-text-muted)]">v1.05.07</span>
                    </div>
                    <h4 className="font-medium text-[var(--color-text-primary)] mb-1">All Messages, Pin Setlists & Stage Plot Upgrades</h4>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      All Messages feed across all channels. Pin setlists to channels with expandable song list (key, BPM, MC breaks). Calendar splits into Upcoming/Past. Stage plot resize, flip, rotate with real instrument images. Poll push notifications. Mobile pin setlist UI. Security and backup fixes.
                    </p>
                  </div>
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 border border-[var(--color-modal-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-[var(--color-text-muted)]">v1.04.95</span>
                    </div>
                    <h4 className="font-medium text-[var(--color-text-primary)] mb-1">Stage Plots, Swipe React & Bug Fixes</h4>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Drag-and-drop stage plot editor with 20+ equipment icons and text labels. Swipe left to react, right to reply. Dismiss link previews on your own messages. iPad-optimized layouts and workspace backup/restore.
                    </p>
                  </div>
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 border border-[var(--color-modal-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-[var(--color-text-muted)]">v1.04.59</span>
                    </div>
                    <h4 className="font-medium text-[var(--color-text-primary)] mb-1">Gig Time Fields & Setlist Rename</h4>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Sound check, doors, and stage times for gigs. Rename setlists inline. Mobile API caching for faster loading.
                    </p>
                  </div>
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 border border-[var(--color-modal-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-[var(--color-text-muted)]">v1.04.49</span>
                    </div>
                    <h4 className="font-medium text-[var(--color-text-primary)] mb-1">Soft-Delete & Demo Workspace</h4>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Accounts and workspaces have a 30-day recovery window before permanent deletion. Admin dashboard for managing deleted items.
                    </p>
                  </div>
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 border border-[var(--color-modal-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-[var(--color-text-muted)]">v1.04.40</span>
                    </div>
                    <h4 className="font-medium text-[var(--color-text-primary)] mb-1">Security & Performance</h4>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Security hardening, bookmarks, image thumbnails, swipe gestures, upcoming event banner, and API caching.
                    </p>
                  </div>
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 border border-[var(--color-modal-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-[var(--color-text-muted)]">v1.04.37</span>
                    </div>
                    <h4 className="font-medium text-[var(--color-text-primary)] mb-1">Calendar & Profiles</h4>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Sort calendar events newest-first with a toggle, tap band members to view profiles and stats, and security hardening across the platform.
                    </p>
                  </div>
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 border border-[var(--color-modal-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-[var(--color-text-muted)]">v1.04.27</span>
                    </div>
                    <h4 className="font-medium text-[var(--color-text-primary)] mb-1">Quality & Polish</h4>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Per-workspace currency, message density settings, admin role guards, and dozens of bug fixes across web and mobile.
                    </p>
                  </div>
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 border border-[var(--color-modal-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-[var(--color-text-muted)]">v1.04.11</span>
                    </div>
                    <h4 className="font-medium text-[var(--color-text-primary)] mb-1">App Store Launch</h4>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      BandChat on iOS! Content moderation, account deletion, and App Store compliance.
                    </p>
                  </div>
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 border border-[var(--color-modal-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-[var(--color-text-muted)]">v1.01</span>
                    </div>
                    <h4 className="font-medium text-[var(--color-text-primary)] mb-1">Band Features & Themes</h4>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Songs, setlists, calendar, stats, bulk import with metadata, MC sections, 20+ themes, and Slack workspace import.
                    </p>
                  </div>
                </div>
              )}

              {/* Plan Tab */}
              {settingsTab === 'plan' && (
                <div className="space-y-6">
                  {/* Current Plan */}
                  <div className={`p-4 rounded-lg border-2 ${
                    workspace?.effectivePlan === 'PRO'
                      ? 'border-green-500/30 bg-green-900/10'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]'
                  }`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{workspace?.effectivePlan === 'PRO' ? '⭐' : '🆓'}</span>
                      <div>
                        <h3 className="text-lg font-bold text-[var(--color-text-primary)]">
                          {workspace?.effectivePlan === 'PRO' ? 'Pro Plan' : 'Free Plan'}
                        </h3>
                        {workspace?.effectivePlan === 'PRO' && workspace?.planSource && (
                          <p className="text-xs text-[var(--color-text-muted)]">
                            via {workspace.planSource === 'APPLE' ? 'App Store' : workspace.planSource === 'GOOGLE' ? 'Google Play' : workspace.planSource}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {workspace?.effectivePlan !== 'PRO' ? (
                    <>
                      {/* Feature comparison for free users */}
                      <div>
                        <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">Unlock with Pro</h4>
                        <div className="space-y-2">
                          {[
                            'Unlimited members',
                            'Unlimited songs & setlists',
                            'Full message history',
                            '10GB storage',
                            'Band Kitty (shared finances)',
                            'Gig Stats & revenue tracking',
                            'Practice Dashboard',
                            'Song Intelligence',
                            'Slack workspace import',
                            'All 20+ themes',
                            'PDF export',
                          ].map(feature => (
                            <div key={feature} className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                              <span className="text-green-500">✓</span>
                              {feature}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
                        <p className="text-sm text-[var(--color-text-muted)]">
                          Upgrade in the <strong className="text-[var(--color-text-primary)]">BandChat mobile app</strong> to unlock all Pro features.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">Your Pro features</h4>
                      <div className="space-y-2">
                        {[
                          'Unlimited members',
                          'Unlimited songs & setlists',
                          'Full message history',
                          '10GB storage',
                          'All themes unlocked',
                          'Band Kitty, Stats, Practice, Song Intelligence',
                          'Slack import & PDF export',
                        ].map(feature => (
                          <div key={feature} className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                            <span className="text-green-500">✓</span>
                            {feature}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Support Tab */}
              {settingsTab === 'support' && (
                <div className="space-y-6">
                  <div className="text-center py-4">
                    <img
                      src="/bc_icon_06.png"
                      alt="BandChat"
                      className="w-20 h-20 mx-auto mb-3 rounded-xl shadow-lg"
                    />
                    <h3 className="text-xl font-bold text-[var(--color-text-primary)]">BandChat</h3>
                    <p className="text-[var(--color-text-muted)]">v{__APP_VERSION__}</p>
                  </div>

                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--color-text-secondary)]">Support Email</span>
                      <a
                        href="mailto:admin@bandchat.app?subject=BandChat Support"
                        className="text-sm text-[var(--color-primary)] hover:underline"
                      >
                        admin@bandchat.app
                      </a>
                    </div>
                    <div className="border-t border-[var(--color-modal-border)]" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--color-text-secondary)]">Privacy Policy</span>
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--color-primary)] hover:underline"
                      >
                        View
                      </a>
                    </div>
                    <div className="border-t border-[var(--color-modal-border)]" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--color-text-secondary)]">Terms of Service</span>
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--color-primary)] hover:underline"
                      >
                        View
                      </a>
                    </div>
                    <div className="border-t border-[var(--color-modal-border)]" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--color-text-secondary)]">Send Feedback</span>
                      <a
                        href="mailto:admin@bandchat.app?subject=BandChat Feedback"
                        className="text-sm text-[var(--color-primary)] hover:underline"
                      >
                        Email
                      </a>
                    </div>
                  </div>

                  <div className="bg-[var(--color-modal-card)] rounded-lg p-4">
                    <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
                      BandChat is a communication and organization app built specifically for bands.
                      Chat with your bandmates, manage your song library, create setlists, and track your gigs - all in one place.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium text-[var(--color-text-primary)]">Features</h4>
                    <ul className="text-sm text-[var(--color-text-secondary)] space-y-2">
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
                    <h4 className="font-medium text-[var(--color-text-primary)] mb-2">Credits</h4>
                    <p className="text-sm text-[var(--color-text-muted)]">
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

                  <div className="text-center text-xs text-[var(--color-text-muted)] pt-4">
                    Made with ♥ for musicians everywhere
                  </div>
                </div>
              )}

              {settingsTab === 'notifications' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Notification Preferences</h3>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Choose which types of notifications you receive for this workspace.
                  </p>
                  {notifPrefsLoading ? (
                    <div className="space-y-3 py-8 px-4">
                      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : notifPrefs ? (
                    <div className="bg-[var(--color-modal-card)] rounded-lg divide-y divide-[var(--color-modal-border)]">
                      {[
                        { key: 'notifyDMs', label: 'Direct Messages', desc: 'Get notified for new direct messages' },
                        { key: 'notifyMentions', label: 'Mentions', desc: 'Get notified when someone mentions you' },
                        { key: 'notifyGigChanges', label: 'Gig Changes', desc: 'Get notified about gig updates and changes' },
                        { key: 'notifyAnnouncements', label: 'Announcements', desc: 'Get notified about new announcements' },
                        { key: 'notifyChannelMessages', label: 'All Channel Messages', desc: 'Get notified for all channel messages' },
                      ].map(({ key, label, desc }) => (
                        <div key={key} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <div className="text-[var(--color-text-primary)] font-medium">{label}</div>
                            <div className="text-xs text-[var(--color-text-muted)]">{desc}</div>
                          </div>
                          <button
                            onClick={async () => {
                              const newVal = !(notifPrefs[key] !== false);
                              setNotifPrefs(prev => ({ ...prev, [key]: newVal }));
                              try {
                                await api.updateNotificationPreferences(workspace.id, { [key]: newVal });
                              } catch {
                                setNotifPrefs(prev => ({ ...prev, [key]: !newVal }));
                              }
                            }}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              notifPrefs[key] !== false ? 'bg-[var(--color-primary)]' : 'bg-gray-600'
                            }`}
                            role="switch"
                            aria-checked={notifPrefs[key] !== false}
                            aria-label={`${label} notifications`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                notifPrefs[key] !== false ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {settingsTab === 'import' && (
                <div className="space-y-6">
                  <div className="bg-[var(--color-modal-card)] rounded-lg p-6 text-center">
                    <div className="text-4xl mb-3">📦</div>
                    <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">Import from Slack</h3>
                    <p className="text-[var(--color-text-muted)] text-sm mb-4 leading-relaxed">
                      Import your Slack workspace history into BandChat. Upload a Slack export ZIP file and
                      choose how to map users, channels, and gigs.
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        onClose();
                        setShowSlackImport(true);
                      }}
                    >
                      Start Import Wizard
                    </button>
                  </div>

                  <div className="bg-[var(--color-modal-card)] rounded-lg p-6 text-center">
                    <div className="text-4xl mb-3">🔗</div>
                    <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">Relink Imported Messages</h3>
                    <p className="text-[var(--color-text-muted)] text-sm mb-4 leading-relaxed">
                      Match orphaned imported messages to current workspace members by display name.
                      This fixes avatars and profiles on historical messages.
                    </p>
                    {relinkResult && (
                      <div className={`mb-4 p-3 ${relinkResult.error ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-green-900/30 border-green-700 text-green-300'} border rounded text-sm`}>
                        {relinkResult.error ? (
                          <div>{relinkResult.error}</div>
                        ) : (
                          <>
                            {relinkResult.relinked > 0 && <div>Relinked {relinkResult.relinked} of {relinkResult.total} orphaned messages.</div>}
                            {relinkResult.avatarsSynced > 0 && <div>Synced {relinkResult.avatarsSynced} band member avatars to user profiles.</div>}
                            {relinkResult.relinked === 0 && !relinkResult.avatarsSynced && <div>No changes needed — all messages and avatars are up to date.</div>}
                            {relinkResult.unmatched > 0 && <div>{relinkResult.unmatched} messages could not be matched.</div>}
                          </>
                        )}
                      </div>
                    )}
                    <button
                      className="btn bg-gray-600 hover:bg-gray-500 text-white"
                      disabled={relinkLoading}
                      onClick={async () => {
                        setRelinkLoading(true);
                        setRelinkResult(null);
                        try {
                          const result = await api.relinkMessages(workspace.id);
                          setRelinkResult(result);
                        } catch (err) {
                          setRelinkResult({ total: 0, relinked: 0, unmatched: 0, error: err.message });
                        } finally {
                          setRelinkLoading(false);
                        }
                      }}
                    >
                      {relinkLoading ? 'Relinking...' : 'Relink Messages'}
                    </button>
                  </div>

                  <div className="bg-[var(--color-modal-card)] rounded-lg p-6">
                    <div className="text-4xl mb-3 text-center">🗺️</div>
                    <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-2 text-center">Manual Message Mapping</h3>
                    <p className="text-[var(--color-text-muted)] text-sm mb-4 leading-relaxed text-center">
                      Manually assign orphaned Slack names to workspace members when auto-matching can't find a match.
                    </p>

                    {!orphanedAuthors ? (
                      <div className="text-center">
                        <button
                          className="btn bg-gray-600 hover:bg-gray-500 text-white"
                          disabled={orphanLoading}
                          onClick={async () => {
                            setOrphanLoading(true);
                            try {
                              const data = await api.getOrphanedAuthors(workspace.id);
                              setOrphanedAuthors(data);
                              setManualMappings({});
                              setApplyResult(null);
                            } catch (err) {
                              console.error('Failed to load orphaned authors:', err);
                            } finally {
                              setOrphanLoading(false);
                            }
                          }}
                        >
                          {orphanLoading ? 'Loading...' : 'Load Orphaned Names'}
                        </button>
                      </div>
                    ) : orphanedAuthors.orphanedNames.length === 0 ? (
                      <div className="text-center text-green-400 text-sm">
                        No orphaned messages found — all messages are linked.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs text-[var(--color-text-muted)] mb-2">
                          {orphanedAuthors.orphanedNames.length} unmatched name{orphanedAuthors.orphanedNames.length !== 1 ? 's' : ''}
                        </div>
                        <div className="max-h-64 overflow-y-auto space-y-2">
                          {orphanedAuthors.orphanedNames.map(({ name, count }) => (
                            <div key={name} className="flex items-center gap-3 bg-[var(--color-bg-primary)] rounded p-3">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-[var(--color-text-primary)] text-sm">{name}</div>
                                <div className="text-xs text-[var(--color-text-muted)]">{count.toLocaleString()} messages</div>
                              </div>
                              <select
                                className="modal-input text-sm py-1 px-2 max-w-[180px]"
                                value={manualMappings[name] || ''}
                                onChange={(e) => {
                                  setManualMappings(prev => {
                                    if (e.target.value) return { ...prev, [name]: e.target.value };
                                    const next = { ...prev };
                                    delete next[name];
                                    return next;
                                  });
                                }}
                              >
                                <option value="">-- Select --</option>
                                <optgroup label="Workspace Members">
                                  {orphanedAuthors.workspaceMembers.map(m => (
                                    <option key={m.userId} value={m.userId}>{m.displayName}</option>
                                  ))}
                                </optgroup>
                                {orphanedAuthors.bandMembers.length > 0 && (
                                  <optgroup label="Band Members">
                                    {orphanedAuthors.bandMembers.map(bm => (
                                      <option key={bm.id} value={bm.linkedUserId}>
                                        {bm.name}{bm.displayName && bm.displayName !== bm.name ? ` (${bm.displayName})` : ''}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                            </div>
                          ))}
                        </div>

                        {applyResult && (
                          <div className={`p-3 ${applyResult.error ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-green-900/30 border-green-700 text-green-300'} border rounded text-sm`}>
                            {applyResult.error || `Mapped ${applyResult.totalMapped.toLocaleString()} messages.`}
                          </div>
                        )}

                        <button
                          className="btn bg-green-600 hover:bg-green-700 text-white w-full"
                          disabled={applyLoading || Object.keys(manualMappings).length === 0}
                          onClick={async () => {
                            setApplyLoading(true);
                            setApplyResult(null);
                            try {
                              const result = await api.applyMessageMappings(workspace.id, manualMappings);
                              setApplyResult(result);
                              // Refresh the orphan list
                              const data = await api.getOrphanedAuthors(workspace.id);
                              setOrphanedAuthors(data);
                              setManualMappings({});
                            } catch (err) {
                              setApplyResult({ error: err.message });
                            } finally {
                              setApplyLoading(false);
                            }
                          }}
                        >
                          {applyLoading ? 'Applying...' : `Apply Mappings (${Object.keys(manualMappings).length} selected)`}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

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
              <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">Reset Password for {passwordResetMember.user.displayName}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Your password (confirm)</label>
                  <input
                    type="password"
                    value={resetAdminPassword}
                    onChange={(e) => setResetAdminPassword(e.target.value)}
                    className="modal-input w-full"
                    placeholder="Your admin password"
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--color-text-muted)] mb-1 block">New password (min 8 characters)</label>
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
                    if (resetNewPassword.length < 8 || !/[A-Z]/.test(resetNewPassword) || !/[a-z]/.test(resetNewPassword) || !/[0-9]/.test(resetNewPassword)) {
                      toast.warning('Password must be at least 8 characters with uppercase, lowercase, and a number');
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
                  className="btn btn-blue min-h-[44px] px-4"
                >
                  Reset Password
                </button>
              </div>
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
    </>
  );
}

export default SettingsModal;
