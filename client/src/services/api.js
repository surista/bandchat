const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class ApiService {
  constructor() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
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

      // Handle token expiration
      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await fetch(url, { ...options, headers });
          return this.handleResponse(retryResponse);
        }
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

  async regenerateInviteCode(workspaceId) {
    return this.request(`/workspaces/${workspaceId}/invite-code`, {
      method: 'POST'
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
}

export const api = new ApiService();
export default api;
