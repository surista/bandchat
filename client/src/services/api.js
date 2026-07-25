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
    this.accessToken = null;
    // Primary: refresh token in httpOnly cookie (set by server).
    // Fallback: refresh token in sessionStorage, sent in the request body.
    // Needed because client (Vercel) and server (Railway) are on different
    // top-level domains, making the cookie a cross-site/third-party cookie —
    // browsers (Safari ITP in particular, increasingly Chrome/Firefox too)
    // routinely block or purge those even with SameSite=None;Secure set
    // correctly server-side. sessionStorage (not localStorage) so the token
    // still doesn't outlive the tab/window — it just needs to survive a
    // same-tab reload, which is the actual bug this fixes: without it, a
    // page refresh has nothing to fall back on when the cookie doesn't make
    // it, forcing a full re-login every time.
    this._refreshToken = null;
    try {
      this._refreshToken = sessionStorage.getItem('refreshToken') || null;
    } catch {
      // Safari private mode etc. can throw on storage access — fall back to
      // cookie-only behavior rather than crash.
    }
    // Clean up legacy tokens from localStorage (one-time migration).
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    // _hasSession indicates we may have a valid session.
    this._hasSession = false;
    this._refreshPromise = null;
    // In-memory response cache: endpoint -> { data, timestamp }
    this._cache = new Map();
  }

  isTokenExpiringSoon() {
    if (!this.accessToken) return false;
    try {
      const payload = JSON.parse(atob(this.accessToken.split('.')[1]));
      // Refresh if token expires within 60 seconds
      return payload.exp * 1000 < Date.now() + 60000;
    } catch {
      return false;
    }
  }

  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    if (refreshToken) {
      this._refreshToken = refreshToken;
      try {
        sessionStorage.setItem('refreshToken', refreshToken);
      } catch {
        // Storage access can throw (private mode, quota) — the in-memory
        // copy still works for the rest of this tab's lifetime.
      }
    }
    this._hasSession = true;
  }

  clearTokens() {
    this.accessToken = null;
    this._refreshToken = null;
    this._hasSession = false;
    this._cache.clear();
    try {
      sessionStorage.removeItem('refreshToken');
    } catch {}
  }

  async request(endpoint, options = {}) {
    // Proactively refresh token before it expires to avoid 401 errors
    if (this._hasSession && this.isTokenExpiringSoon()) {
      if (!this._refreshPromise) {
        this._refreshPromise = this.refreshAccessToken().finally(() => {
          this._refreshPromise = null;
        });
      }
      await this._refreshPromise;
    }

    // Invalidate cache on mutations (POST/PUT/PATCH/DELETE)
    if (options.method && options.method !== 'GET') {
      // Extract the resource path to invalidate related cache entries
      // e.g. /channels/workspace/abc123 → invalidate /channels/ entries
      const resourceBase = endpoint.split('/').slice(0, 2).join('/');
      this.invalidateCache(resourceBase);
    }

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
        headers,
        credentials: 'include' // Send httpOnly cookies (refresh token)
      });

      // Handle token expiration with lock to prevent concurrent refreshes
      if (response.status === 401 && this._hasSession) {
        if (!this._refreshPromise) {
          this._refreshPromise = this.refreshAccessToken().finally(() => {
            this._refreshPromise = null;
          });
        }
        const refreshed = await this._refreshPromise;
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await fetch(url, { ...options, headers, credentials: 'include' });
          return this.handleResponse(retryResponse);
        }
        // Refresh failed — only redirect if tokens were cleared (definitive auth failure)
        if (!this._hasSession) {
          window.location.href = '/login';
        }
        throw new Error('Session expired. Please log in again.');
      }

      return this.handleResponse(response);
    } catch (error) {
      if (error instanceof TypeError) throw new Error('Network error');
      throw error;
    }
  }

  async handleResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  /**
   * Fire-and-forget PUT that survives page unload (pagehide/beforeunload).
   * Uses raw fetch with keepalive — no async token-refresh logic that the
   * browser would kill mid-unload. If the token happens to be expired the
   * server returns 401 and the write is silently lost, which is acceptable
   * (the next session will re-sync from the authoritative server blob).
   */
  keepalivePut(endpoint, body) {
    if (!this.accessToken) return;
    try {
      fetch(`${API_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`,
        },
        body,
        credentials: 'include',
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  /**
   * Cached GET request — returns cached data if within TTL, otherwise fetches fresh.
   * @param {string} endpoint - API endpoint
   * @param {number} ttlMs - Cache TTL in milliseconds (default 60s)
   */
  async cachedRequest(endpoint, ttlMs = 60000) {
    const cached = this._cache.get(endpoint);
    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return cached.data;
    }
    const data = await this.request(endpoint);
    this._cache.set(endpoint, { data, timestamp: Date.now() });
    return data;
  }

  /** Invalidate cache entries matching a prefix pattern */
  invalidateCache(pattern) {
    if (!pattern) {
      this._cache.clear();
      return;
    }
    for (const key of this._cache.keys()) {
      if (key.includes(pattern)) {
        this._cache.delete(key);
      }
    }
  }

  async refreshAccessToken() {
    try {
      // Send refresh token in body as fallback for cross-origin deployments
      // where httpOnly cookies may be blocked by SameSite policy.
      // Server checks cookie first, then falls back to body.
      const body = this._refreshToken ? { refreshToken: this._refreshToken } : {};
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const data = await response.json();
        this.setTokens(data.accessToken, data.refreshToken);
        return true;
      }

      // Only clear tokens on definitive auth failures (401/403)
      // Don't clear on server errors (500) or rate limits (429) — those are transient
      if (response.status === 401 || response.status === 403) {
        this.clearTokens();
      }
      return false;
    } catch {
      // Network error (server down, deploy in progress) — don't clear tokens
      // The next request will retry the refresh
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
    // Revoke refresh token on server (cookie + body fallback)
    try {
      const body = this._refreshToken ? { refreshToken: this._refreshToken } : {};
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
    } catch {
      // Ignore errors - still clear local tokens
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
    return this.cachedRequest(`/workspaces/${id}`, 30000);
  }

  async getWorkspacePlan(workspaceId) {
    return this.request(`/subscriptions/${workspaceId}/plan`);
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

  async relinkMessages(workspaceId) {
    return this.request(`/workspaces/${workspaceId}/relink-messages`, {
      method: 'POST'
    });
  }

  async getOrphanedAuthors(workspaceId) {
    return this.request(`/workspaces/${workspaceId}/orphaned-authors`);
  }

  async applyMessageMappings(workspaceId, mappings) {
    return this.request(`/workspaces/${workspaceId}/apply-message-mappings`, {
      method: 'POST',
      body: JSON.stringify({ mappings })
    });
  }

  async leaveWorkspace(id) {
    return this.request(`/workspaces/${id}/leave`, {
      method: 'POST'
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

  async updateMemberRole(workspaceId, userId, role) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
  }

  async adminUpdateMember(workspaceId, userId, data) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
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
    return this.cachedRequest(`/channels/workspace/${workspaceId}`, 30000);
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

  async starChannel(channelId, starred) {
    return this.request(`/channels/${channelId}/star`, {
      method: 'PUT',
      body: JSON.stringify({ starred })
    });
  }

  async markChannelRead(channelId) {
    return this.request(`/channels/${channelId}/read`, {
      method: 'POST'
    });
  }

  async markWorkspaceRead(workspaceId) {
    return this.request(`/workspaces/${workspaceId}/read`, {
      method: 'POST'
    });
  }

  // Direct Messages
  async getDMs(workspaceId) {
    return this.cachedRequest(`/channels/workspace/${workspaceId}/dms`, 30000);
  }

  async createOrGetDM(workspaceId, userIds) {
    return this.request(`/channels/workspace/${workspaceId}/dm`, {
      method: 'POST',
      body: JSON.stringify({ userIds })
    });
  }

  // Channel Groups
  async getChannelGroups(workspaceId) {
    return this.cachedRequest(`/channel-groups/workspace/${workspaceId}`, 60000);
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

  async reorderChannelGroups(workspaceId, groupIds) {
    return this.request(`/channel-groups/workspace/${workspaceId}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ groupIds })
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

  async toggleMessagePreview(messageId) {
    return this.request(`/messages/${messageId}/preview`, {
      method: 'PATCH'
    });
  }

  async deleteMessage(messageId) {
    return this.request(`/messages/${messageId}`, {
      method: 'DELETE'
    });
  }

  // Reports
  async reportMessage(messageId, reason) {
    return this.request('/reports', {
      method: 'POST',
      body: JSON.stringify({ messageId, reason })
    });
  }

  // Blocks
  async blockUser(blockedUserId) {
    return this.request('/blocks', {
      method: 'POST',
      body: JSON.stringify({ blockedUserId })
    });
  }

  async unblockUser(blockedUserId) {
    return this.request(`/blocks/${blockedUserId}`, {
      method: 'DELETE'
    });
  }

  async getBlockedUsers() {
    return this.request('/blocks');
  }

  async getMessageTimeline(workspaceId, cursor = null) {
    const params = cursor ? `?cursor=${cursor}` : '';
    return this.request(`/messages/timeline/${workspaceId}${params}`);
  }

  async getActivity(workspaceId) {
    return this.request(`/messages/activity/${workspaceId}`);
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

  async pinMessage(messageId) {
    return this.request(`/messages/${messageId}/pin`, {
      method: 'POST'
    });
  }

  async unpinMessage(messageId) {
    return this.request(`/messages/${messageId}/pin`, {
      method: 'DELETE'
    });
  }

  async getPinnedMessages(channelId) {
    return this.request(`/messages/channel/${channelId}/pins`);
  }

  async pinSetlist(channelId, setlistId) {
    return this.request(`/channels/${channelId}/pin-setlist`, {
      method: 'POST',
      body: JSON.stringify({ setlistId })
    });
  }

  async unpinSetlist(channelId) {
    return this.request(`/channels/${channelId}/pin-setlist`, {
      method: 'DELETE'
    });
  }

  // Saved messages (bookmarks)
  async saveMessage(messageId) {
    return this.request(`/messages/${messageId}/save`, { method: 'POST' });
  }

  async unsaveMessage(messageId) {
    return this.request(`/messages/${messageId}/save`, { method: 'DELETE' });
  }

  async getSavedMessages(workspaceId) {
    return this.request(`/messages/workspace/${workspaceId}/saved`);
  }

  // File uploads
  async uploadFile(file, workspaceId) {
    if (this._hasSession && this.isTokenExpiringSoon()) {
      if (!this._refreshPromise) {
        this._refreshPromise = this.refreshAccessToken().finally(() => { this._refreshPromise = null; });
      }
      await this._refreshPromise;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (workspaceId) formData.append('workspaceId', workspaceId);

    const url = `${API_URL}/uploads`;
    const headers = {};

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }

    return response.json();
  }

  async uploadFiles(files, workspaceId) {
    if (this._hasSession && this.isTokenExpiringSoon()) {
      if (!this._refreshPromise) {
        this._refreshPromise = this.refreshAccessToken().finally(() => { this._refreshPromise = null; });
      }
      await this._refreshPromise;
    }

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    if (workspaceId) formData.append('workspaceId', workspaceId);

    const url = `${API_URL}/uploads/multiple`;
    const headers = {};

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      credentials: 'include',
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
    return this.cachedRequest(`/songs/workspace/${workspaceId}`, 60000);
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

  // Per-user personal notes on setlist songs.
  // Notes are private to the current user and surface on their PDF/Word exports.
  async getMySetlistNotes(setlistId) {
    return this.request(`/setlists/${setlistId}/my-notes`);
  }

  async saveSetlistSongNote(setlistSongId, content) {
    // Empty content clears the note. The server treats empty-string as delete.
    return this.request(`/setlists/songs/${setlistSongId}/my-note`, {
      method: 'PUT',
      body: JSON.stringify({ content })
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

  async getNextGig(workspaceId) {
    return this.request(`/gigs/workspace/${workspaceId}/next`);
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

  async setMyAttendance(gigId, data) {
    return this.request(`/gigs/${gigId}/my-attendance`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getMyConflicts(filters = {}) {
    const params = new URLSearchParams();
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);
    const query = params.toString();
    return this.request(`/gigs/my-conflicts${query ? `?${query}` : ''}`);
  }

  async setCalendarVisibility(calendarVisibility) {
    return this.request('/auth/me/calendar-visibility', {
      method: 'PUT',
      body: JSON.stringify({ calendarVisibility }),
    });
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

  async getGigMedia(gigId) {
    return this.request(`/gigs/${gigId}/media`);
  }

  async deleteGigMedia(gigId, mediaId) {
    return this.request(`/gigs/${gigId}/media/${mediaId}`, {
      method: 'DELETE'
    });
  }

  // Gig Comments
  async getGigComments(gigId) {
    return this.request(`/gigs/${gigId}/comments`);
  }

  async addGigComment(gigId, content) {
    return this.request(`/gigs/${gigId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async updateGigComment(gigId, commentId, content) {
    return this.request(`/gigs/${gigId}/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async deleteGigComment(gigId, commentId) {
    return this.request(`/gigs/${gigId}/comments/${commentId}`, {
      method: 'DELETE',
    });
  }

  // iCal Calendar Sync
  async getCalendarToken(workspaceId) {
    return this.request(`/gigs/workspace/${workspaceId}/calendar-token`);
  }

  async generateCalendarToken(workspaceId) {
    return this.request(`/gigs/workspace/${workspaceId}/calendar-token`, { method: 'POST' });
  }

  // Band Members
  async getBandMembers(workspaceId) {
    return this.cachedRequest(`/band-members/workspace/${workspaceId}`, 60000);
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

  // Venues
  async getVenues(workspaceId) {
    return this.request(`/venues/workspace/${workspaceId}`);
  }

  async createVenue(workspaceId, data) {
    return this.request(`/venues/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateVenue(venueId, data) {
    return this.request(`/venues/${venueId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteVenue(venueId) {
    return this.request(`/venues/${venueId}`, {
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

  // Notification Preferences
  async getNotificationPreferences(workspaceId) {
    return this.request(`/push/preferences/${workspaceId}`);
  }

  async updateNotificationPreferences(workspaceId, prefs) {
    return this.request(`/push/preferences/${workspaceId}`, {
      method: 'PUT',
      body: JSON.stringify(prefs)
    });
  }

  // Read Receipts
  async getMessageSeenBy(messageId) {
    return this.request(`/messages/${messageId}/seen-by`);
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

  // Practice
  async logPractice(workspaceId, data) {
    return this.request(`/practice/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getMyPractice(workspaceId, cursor) {
    const params = cursor ? `?cursor=${cursor}` : '';
    return this.request(`/practice/workspace/${workspaceId}/me${params}`);
  }

  async getPracticeSummary(workspaceId) {
    return this.request(`/practice/workspace/${workspaceId}/summary`);
  }

  async deletePracticeSession(sessionId) {
    return this.request(`/practice/${sessionId}`, { method: 'DELETE' });
  }

  // Link Previews
  async getLinkPreview(url) {
    return this.request(`/link-preview?url=${encodeURIComponent(url)}`);
  }

  // Account Management
  async deleteAccount(password) {
    return this.request('/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password })
    });
  }

  async exportUserData() {
    const url = `${API_URL}/auth/export`;
    const headers = { Authorization: `Bearer ${this.accessToken}` };
    const response = await fetch(url, { headers, credentials: 'include' });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Export failed');
    }
    const blob = await response.blob();
    const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'bandchat-export.json';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async exportWorkspaceData(workspaceId) {
    const url = `${API_URL}/workspaces/${workspaceId}/export`;
    const headers = { Authorization: `Bearer ${this.accessToken}` };
    const response = await fetch(url, { headers, credentials: 'include' });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Export failed');
    }
    const blob = await response.blob();
    const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'bandchat-workspace-export.json';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Slack Import
  async parseSlackExport(workspaceId, file) {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${API_URL}/slack-import/workspace/${workspaceId}/parse`;
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
      throw new Error(data.error || 'Failed to parse Slack export');
    }

    return response.json();
  }

  async importSlackData(workspaceId, config) {
    return this.request(`/slack-import/workspace/${workspaceId}/import`, {
      method: 'POST',
      body: JSON.stringify(config)
    });
  }

  async updateSlackFiles(workspaceId, file) {
    if (this._hasSession && this.isTokenExpiringSoon()) {
      if (!this._refreshPromise) {
        this._refreshPromise = this.refreshAccessToken().finally(() => { this._refreshPromise = null; });
      }
      await this._refreshPromise;
    }

    const formData = new FormData();
    formData.append('file', file);

    const url = `${API_URL}/slack-import/workspace/${workspaceId}/update-files`;
    const headers = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Workspace Import (from BandChat export JSON)
  async parseWorkspaceExport(file) {
    if (this._hasSession && this.isTokenExpiringSoon()) {
      if (!this._refreshPromise) {
        this._refreshPromise = this.refreshAccessToken().finally(() => { this._refreshPromise = null; });
      }
      await this._refreshPromise;
    }

    const formData = new FormData();
    formData.append('file', file);

    const url = `${API_URL}/workspace-import/parse`;
    const headers = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Upload failed (${response.status})`);
    }

    return response.json();
  }

  async executeWorkspaceImport(config) {
    return this.request('/workspace-import/execute', {
      method: 'POST',
      body: JSON.stringify(config)
    });
  }

  // ICS Calendar Import
  async previewICS(workspaceId, icsContent) {
    return this.request(`/gigs/workspace/${workspaceId}/preview-ics`, {
      method: 'POST',
      body: JSON.stringify({ icsContent })
    });
  }

  async importICS(workspaceId, icsContent, type = 'REHEARSAL') {
    return this.request(`/gigs/workspace/${workspaceId}/import-ics`, {
      method: 'POST',
      body: JSON.stringify({ icsContent, type })
    });
  }
  // --- Stage Plots ---

  async getStagePlots(workspaceId) {
    return this.request(`/stage-plots/workspace/${workspaceId}`);
  }

  async getStagePlot(stagePlotId) {
    return this.request(`/stage-plots/${stagePlotId}`);
  }

  async createStagePlot(workspaceId, data) {
    return this.request(`/stage-plots/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateStagePlot(stagePlotId, data) {
    return this.request(`/stage-plots/${stagePlotId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteStagePlot(stagePlotId) {
    return this.request(`/stage-plots/${stagePlotId}`, {
      method: 'DELETE'
    });
  }

  async duplicateStagePlot(stagePlotId) {
    return this.request(`/stage-plots/${stagePlotId}/duplicate`, {
      method: 'POST'
    });
  }
  // --- Website ---

  async getWebsiteConfig(workspaceId) {
    return this.request(`/website/${workspaceId}`);
  }

  async updateWebsiteConfig(workspaceId, config) {
    return this.request(`/website/${workspaceId}/config`, {
      method: 'PUT',
      body: JSON.stringify(config)
    });
  }

  async deployWebsite(workspaceId) {
    return this.request(`/website/${workspaceId}/deploy`, {
      method: 'POST'
    });
  }

  async syncWebsite(workspaceId) {
    return this.request(`/website/${workspaceId}/sync`, {
      method: 'POST'
    });
  }

  async deleteWebsite(workspaceId) {
    return this.request(`/website/${workspaceId}`, {
      method: 'DELETE'
    });
  }

  async getWebsiteStatus(workspaceId) {
    return this.request(`/website/${workspaceId}/status`);
  }

  async getWebsiteTemplateVersion(workspaceId) {
    return this.request(`/website/${workspaceId}/template-version`);
  }

  async upgradeWebsiteTemplate(workspaceId) {
    return this.request(`/website/${workspaceId}/upgrade-template`, {
      method: 'POST',
    });
  }
}

export const api = new ApiService();
export default api;
