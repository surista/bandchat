import Constants from 'expo-constants';
import storage from './storage';

/**
 * @fileoverview API client for BandChat mobile app.
 * Handles all HTTP communication with the server including authentication,
 * token refresh, caching, and error handling.
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} email
 * @property {string} displayName
 * @property {string} [avatarUrl]
 * @property {boolean} [isSystemAdmin]
 */

/**
 * @typedef {Object} Workspace
 * @property {string} id
 * @property {string} name
 * @property {string} [slug]
 * @property {string} [avatarUrl]
 * @property {WorkspaceMember[]} [members]
 */

/**
 * @typedef {Object} WorkspaceMember
 * @property {string} id
 * @property {string} role
 * @property {User} user
 */

/**
 * @typedef {Object} Channel
 * @property {string} id
 * @property {string} name
 * @property {boolean} isPrivate
 * @property {boolean} isDM
 * @property {string} workspaceId
 */

/**
 * @typedef {Object} Message
 * @property {string} id
 * @property {string} content
 * @property {string} createdAt
 * @property {string} [updatedAt]
 * @property {User} [author]
 * @property {Attachment[]} [attachments]
 * @property {Reaction[]} [reactions]
 */

/**
 * @typedef {Object} Attachment
 * @property {string} id
 * @property {string} url
 * @property {string} type
 * @property {string} [filename]
 */

/**
 * @typedef {Object} Reaction
 * @property {string} emoji
 * @property {User[]} users
 */

/**
 * @typedef {Object} Song
 * @property {string} id
 * @property {string} title
 * @property {string} [artist]
 * @property {string} [shortName]
 * @property {string} [key]
 * @property {number} [bpm]
 * @property {number} [duration]
 * @property {string} [youtubeUrl]
 * @property {string} [spotifyUrl]
 * @property {string} [lyrics]
 */

/**
 * @typedef {Object} Setlist
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {string} [performedAt]
 * @property {string} [venue]
 * @property {string} [startTime]
 * @property {SetlistSong[]} [songs]
 */

/**
 * @typedef {Object} SetlistSong
 * @property {string} id
 * @property {string} type
 * @property {number} position
 * @property {Song} [song]
 * @property {string} [label]
 * @property {number} [duration]
 */

/**
 * @typedef {Object} Gig
 * @property {string} id
 * @property {string} title
 * @property {string} date
 * @property {string} [venue]
 * @property {string} type
 * @property {string} status
 * @property {string} [notes]
 */

/**
 * @typedef {Object} BandMember
 * @property {string} id
 * @property {string} name
 * @property {string} [instruments]
 * @property {string} [avatarUrl]
 */

/**
 * @typedef {Object} CacheEntry
 * @property {any} data
 * @property {number} timestamp
 */

/**
 * @typedef {Object} ApiError
 * @property {string} message
 * @property {string} [type]
 * @property {number} [status]
 */

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3001/api';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const UPLOAD_TIMEOUT = 120000; // 2 minutes for uploads

/**
 * Fetch with timeout support
 */
function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * Error types for better error handling
 */
const ErrorTypes = {
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  AUTH: 'AUTH',
  SERVER: 'SERVER',
  VALIDATION: 'VALIDATION',
};

class ApiService {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this._refreshPromise = null;
    this.onSessionExpired = null;
    this._cache = new Map(); // endpoint -> { data, timestamp }
  }

  async loadTokens() {
    this.accessToken = await storage.getItem('accessToken');
    this.refreshToken = await storage.getItem('refreshToken');
  }

  isTokenExpiringSoon() {
    if (!this.accessToken) return false;
    try {
      const payload = JSON.parse(atob(this.accessToken.split('.')[1]));
      return payload.exp * 1000 < Date.now() + 60000;
    } catch {
      return false;
    }
  }

  async setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;

    // Store tokens and track success
    const [accessStored, refreshStored] = await Promise.all([
      storage.setItem('accessToken', accessToken),
      storage.setItem('refreshToken', refreshToken),
    ]);

    // Warn if storage failed - user may need to re-login on app restart
    if (!accessStored || !refreshStored) {
      console.error('Token storage failed:', {
        accessStored,
        refreshStored,
        lastError: storage.getLastError(),
      });
      // Tokens are still in memory, so the current session works.
      // But the user will need to re-authenticate on next app launch.
    }

    return accessStored && refreshStored;
  }

  async clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this._cache.clear();
    await storage.removeItem('accessToken');
    await storage.removeItem('refreshToken');
  }

  /**
   * Cached GET request - returns cached data if within TTL, otherwise fetches fresh.
   * @param {string} endpoint - API endpoint
   * @param {number} ttlMs - Cache TTL in milliseconds (default 60s)
   * @returns {Promise<any>}
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

  /**
   * Invalidate cache entries matching a pattern
   * @param {string} pattern - Pattern to match against cache keys (or null to clear all)
   */
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

  async ensureFreshToken() {
    if (this.refreshToken && this.isTokenExpiringSoon()) {
      if (!this._refreshPromise) {
        this._refreshPromise = this.refreshAccessToken().finally(() => {
          this._refreshPromise = null;
        });
      }
      await this._refreshPromise;
    }
  }

  async request(endpoint, options = {}, timeout = DEFAULT_TIMEOUT) {
    if (this.refreshToken && this.isTokenExpiringSoon()) {
      if (!this._refreshPromise) {
        this._refreshPromise = this.refreshAccessToken().finally(() => {
          this._refreshPromise = null;
        });
      }
      await this._refreshPromise;
    }

    // Invalidate cache on mutations (POST/PUT/PATCH/DELETE)
    if (options.method && options.method !== 'GET') {
      const resourceBase = endpoint.split('/').slice(0, 2).join('/');
      this.invalidateCache(resourceBase);
    }

    const url = `${API_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetchWithTimeout(url, {
        ...options,
        headers,
      }, timeout);

      if (response.status === 401 && this.refreshToken) {
        if (!this._refreshPromise) {
          this._refreshPromise = this.refreshAccessToken().finally(() => {
            this._refreshPromise = null;
          });
        }
        const refreshed = await this._refreshPromise;
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await fetchWithTimeout(url, { ...options, headers }, timeout);
          return this.handleResponse(retryResponse);
        }
        if (this.onSessionExpired) {
          this.onSessionExpired();
        }
        const error = new Error('Session expired. Please log in again.');
        error.type = ErrorTypes.AUTH;
        throw error;
      }

      return this.handleResponse(response);
    } catch (error) {
      // Preserve typed errors
      if (error.type) {
        throw error;
      }
      // Handle timeout
      if (error.name === 'AbortError') {
        const timeoutError = new Error('Request timed out. Please check your connection and try again.');
        timeoutError.type = ErrorTypes.TIMEOUT;
        throw timeoutError;
      }
      // Handle network errors
      if (error instanceof TypeError || error.message === 'Network request failed') {
        const networkError = new Error('Unable to connect. Please check your internet connection.');
        networkError.type = ErrorTypes.NETWORK;
        throw networkError;
      }
      // Re-throw with original message if it's meaningful
      throw error;
    }
  }

  async handleResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.error || this._getErrorMessage(response.status));
      error.status = response.status;
      error.type = this._getErrorType(response.status);
      throw error;
    }

    return data;
  }

  _getErrorMessage(status) {
    switch (status) {
      case 400: return 'Invalid request. Please check your input.';
      case 401: return 'Please log in to continue.';
      case 403: return 'You don\'t have permission to do that.';
      case 404: return 'The requested item was not found.';
      case 409: return 'This conflicts with existing data.';
      case 413: return 'The file is too large.';
      case 429: return 'Too many requests. Please wait a moment.';
      case 500: return 'Server error. Please try again later.';
      case 502:
      case 503:
      case 504: return 'Service temporarily unavailable. Please try again.';
      default: return 'Something went wrong. Please try again.';
    }
  }

  _getErrorType(status) {
    if (status === 401 || status === 403) return ErrorTypes.AUTH;
    if (status >= 400 && status < 500) return ErrorTypes.VALIDATION;
    if (status >= 500) return ErrorTypes.SERVER;
    return ErrorTypes.SERVER;
  }

  async refreshAccessToken() {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        await this.setTokens(data.accessToken, data.refreshToken);
        return true;
      }

      await this.clearTokens();
      return false;
    } catch {
      await this.clearTokens();
      return false;
    }
  }

  // Auth
  async signup(email, password, displayName) {
    const data = await this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async logout() {
    if (this.refreshToken) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
      } catch {
        // Ignore errors - still clear local tokens
      }
    }
    await this.clearTokens();
  }

  async getMe() {
    return this.request('/auth/me');
  }

  async updateProfile(data) {
    return this.request('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
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
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async requestEmailChange(newEmail, password) {
    return this.request('/auth/change-email', {
      method: 'POST',
      body: JSON.stringify({ newEmail, password }),
    });
  }

  async verifyEmailChange(token) {
    return this.request('/auth/verify-email-change', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async googleAuth(credential) {
    const data = await this.request('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async appleAuth(identityToken, fullName) {
    const data = await this.request('/auth/apple', {
      method: 'POST',
      body: JSON.stringify({ identityToken, fullName }),
    });
    if (data.accessToken) {
      await this.setTokens(data.accessToken, data.refreshToken);
    }
    return data;
  }

  async linkGoogle(credential) {
    return this.request('/auth/link-google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
  }

  async linkApple(identityToken) {
    return this.request('/auth/link-apple', {
      method: 'POST',
      body: JSON.stringify({ identityToken }),
    });
  }

  async forgotPassword(email) {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token, password) {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  }

  async verifyResetToken(token) {
    return this.request(`/auth/verify-reset-token?token=${token}`);
  }

  // Workspaces
  /**
   * Get all workspaces for the current user
   * @returns {Promise<Workspace[]>}
   */
  async getWorkspaces() {
    return this.cachedRequest('/workspaces', 30000);
  }

  async createWorkspace(name) {
    return this.request('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async getWorkspace(id) {
    return this.request(`/workspaces/${id}`);
  }

  async updateWorkspace(id, data) {
    return this.request(`/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteWorkspace(id) {
    return this.request(`/workspaces/${id}`, {
      method: 'DELETE',
    });
  }

  async leaveWorkspace(id) {
    return this.request(`/workspaces/${id}/leave`, {
      method: 'POST',
    });
  }

  async joinWorkspace(inviteCode) {
    return this.request(`/workspaces/join/${inviteCode}`, {
      method: 'POST',
    });
  }

  async getInviteCode(workspaceId) {
    return this.request(`/workspaces/${workspaceId}/invite-code`);
  }

  async regenerateInviteCode(workspaceId, options = {}) {
    return this.request(`/workspaces/${workspaceId}/invite-code`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  async sendInviteEmail(workspaceId, email) {
    return this.request(`/workspaces/${workspaceId}/invite-email`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async removeWorkspaceMember(workspaceId, userId) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  async updateMemberRole(workspaceId, userId, role) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  async adminUpdateMember(workspaceId, userId, data) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async adminResetPassword(workspaceId, userId, newPassword, adminPassword) {
    return this.request(`/workspaces/${workspaceId}/members/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword, adminPassword }),
    });
  }

  async removeMember(workspaceId, userId, postAction, mergeUserId = null) {
    const params = new URLSearchParams({ postAction });
    if (mergeUserId) params.append('mergeUserId', mergeUserId);
    return this.request(`/workspaces/${workspaceId}/members/${userId}?${params}`, {
      method: 'DELETE',
    });
  }

  // Channels
  /**
   * Get all channels for a workspace
   * @param {string} workspaceId
   * @returns {Promise<Channel[]>}
   */
  async getChannels(workspaceId) {
    return this.cachedRequest(`/channels/workspace/${workspaceId}`, 30000);
  }

  async createChannel(workspaceId, data) {
    return this.request(`/channels/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getChannel(channelId) {
    return this.request(`/channels/${channelId}`);
  }

  async updateChannel(channelId, data) {
    return this.request(`/channels/${channelId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteChannel(channelId) {
    return this.request(`/channels/${channelId}`, {
      method: 'DELETE',
    });
  }

  async addChannelMember(channelId, userId) {
    return this.request(`/channels/${channelId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async removeChannelMember(channelId, userId) {
    return this.request(`/channels/${channelId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  async muteChannel(channelId, muted) {
    return this.request(`/channels/${channelId}/mute`, {
      method: 'PUT',
      body: JSON.stringify({ muted }),
    });
  }

  async markChannelRead(channelId) {
    return this.request(`/channels/${channelId}/read`, {
      method: 'POST',
    });
  }

  // Direct Messages
  async getDMs(workspaceId) {
    return this.request(`/channels/workspace/${workspaceId}/dms`);
  }

  async createOrGetDM(workspaceId, userIds) {
    return this.request(`/channels/workspace/${workspaceId}/dm`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  }

  // Channel Groups
  async getChannelGroups(workspaceId) {
    return this.request(`/channel-groups/workspace/${workspaceId}`);
  }

  async createChannelGroup(workspaceId, name) {
    return this.request(`/channel-groups/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async updateChannelGroup(groupId, data) {
    return this.request(`/channel-groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteChannelGroup(groupId) {
    return this.request(`/channel-groups/${groupId}`, {
      method: 'DELETE',
    });
  }

  async moveChannelToGroup(groupId, channelId, position) {
    return this.request(`/channel-groups/${groupId}/channels/${channelId}`, {
      method: 'PUT',
      body: JSON.stringify({ position }),
    });
  }

  async reorderChannelGroups(workspaceId, groupIds) {
    return this.request(`/channel-groups/workspace/${workspaceId}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ groupIds }),
    });
  }

  async removeChannelFromGroup(channelId) {
    return this.request(`/channel-groups/channels/${channelId}`, {
      method: 'DELETE',
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
      body: JSON.stringify({ content, parentId, attachments }),
    });
  }

  async updateMessage(messageId, content) {
    return this.request(`/messages/${messageId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async deleteMessage(messageId) {
    return this.request(`/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  async searchMessages(workspaceId, query, channelId = null, authorId = null) {
    const params = new URLSearchParams({ q: query });
    if (channelId) params.append('channelId', channelId);
    if (authorId) params.append('authorId', authorId);
    return this.request(`/messages/search/${workspaceId}?${params}`);
  }

  async getMessagesTimeline(workspaceId, cursor = null, limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.append('cursor', cursor);
    return this.request(`/messages/timeline/${workspaceId}?${params}`);
  }

  // Reactions
  async addReaction(messageId, emoji) {
    return this.request(`/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  async removeReaction(messageId, emoji) {
    return this.request(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
    });
  }

  async markThreadRead(messageId) {
    return this.request(`/messages/${messageId}/thread-read`, {
      method: 'POST',
    });
  }

  async pinMessage(messageId) {
    return this.request(`/messages/${messageId}/pin`, {
      method: 'POST',
    });
  }

  async unpinMessage(messageId) {
    return this.request(`/messages/${messageId}/pin`, {
      method: 'DELETE',
    });
  }

  async getPinnedMessages(channelId) {
    return this.request(`/messages/channel/${channelId}/pins`);
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

  // Songs
  /**
   * Get all songs for a workspace
   * @param {string} workspaceId
   * @returns {Promise<Song[]>}
   */
  async getSongs(workspaceId) {
    return this.cachedRequest(`/songs/workspace/${workspaceId}`, 60000);
  }

  async createSong(workspaceId, data) {
    return this.request(`/songs/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSong(songId) {
    return this.request(`/songs/${songId}`);
  }

  async updateSong(songId, data) {
    return this.request(`/songs/${songId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSong(songId) {
    return this.request(`/songs/${songId}`, {
      method: 'DELETE',
    });
  }

  async bulkImportSongs(workspaceId, songs, fetchMetadata = true) {
    return this.request(`/songs/workspace/${workspaceId}/bulk`, {
      method: 'POST',
      body: JSON.stringify({ songs, fetchMetadata }),
    });
  }

  async enrichSongs(workspaceId, songIds = null) {
    return this.request(`/songs/workspace/${workspaceId}/enrich`, {
      method: 'POST',
      body: JSON.stringify({ songIds }),
    });
  }

  async getMetadataStatus() {
    return this.request('/songs/metadata-status');
  }

  // Setlists
  /**
   * Get all setlists for a workspace
   * @param {string} workspaceId
   * @returns {Promise<Setlist[]>}
   */
  async getSetlists(workspaceId) {
    return this.cachedRequest(`/setlists/workspace/${workspaceId}`, 60000);
  }

  async createSetlist(workspaceId, data) {
    return this.request(`/setlists/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSetlist(setlistId) {
    return this.request(`/setlists/${setlistId}`);
  }

  async updateSetlist(setlistId, data) {
    return this.request(`/setlists/${setlistId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteSetlist(setlistId) {
    return this.request(`/setlists/${setlistId}`, {
      method: 'DELETE',
    });
  }

  async duplicateSetlist(setlistId, name = null) {
    return this.request(`/setlists/${setlistId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async importSetlist(workspaceId, name, songs, { useShortNames = false, performedAt = null, venue = null, startTime = null } = {}) {
    return this.request(`/setlists/workspace/${workspaceId}/import`, {
      method: 'POST',
      body: JSON.stringify({ name, songs, useShortNames, performedAt, venue, startTime }),
    });
  }

  async importMultiSetlist(workspaceId, baseName, sets, { gigId = null, performedAt = null, venue = null, startTime = null } = {}) {
    return this.request(`/setlists/workspace/${workspaceId}/import-multiset`, {
      method: 'POST',
      body: JSON.stringify({ baseName, sets, gigId, performedAt, venue, startTime }),
    });
  }

  // Gig setlists
  async addSetlistToGig(gigId, setlistId, setNumber = null) {
    return this.request(`/gigs/${gigId}/setlists`, {
      method: 'POST',
      body: JSON.stringify({ setlistId, setNumber }),
    });
  }

  async removeSetlistFromGig(gigId, gigSetlistId) {
    return this.request(`/gigs/${gigId}/setlists/${gigSetlistId}`, {
      method: 'DELETE',
    });
  }

  async reorderGigSetlists(gigId, gigSetlistIds) {
    return this.request(`/gigs/${gigId}/setlists/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ gigSetlistIds }),
    });
  }

  async addSongToSetlist(setlistId, songId) {
    return this.request(`/setlists/${setlistId}/songs`, {
      method: 'POST',
      body: JSON.stringify({ songId }),
    });
  }

  async reorderSetlistItems(setlistId, itemIds) {
    return this.request(`/setlists/${setlistId}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ itemIds }),
    });
  }

  async removeSongFromSetlist(setlistId, songId) {
    return this.request(`/setlists/${setlistId}/songs/${songId}`, {
      method: 'DELETE',
    });
  }

  async addMCToSetlist(setlistId, duration = 60, label = 'MC') {
    return this.request(`/setlists/${setlistId}/mc`, {
      method: 'POST',
      body: JSON.stringify({ duration, label }),
    });
  }

  async addSetBreakToSetlist(setlistId, label = 'Set Break', duration = 900) {
    return this.request(`/setlists/${setlistId}/set-break`, {
      method: 'POST',
      body: JSON.stringify({ label, duration }),
    });
  }

  async updateSetlistItem(setlistId, itemId, data) {
    return this.request(`/setlists/${setlistId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async removeSetlistItem(setlistId, itemId) {
    return this.request(`/setlists/${setlistId}/items/${itemId}`, {
      method: 'DELETE',
    });
  }

  async getSetlistPerformers(setlistId) {
    return this.request(`/setlists/${setlistId}/performers`);
  }

  async updateSetlistPerformers(setlistId, bandMemberIds) {
    return this.request(`/setlists/${setlistId}/performers`, {
      method: 'PUT',
      body: JSON.stringify({ bandMemberIds }),
    });
  }

  // Gigs
  /**
   * Get gigs for a workspace with optional filters
   * @param {string} workspaceId
   * @param {Object} [filters]
   * @param {string} [filters.type]
   * @param {string} [filters.status]
   * @param {string} [filters.from]
   * @param {string} [filters.to]
   * @returns {Promise<Gig[]>}
   */
  async getGigs(workspaceId, filters = {}) {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    if (filters.status) params.append('status', filters.status);
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);
    const query = params.toString();
    return this.cachedRequest(`/gigs/workspace/${workspaceId}${query ? `?${query}` : ''}`, 60000);
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

  async createGig(workspaceId, data) {
    return this.request(`/gigs/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getGig(gigId) {
    return this.request(`/gigs/${gigId}`);
  }

  async updateGig(gigId, data) {
    return this.request(`/gigs/${gigId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteGig(gigId) {
    return this.request(`/gigs/${gigId}`, {
      method: 'DELETE',
    });
  }

  async duplicateGig(gigId, date = null, title = null) {
    return this.request(`/gigs/${gigId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ date, title }),
    });
  }

  async completeGig(gigId, songIds = []) {
    return this.request(`/gigs/${gigId}/complete`, {
      method: 'PUT',
      body: JSON.stringify({ songIds }),
    });
  }

  async getGigStats(workspaceId) {
    return this.request(`/gigs/workspace/${workspaceId}/stats`);
  }

  async autoLinkSetlists(workspaceId) {
    return this.request(`/gigs/workspace/${workspaceId}/auto-link-setlists`, {
      method: 'POST',
    });
  }

  // Gig Media
  async addGigMedia(gigId, data) {
    return this.request(`/gigs/${gigId}/media`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getGigMedia(gigId) {
    return this.request(`/gigs/${gigId}/media`);
  }

  async deleteGigMedia(gigId, mediaId) {
    return this.request(`/gigs/${gigId}/media/${mediaId}`, {
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
  /**
   * Get all band members for a workspace
   * @param {string} workspaceId
   * @returns {Promise<BandMember[]>}
   */
  async getBandMembers(workspaceId) {
    return this.cachedRequest(`/band-members/workspace/${workspaceId}`, 60000);
  }

  async createBandMember(workspaceId, data) {
    return this.request(`/band-members/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBandMember(memberId, data) {
    return this.request(`/band-members/${memberId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteBandMember(memberId) {
    return this.request(`/band-members/${memberId}`, {
      method: 'DELETE',
    });
  }

  // Availability
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
      body: JSON.stringify({ status, note }),
    });
  }

  async setBulkAvailability(workspaceId, dates, status, note = null) {
    return this.request(`/availability/workspace/${workspaceId}/bulk`, {
      method: 'PUT',
      body: JSON.stringify({ dates, status, note }),
    });
  }

  async clearAvailability(workspaceId, date) {
    return this.request(`/availability/workspace/${workspaceId}/date/${date}`, {
      method: 'DELETE',
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
      body: JSON.stringify(data),
    });
  }

  async deleteSongAttachment(songId, attachmentId) {
    return this.request(`/songs/${songId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });
  }

  // Contacts
  async getContacts(workspaceId, category = null) {
    const params = category ? `?category=${category}` : '';
    return this.cachedRequest(`/contacts/workspace/${workspaceId}${params}`, 60000);
  }

  async createContact(workspaceId, data) {
    return this.request(`/contacts/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getContact(contactId) {
    return this.request(`/contacts/${contactId}`);
  }

  async updateContact(contactId, data) {
    return this.request(`/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteContact(contactId) {
    return this.request(`/contacts/${contactId}`, {
      method: 'DELETE',
    });
  }

  // Announcements
  async getAnnouncements(workspaceId, pinnedOnly = false) {
    const params = pinnedOnly ? '?pinnedOnly=true' : '';
    return this.cachedRequest(`/announcements/workspace/${workspaceId}${params}`, 60000);
  }

  async createAnnouncement(workspaceId, data) {
    return this.request(`/announcements/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAnnouncement(announcementId) {
    return this.request(`/announcements/${announcementId}`);
  }

  async updateAnnouncement(announcementId, data) {
    return this.request(`/announcements/${announcementId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async acknowledgeAnnouncement(announcementId) {
    return this.request(`/announcements/${announcementId}/acknowledge`, {
      method: 'POST',
    });
  }

  async deleteAnnouncement(announcementId) {
    return this.request(`/announcements/${announcementId}`, {
      method: 'DELETE',
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
      body: JSON.stringify(data),
    });
  }

  async getPoll(pollId) {
    return this.request(`/polls/${pollId}`);
  }

  async votePoll(pollId, optionIds) {
    return this.request(`/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionIds }),
    });
  }

  async closePoll(pollId) {
    return this.request(`/polls/${pollId}/close`, {
      method: 'POST',
    });
  }

  async deletePoll(pollId) {
    return this.request(`/polls/${pollId}`, {
      method: 'DELETE',
    });
  }

  // Medleys
  async getMedleys(workspaceId) {
    return this.cachedRequest(`/medleys/workspace/${workspaceId}`, 60000);
  }

  async createMedley(workspaceId, data) {
    return this.request(`/medleys/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getMedley(medleyId) {
    return this.request(`/medleys/${medleyId}`);
  }

  async updateMedley(medleyId, data) {
    return this.request(`/medleys/${medleyId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async reorderMedley(medleyId, songIds) {
    return this.request(`/medleys/${medleyId}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ songIds }),
    });
  }

  async deleteMedley(medleyId) {
    return this.request(`/medleys/${medleyId}`, {
      method: 'DELETE',
    });
  }

  // Timeline
  async getTimeline(workspaceId) {
    return this.request(`/timeline/workspace/${workspaceId}`);
  }

  async createTimelineEvent(workspaceId, data) {
    return this.request(`/timeline/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTimelineEvent(eventId, data) {
    return this.request(`/timeline/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTimelineEvent(eventId) {
    return this.request(`/timeline/${eventId}`, {
      method: 'DELETE',
    });
  }

  async generateTimeline(workspaceId) {
    return this.request(`/timeline/workspace/${workspaceId}/generate`, {
      method: 'POST',
    });
  }

  async regenerateTimeline(workspaceId) {
    return this.request(`/timeline/workspace/${workspaceId}/regenerate`, {
      method: 'POST',
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
      method: 'POST',
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

  async createRecording(workspaceId, data) {
    return this.request(`/recordings/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRecording(recordingId, data) {
    return this.request(`/recordings/${recordingId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteRecording(recordingId) {
    return this.request(`/recordings/${recordingId}`, {
      method: 'DELETE',
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
      body: JSON.stringify({ songIds }),
    });
  }

  // Notification Snooze
  async getNotificationSnoozeStatus() {
    return this.request('/push/snooze-status');
  }

  async setNotificationSnooze(duration) {
    return this.request('/push/snooze', {
      method: 'POST',
      body: JSON.stringify({ duration }),
    });
  }

  // Notification Preferences
  async getNotificationPreferences(workspaceId) {
    return this.request(`/push/preferences/${workspaceId}`);
  }

  async updateNotificationPreferences(workspaceId, prefs) {
    return this.request(`/push/preferences/${workspaceId}`, {
      method: 'PUT',
      body: JSON.stringify(prefs),
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
      body: JSON.stringify(data),
    });
  }

  async createKittyTransaction(workspaceId, data) {
    return this.request(`/kitty/workspace/${workspaceId}/transactions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateKittyTransaction(transactionId, data) {
    return this.request(`/kitty/transactions/${transactionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteKittyTransaction(transactionId) {
    return this.request(`/kitty/transactions/${transactionId}`, {
      method: 'DELETE',
    });
  }

  // Practice
  async logPractice(workspaceId, data) {
    return this.request(`/practice/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
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

  // File uploads
  async uploadFile(uri, filename, mimeType, workspaceId) {
    await this.ensureFreshToken();
    const formData = new FormData();
    formData.append('file', { uri, name: filename, type: mimeType });
    if (workspaceId) formData.append('workspaceId', workspaceId);

    const url = `${API_URL}/uploads`;
    const headers = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: formData,
    }, UPLOAD_TIMEOUT);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }

    return response.json();
  }

  async uploadFileWithProgress(uri, filename, mimeType, onProgress, workspaceId) {
    await this.ensureFreshToken();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', { uri, name: filename, type: mimeType });
      if (workspaceId) formData.append('workspaceId', workspaceId);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(event.loaded / event.total);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('Invalid response'));
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data.error || 'Upload failed'));
          } catch {
            reject(new Error('Upload failed'));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.ontimeout = () => reject(new Error('Upload timed out'));

      xhr.open('POST', `${API_URL}/uploads`);
      xhr.timeout = UPLOAD_TIMEOUT;
      if (this.accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.accessToken}`);
      }
      xhr.send(formData);
    });
  }

  async uploadFiles(files, workspaceId) {
    await this.ensureFreshToken();
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', { uri: file.uri, name: file.filename, type: file.mimeType });
    });
    if (workspaceId) formData.append('workspaceId', workspaceId);

    const url = `${API_URL}/uploads/multiple`;
    const headers = {};
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: formData,
    }, UPLOAD_TIMEOUT);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }

    return response.json();
  }

  // Account Management
  async deleteAccount(password) {
    return this.request('/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password })
    });
  }

  async exportUserData() {
    await this.ensureFreshToken();
    const url = `${API_URL}/auth/export`;
    const headers = { Authorization: `Bearer ${this.accessToken}` };
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Export failed');
    }
    return response.json();
  }

  async exportWorkspaceData(workspaceId) {
    await this.ensureFreshToken();
    const url = `${API_URL}/workspaces/${workspaceId}/export`;
    const headers = { Authorization: `Bearer ${this.accessToken}` };
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Export failed');
    }
    return response.json();
  }

  // Content Reporting & User Blocking
  async reportMessage(messageId, reason) {
    return this.request('/reports', {
      method: 'POST',
      body: JSON.stringify({ messageId, reason }),
    });
  }

  async blockUser(blockedUserId) {
    return this.request('/blocks', {
      method: 'POST',
      body: JSON.stringify({ blockedUserId }),
    });
  }

  async unblockUser(blockedUserId) {
    return this.request(`/blocks/${blockedUserId}`, {
      method: 'DELETE',
    });
  }

  async getBlockedUsers() {
    return this.request('/blocks');
  }

  // Subscriptions
  async getWorkspacePlan(workspaceId) {
    return this.request(`/subscriptions/${workspaceId}/plan`);
  }

  async activatePurchase(workspaceId) {
    return this.request(`/subscriptions/${workspaceId}/activate`, {
      method: 'POST',
    });
  }

  // Stage Plots
  async getStagePlots(workspaceId) {
    return this.request(`/stage-plots/workspace/${workspaceId}`);
  }

  async getStagePlot(stagePlotId) {
    return this.request(`/stage-plots/${stagePlotId}`);
  }

  async createStagePlot(workspaceId, data) {
    return this.request(`/stage-plots/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateStagePlot(stagePlotId, data) {
    return this.request(`/stage-plots/${stagePlotId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteStagePlot(stagePlotId) {
    return this.request(`/stage-plots/${stagePlotId}`, {
      method: 'DELETE',
    });
  }

  async duplicateStagePlot(stagePlotId) {
    return this.request(`/stage-plots/${stagePlotId}/duplicate`, {
      method: 'POST',
    });
  }
}

export const api = new ApiService();
export default api;
