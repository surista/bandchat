/**
 * @fileoverview Settings modal extracted from Sidebar.
 * Contains profile, workspace, theme, members, band members, import, what's new, and about tabs.
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
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
  // Slack import
  const [showSlackImport, setShowSlackImport] = useState(false);

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
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--color-modal-border)] justify-center overflow-x-auto" role="tablist">
              <button
                role="tab"
                aria-selected={settingsTab === 'profile'}
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
                role="tab"
                aria-selected={settingsTab === 'workspace'}
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
                role="tab"
                aria-selected={settingsTab === 'theme'}
                onClick={() => setSettingsTab('theme')}
                className={`px-3 pt-2.5 pb-3 font-medium whitespace-nowrap transition-colors text-sm ${
                  settingsTab === 'theme'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Theme
              </button>
              {isAdmin && (
                <>
                  <button
                    role="tab"
                    aria-selected={settingsTab === 'members'}
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
                    role="tab"
                    aria-selected={settingsTab === 'bandmembers'}
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
                    role="tab"
                    aria-selected={settingsTab === 'import'}
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
                role="tab"
                aria-selected={settingsTab === 'whatsnew'}
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
                role="tab"
                aria-selected={settingsTab === 'about'}
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
                        className="btn btn-primary"
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
                        className="btn btn-blue"
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
                        className="btn btn-blue"
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
                      className="btn btn-blue"
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
                            className="btn btn-danger"
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
                      className="btn btn-blue text-sm"
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
                                current: 'text-gray-400',
                                former: 'text-gray-400',
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
                                      <div className="font-medium text-white">{member.name}</div>
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
                                    <h5 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
                                      Current Members ({currentRegular.length})
                                    </h5>
                                    <div className="space-y-2">
                                      {currentRegular.map(m => renderMemberCard(m, 'current'))}
                                    </div>
                                  </div>
                                )}
                                {formerRegular.length > 0 && (
                                  <div>
                                    <h5 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">
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
                                    <p className="text-xs text-gray-500 mb-2">These members have no instruments/dates. Edit or delete them.</p>
                                    <div className="space-y-2">
                                      {incomplete.map(m => renderMemberCard(m, 'incomplete'))}
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
                        onClose();
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
