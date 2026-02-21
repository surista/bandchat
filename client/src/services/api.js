/**
 * @fileoverview API client for BandChat backend.
 *
 * Handles all HTTP communication with the server including:
 * - Authentication (login, signup, token refresh)
 * - Workspaces and channels
 * - Messages and reactions
 * - Band features (songs, setlists, gigs)
 *
 * Automatically refreshes expired access tokens using the refresh token.
 *
 * @example
 * import api from './services/api';
 *
 * // Login
 * const { user, accessToken } = await api.login(email, password);
 *
 * // Get messages
 * const { messages, hasMore } = await api.getMessages(channelId);
 *
 * // Create a song
 * const song = await api.createSong(workspaceId, { title: 'My Song', artist: 'My Band' });
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * API Service class for making authenticated requests to the backend.
 * Handles token storage, refresh, and request/response processing.
 */
class ApiService {
  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    this._refreshPromise = null;
  }

  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  async request(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Handle token expiration with lock to prevent concurrent refreshes
      if (response.status === 401 && this.refreshToken) {
        if (!this._refreshPromise) {
          this._refreshPromise = this.refreshAccessToken().finally(() => {
            this._refreshPromise = null;
          });
        }
        const refreshed = await this._refreshPromise;
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await fetch(url, { ...options, headers });
          return this.handleResponse(retryResponse);
        }
        // Refresh failed - redirect to login
        window.location.href = '/login';
        throw new Error('Session expired. Please log in again.');
      }

      return this.handleResponse(response);
    } catch (error) {
      throw new Error('Network error');
    }
  }

  async handleResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  async refreshAccessToken() {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });

      if (response.ok) {
        const data = await response.json();
        this.setTokens(data.accessToken, data.refreshToken);
        return true;
      }

      this.clearTokens();
      return false;
    } catch {
      this.clearTokens();
      return false;
    }
  }

  // Auth
  async signup(email, password, displayName) {
    const data = await this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName })
    });
    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async logout() {
    // Revoke refresh token on server
    if (this.refreshToken) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.refreshToken })
        });
      } catch {
        // Ignore errors - still clear local tokens
      }
    }
    this.clearTokens();
  }

  async getMe() {
    return this.request('/auth/me');
  }

  async updateProfile(data) {
    return this.request('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async getMemberProfile(workspaceId, userId) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}/profile`);
  }

  async getMemberEvents(workspaceId, userId, type) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}/events?type=${type}`);
  }

  async changePassword(currentPassword, newPassword) {
    return this.request('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  async requestEmailChange(newEmail, password) {
    return this.request('/auth/change-email', {
      method: 'POST',
      body: JSON.stringify({ newEmail, password })
    });
  }

  async verifyEmailChange(token) {
    return this.request('/auth/verify-email-change', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
  }

  async googleAuth(credential) {
    const data = await this.request('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential })
    });
    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async linkGoogle(credential) {
    return this.request('/auth/link-google', {
      method: 'POST',
      body: JSON.stringify({ credential })
    });
  }

  async forgotPassword(email) {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  async resetPassword(token, password) {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password })
    });
  }

  async verifyResetToken(token) {
    return this.request(`/auth/verify-reset-token?token=${token}`);
  }

  // Workspaces
  async getWorkspaces() {
    return this.request('/workspaces');
  }

  async createWorkspace(name) {
    return this.request('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  async getWorkspace(id) {
    return this.request(`/workspaces/${id}`);
  }

  async updateWorkspace(id, data) {
    return this.request(`/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteWorkspace(id) {
    return this.request(`/workspaces/${id}`, {
      method: 'DELETE'
    });
  }

  async joinWorkspace(inviteCode) {
    return this.request(`/workspaces/join/${inviteCode}`, {
      method: 'POST'
    });
  }

  async getInviteCode(workspaceId) {
    return this.request(`/workspaces/${workspaceId}/invite-code`);
  }

  async regenerateInviteCode(workspaceId, options = {}) {
    return this.request(`/workspaces/${workspaceId}/invite-code`, {
      method: 'POST',
      body: JSON.stringify(options)
    });
  }

  async sendInviteEmail(workspaceId, email) {
    return this.request(`/workspaces/${workspaceId}/invite-email`, {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  async removeWorkspaceMember(workspaceId, userId) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE'
    });
  }

  async updateMemberRole(workspaceId, userId, role) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
  }

  async adminResetPassword(workspaceId, userId, newPassword, adminPassword) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword, adminPassword })
    });
  }

  async removeMember(workspaceId, userId, postAction, mergeUserId = null) {
    const params = new URLSearchParams({ postAction });
    if (mergeUserId) params.append('mergeUserId', mergeUserId);
    return this.request(`/workspaces/${workspaceId}/members/${userId}?${params}`, {
      method: 'DELETE'
    });
  }

  // Channels
  async getChannels(workspaceId) {
    return this.request(`/channels/workspace/${workspaceId}`);
  }

  async createChannel(workspaceId, data) {
    return this.request(`/channels/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getChannel(channelId) {
    return this.request(`/channels/${channelId}`);
  }

  async updateChannel(channelId, data) {
    return this.request(`/channels/${channelId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteChannel(channelId) {
    return this.request(`/channels/${channelId}`, {
      method: 'DELETE'
    });
  }

  async addChannelMember(channelId, userId) {
    return this.request(`/channels/${channelId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  async removeChannelMember(channelId, userId) {
    return this.request(`/channels/${channelId}/members/${userId}`, {
      method: 'DELETE'
    });
  }

  async muteChannel(channelId, muted) {
    return this.request(`/channels/${channelId}/mute`, {
      method: 'PUT',
      body: JSON.stringify({ muted })
    });
  }

  async markChannelRead(channelId) {
    return this.request(`/channels/${channelId}/read`, {
      method: 'POST'
    });
  }

  // Direct Messages
  async getDMs(workspaceId) {
    return this.request(`/channels/workspace/${workspaceId}/dms`);
  }

  async createOrGetDM(workspaceId, userIds) {
    return this.request(`/channels/workspace/${workspaceId}/dm`, {
      method: 'POST',
      body: JSON.stringify({ userIds })
    });
  }

  // Channel Groups
  async getChannelGroups(workspaceId) {
    return this.request(`/channel-groups/workspace/${workspaceId}`);
  }

  async createChannelGroup(workspaceId, name) {
    return this.request(`/channel-groups/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  async updateChannelGroup(groupId, data) {
    return this.request(`/channel-groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteChannelGroup(groupId) {
    return this.request(`/channel-groups/${groupId}`, {
      method: 'DELETE'
    });
  }

  async moveChannelToGroup(groupId, channelId, position) {
    return this.request(`/channel-groups/${groupId}/channels/${channelId}`, {
      method: 'PUT',
      body: JSON.stringify({ position })
    });
  }

  async removeChannelFromGroup(channelId) {
    return this.request(`/channel-groups/channels/${channelId}`, {
      method: 'DELETE'
    });
  }

  // Messages
  async getMessages(channelId, cursor = null, limit = 50) {
    const params = new URLSearchParams({ limit });
    if (cursor) params.append('cursor', cursor);
    return this.request(`/messages/channel/${channelId}?${params}`);
  }

  async getReplies(messageId) {
    return this.request(`/messages/${messageId}/replies`);
  }

  async sendMessage(channelId, content, parentId = null, attachments = null) {
    return this.request(`/messages/channel/${channelId}`, {
      method: 'POST',
      body: JSON.stringify({ content, parentId, attachments })
    });
  }

  async updateMessage(messageId, content) {
    return this.request(`/messages/${messageId}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
  }

  async deleteMessage(messageId) {
    return this.request(`/messages/${messageId}`, {
      method: 'DELETE'
    });
  }

  async searchMessages(workspaceId, query, channelId = null, authorId = null) {
    const params = new URLSearchParams({ q: query });
    if (channelId) params.append('channelId', channelId);
    if (authorId) params.append('authorId', authorId);
    return this.request(`/messages/search/${workspaceId}?${params}`);
  }

  // Reactions
  async addReaction(messageId, emoji) {
    return this.request(`/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji })
    });
  }

  async removeReaction(messageId, emoji) {
    return this.request(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE'
    });
  }

  async markThreadRead(messageId) {
    return this.request(`/messages/${messageId}/thread-read`, {
      method: 'POST'
    });
  }

  // File uploads
  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${API_URL}/uploads`;
    const headers = {};

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }

    return response.json();
  }

  async uploadFiles(files) {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    const url = `${API_URL}/uploads/multiple`;
    const headers = {};

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }

    return response.json();
  }

  // Songs
  async getSongs(workspaceId) {
    return this.request(`/songs/workspace/${workspaceId}`);
  }

  async createSong(workspaceId, data) {
    return this.request(`/songs/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getSong(songId) {
    return this.request(`/songs/${songId}`);
  }

  async updateSong(songId, data) {
    return this.request(`/songs/${songId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteSong(songId) {
    return this.request(`/songs/${songId}`, {
      method: 'DELETE'
    });
  }

  async bulkImportSongs(workspaceId, songs, fetchMetadata = true) {
    return this.request(`/songs/workspace/${workspaceId}/bulk`, {
      method: 'POST',
      body: JSON.stringify({ songs, fetchMetadata })
    });
  }

  async enrichSongs(workspaceId, songIds = null) {
    return this.request(`/songs/workspace/${workspaceId}/enrich`, {
      method: 'POST',
      body: JSON.stringify({ songIds })
    });
  }

  async getMetadataStatus() {
    return this.request('/songs/metadata-status');
  }

  // Setlists
  async getSetlists(workspaceId) {
    return this.request(`/setlists/workspace/${workspaceId}`);
  }

  async createSetlist(workspaceId, data) {
    return this.request(`/setlists/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getSetlist(setlistId) {
    return this.request(`/setlists/${setlistId}`);
  }

  async updateSetlist(setlistId, data) {
    return this.request(`/setlists/${setlistId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteSetlist(setlistId) {
    return this.request(`/setlists/${setlistId}`, {
      method: 'DELETE'
    });
  }

  async duplicateSetlist(setlistId, name = null) {
    return this.request(`/setlists/${setlistId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  async importSetlist(workspaceId, name, songs, { useShortNames = false, performedAt = null, venue = null, startTime = null } = {}) {
    return this.request(`/setlists/workspace/${workspaceId}/import`, {
      method: 'POST',
      body: JSON.stringify({ name, songs, useShortNames, performedAt, venue, startTime })
    });
  }

  async importMultiSetlist(workspaceId, baseName, sets, { gigId = null, performedAt = null, venue = null, startTime = null } = {}) {
    return this.request(`/setlists/workspace/${workspaceId}/import-multiset`, {
      method: 'POST',
      body: JSON.stringify({ baseName, sets, gigId, performedAt, venue, startTime })
    });
  }

  // Gig setlists (multi-set)
  async addSetlistToGig(gigId, setlistId, setNumber = null) {
    return this.request(`/gigs/${gigId}/setlists`, {
      method: 'POST',
      body: JSON.stringify({ setlistId, setNumber })
    });
  }

  async removeSetlistFromGig(gigId, gigSetlistId) {
    return this.request(`/gigs/${gigId}/setlists/${gigSetlistId}`, {
      method: 'DELETE'
    });
  }

  async reorderGigSetlists(gigId, gigSetlistIds) {
    return this.request(`/gigs/${gigId}/setlists/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ gigSetlistIds })
    });
  }

  async addSongToSetlist(setlistId, songId) {
    return this.request(`/setlists/${setlistId}/songs`, {
      method: 'POST',
      body: JSON.stringify({ songId })
    });
  }

  async reorderSetlistItems(setlistId, itemIds) {
    return this.request(`/setlists/${setlistId}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ itemIds })
    });
  }

  async removeSongFromSetlist(setlistId, songId) {
    return this.request(`/setlists/${setlistId}/songs/${songId}`, {
      method: 'DELETE'
    });
  }

  async addMCToSetlist(setlistId, duration = 60, label = 'MC') {
    return this.request(`/setlists/${setlistId}/mc`, {
      method: 'POST',
      body: JSON.stringify({ duration, label })
    });
  }

  async addSetBreakToSetlist(setlistId, label = 'Set Break', duration = 900) {
    return this.request(`/setlists/${setlistId}/set-break`, {
      method: 'POST',
      body: JSON.stringify({ label, duration })
    });
  }

  async updateSetlistItem(setlistId, itemId, data) {
    return this.request(`/setlists/${setlistId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async removeSetlistItem(setlistId, itemId) {
    return this.request(`/setlists/${setlistId}/items/${itemId}`, {
      method: 'DELETE'
    });
  }

  async getSetlistPerformers(setlistId) {
    return this.request(`/setlists/${setlistId}/performers`);
  }

  async updateSetlistPerformers(setlistId, bandMemberIds) {
    return this.request(`/setlists/${setlistId}/performers`, {
      method: 'PUT',
      body: JSON.stringify({ bandMemberIds })
    });
  }

  // Gigs
  async getGigs(workspaceId, filters = {}) {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    if (filters.status) params.append('status', filters.status);
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);
    const query = params.toString();
    return this.request(`/gigs/workspace/${workspaceId}${query ? `?${query}` : ''}`);
  }

  async getGigsFromAllWorkspaces(excludeWorkspaceId = null, filters = {}) {
    const params = new URLSearchParams();
    if (excludeWorkspaceId) params.append('excludeWorkspaceId', excludeWorkspaceId);
    if (filters.type) params.append('type', filters.type);
    if (filters.status) params.append('status', filters.status);
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);
    const query = params.toString();
    return this.request(`/gigs/all-workspaces${query ? `?${query}` : ''}`);
  }

  async createGig(workspaceId, data) {
    return this.request(`/gigs/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getGig(gigId) {
    return this.request(`/gigs/${gigId}`);
  }

  async updateGig(gigId, data) {
    return this.request(`/gigs/${gigId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteGig(gigId) {
    return this.request(`/gigs/${gigId}`, {
      method: 'DELETE'
    });
  }

  async duplicateGig(gigId, date = null, title = null) {
    return this.request(`/gigs/${gigId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ date, title })
    });
  }

  async completeGig(gigId, songIds = []) {
    return this.request(`/gigs/${gigId}/complete`, {
      method: 'PUT',
      body: JSON.stringify({ songIds })
    });
  }

  async getGigStats(workspaceId) {
    return this.request(`/gigs/workspace/${workspaceId}/stats`);
  }

  async autoLinkSetlists(workspaceId) {
    return this.request(`/gigs/workspace/${workspaceId}/auto-link-setlists`, {
      method: 'POST'
    });
  }

  // Gig Archive / Media
  async addGigMedia(gigId, data) {
    return this.request(`/gigs/${gigId}/media`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async deleteGigMedia(gigId, mediaId) {
    return this.request(`/gigs/${gigId}/media/${mediaId}`, {
      method: 'DELETE'
    });
  }

  // Band Members
  async getBandMembers(workspaceId) {
    return this.request(`/band-members/workspace/${workspaceId}`);
  }

  async createBandMember(workspaceId, data) {
    return this.request(`/band-members/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateBandMember(memberId, data) {
    return this.request(`/band-members/${memberId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteBandMember(memberId) {
    return this.request(`/band-members/${memberId}`, {
      method: 'DELETE'
    });
  }

  // Member Availability
  async getAvailability(workspaceId, startDate = null, endDate = null) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const query = params.toString();
    return this.request(`/availability/workspace/${workspaceId}${query ? `?${query}` : ''}`);
  }

  async getMyAvailability(workspaceId, startDate = null, endDate = null) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const query = params.toString();
    return this.request(`/availability/workspace/${workspaceId}/me${query ? `?${query}` : ''}`);
  }

  async setAvailability(workspaceId, date, status, note = null) {
    return this.request(`/availability/workspace/${workspaceId}/date/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ status, note })
    });
  }

  async setBulkAvailability(workspaceId, dates, status, note = null) {
    return this.request(`/availability/workspace/${workspaceId}/bulk`, {
      method: 'PUT',
      body: JSON.stringify({ dates, status, note })
    });
  }

  async clearAvailability(workspaceId, date) {
    return this.request(`/availability/workspace/${workspaceId}/date/${date}`, {
      method: 'DELETE'
    });
  }

  async getAvailabilitySummary(workspaceId, date) {
    return this.request(`/availability/workspace/${workspaceId}/summary/${date}`);
  }

  // Song Attachments
  async getSongAttachments(songId) {
    return this.request(`/songs/${songId}/attachments`);
  }

  async addSongAttachment(songId, data) {
    return this.request(`/songs/${songId}/attachments`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async deleteSongAttachment(songId, attachmentId) {
    return this.request(`/songs/${songId}/attachments/${attachmentId}`, {
      method: 'DELETE'
    });
  }

  // Contacts
  async getContacts(workspaceId, category = null) {
    const params = category ? `?category=${category}` : '';
    return this.request(`/contacts/workspace/${workspaceId}${params}`);
  }

  async createContact(workspaceId, data) {
    return this.request(`/contacts/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getContact(contactId) {
    return this.request(`/contacts/${contactId}`);
  }

  async updateContact(contactId, data) {
    return this.request(`/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteContact(contactId) {
    return this.request(`/contacts/${contactId}`, {
      method: 'DELETE'
    });
  }

  // Announcements
  async getAnnouncements(workspaceId, pinnedOnly = false) {
    const params = pinnedOnly ? '?pinnedOnly=true' : '';
    return this.request(`/announcements/workspace/${workspaceId}${params}`);
  }

  async createAnnouncement(workspaceId, data) {
    return this.request(`/announcements/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getAnnouncement(announcementId) {
    return this.request(`/announcements/${announcementId}`);
  }

  async updateAnnouncement(announcementId, data) {
    return this.request(`/announcements/${announcementId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async acknowledgeAnnouncement(announcementId) {
    return this.request(`/announcements/${announcementId}/acknowledge`, {
      method: 'POST'
    });
  }

  async deleteAnnouncement(announcementId) {
    return this.request(`/announcements/${announcementId}`, {
      method: 'DELETE'
    });
  }

  // Polls
  async getPolls(workspaceId, options = {}) {
    const params = new URLSearchParams();
    if (options.channelId) params.append('channelId', options.channelId);
    if (options.includeCompleted) params.append('includeCompleted', 'true');
    const query = params.toString();
    return this.request(`/polls/workspace/${workspaceId}${query ? `?${query}` : ''}`);
  }

  async createPoll(workspaceId, data) {
    return this.request(`/polls/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getPoll(pollId) {
    return this.request(`/polls/${pollId}`);
  }

  async votePoll(pollId, optionIds) {
    return this.request(`/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionIds })
    });
  }

  async closePoll(pollId) {
    return this.request(`/polls/${pollId}/close`, {
      method: 'POST'
    });
  }

  async deletePoll(pollId) {
    return this.request(`/polls/${pollId}`, {
      method: 'DELETE'
    });
  }

  // Medleys
  async getMedleys(workspaceId) {
    return this.request(`/medleys/workspace/${workspaceId}`);
  }

  async createMedley(workspaceId, data) {
    return this.request(`/medleys/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getMedley(medleyId) {
    return this.request(`/medleys/${medleyId}`);
  }

  async updateMedley(medleyId, data) {
    return this.request(`/medleys/${medleyId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async reorderMedley(medleyId, songIds) {
    return this.request(`/medleys/${medleyId}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ songIds })
    });
  }

  async deleteMedley(medleyId) {
    return this.request(`/medleys/${medleyId}`, {
      method: 'DELETE'
    });
  }

  // Timeline
  async getTimeline(workspaceId) {
    return this.request(`/timeline/workspace/${workspaceId}`);
  }

  async createTimelineEvent(workspaceId, data) {
    return this.request(`/timeline/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateTimelineEvent(eventId, data) {
    return this.request(`/timeline/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteTimelineEvent(eventId) {
    return this.request(`/timeline/${eventId}`, {
      method: 'DELETE'
    });
  }

  async generateTimeline(workspaceId) {
    return this.request(`/timeline/workspace/${workspaceId}/generate`, {
      method: 'POST'
    });
  }

  async regenerateTimeline(workspaceId) {
    return this.request(`/timeline/workspace/${workspaceId}/regenerate`, {
      method: 'POST'
    });
  }

  // Achievements
  async getAchievementDefinitions() {
    return this.request('/achievements/definitions');
  }

  async getBandAchievements(workspaceId) {
    return this.request(`/achievements/workspace/${workspaceId}/band`);
  }

  async getMemberAchievements(workspaceId) {
    return this.request(`/achievements/workspace/${workspaceId}/members`);
  }

  async getMyAchievements(workspaceId) {
    return this.request(`/achievements/workspace/${workspaceId}/me`);
  }

  async checkAchievements(workspaceId) {
    return this.request(`/achievements/workspace/${workspaceId}/check`, {
      method: 'POST'
    });
  }

  async reseedAchievements() {
    return this.request('/achievements/reseed', {
      method: 'POST'
    });
  }

  async resetBandBadges(workspaceId) {
    return this.request(`/achievements/workspace/${workspaceId}/reset-band-badges`, {
      method: 'POST'
    });
  }

  async awardAchievement(workspaceId, achievementCode, userId = null) {
    return this.request(`/achievements/workspace/${workspaceId}/award`, {
      method: 'POST',
      body: JSON.stringify({ achievementCode, userId })
    });
  }

  async getAchievementLeaderboard(workspaceId) {
    return this.request(`/achievements/workspace/${workspaceId}/leaderboard`);
  }

  // Recordings
  async getRecordings(workspaceId, filters = {}) {
    const params = new URLSearchParams();
    if (filters.songId) params.append('songId', filters.songId);
    if (filters.type) params.append('type', filters.type);
    const query = params.toString();
    return this.request(`/recordings/workspace/${workspaceId}${query ? `?${query}` : ''}`);
  }

  async getSongRecordings(songId) {
    return this.request(`/recordings/song/${songId}`);
  }

  async createRecording(workspaceId, data) {
    return this.request(`/recordings/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateRecording(recordingId, data) {
    return this.request(`/recordings/${recordingId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteRecording(recordingId) {
    return this.request(`/recordings/${recordingId}`, {
      method: 'DELETE'
    });
  }

  // Suggestions & Mashups
  async getMashupSuggestions(workspaceId, songId) {
    return this.request(`/suggestions/workspace/${workspaceId}/mashups/${songId}`);
  }

  async getTransitions(workspaceId, minScore = 50) {
    return this.request(`/suggestions/workspace/${workspaceId}/transitions?minScore=${minScore}`);
  }

  async getSongRecommendations(workspaceId, limit = 20) {
    return this.request(`/suggestions/workspace/${workspaceId}/recommendations?limit=${limit}`);
  }

  async optimizeSetlist(workspaceId, songIds) {
    return this.request(`/suggestions/workspace/${workspaceId}/optimize-setlist`, {
      method: 'POST',
      body: JSON.stringify({ songIds })
    });
  }

  // Notification Snooze
  async getNotificationSnoozeStatus() {
    return this.request('/push/snooze-status');
  }

  async setNotificationSnooze(duration) {
    return this.request('/push/snooze', {
      method: 'POST',
      body: JSON.stringify({ duration })
    });
  }

  // Band Kitty
  async getKitty(workspaceId) {
    return this.request(`/kitty/workspace/${workspaceId}`);
  }

  async updateKittySettings(workspaceId, data) {
    return this.request(`/kitty/workspace/${workspaceId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async createKittyTransaction(workspaceId, data) {
    return this.request(`/kitty/workspace/${workspaceId}/transactions`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateKittyTransaction(transactionId, data) {
    return this.request(`/kitty/transactions/${transactionId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteKittyTransaction(transactionId) {
    return this.request(`/kitty/transactions/${transactionId}`, {
      method: 'DELETE'
    });
  }
}

export const api = new ApiService();
export default api;
