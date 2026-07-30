// BandChat Admin Dashboard JavaScript

// State
let token = null;
let currentUser = null;
let refreshTimer = null;
let tokenRefreshTimer = null;
let userSearchTimer = null;
let workspaceSearchTimer = null;
let cachedUsers = [];
let restoreKey = null;

// API helper
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (res.status === 401) { handleLogout(); throw new Error('Unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Token refresh (access token expires in 15min, refresh every 12min)
async function refreshAccessToken() {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (data.accessToken) {
      token = data.accessToken;
    } else {
      handleLogout();
    }
  } catch {
    handleLogout();
  }
}

// Format helpers
function fmt(n) { return (n || 0).toLocaleString(); }
function fmtDate(d) { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }

// XSS protection.
//
// Must be safe in BOTH text and attribute contexts, because it's used for
// things like data-ws-name="${esc(w.name)}". A text node's innerHTML
// serialization escapes &, < and > but NOT quotes, so on its own it would let
// a workspace named `" onmouseover="…` break out of the attribute it sits in
// (workspace names are only length-validated server-side). The explicit quote
// replacements close that. The page CSP is `script-src 'self'` with no
// 'unsafe-inline', so injected handlers wouldn't execute today either — this
// is the layer that shouldn't depend on that.
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Format bytes to human-readable
function fmtBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

// Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  btn.disabled = true;
  errorEl.textContent = '';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `Login failed (${res.status})`);
    if (!data.accessToken) throw new Error('No token received');

    token = data.accessToken;
    currentUser = data.user;

    // Verify system admin access
    await api('/admin/stats');
    showDashboard();
  } catch (err) {
    if (err.message === 'Unauthorized' || err.message === 'System admin access required') {
      errorEl.textContent = 'Access denied. System admin required.';
    } else {
      errorEl.textContent = err.message || 'Login failed';
    }
    token = null;
    currentUser = null;
  } finally {
    btn.disabled = false;
  }
});

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('adminName').textContent = currentUser?.displayName || '';
  loadStats();
  refreshTimer = setInterval(loadStats, 60000);
  tokenRefreshTimer = setInterval(refreshAccessToken, 12 * 60 * 1000);
}

function handleLogout() {
  token = null;
  currentUser = null;
  cachedUsers = [];
  if (refreshTimer) clearInterval(refreshTimer);
  if (tokenRefreshTimer) clearInterval(tokenRefreshTimer);
  document.getElementById('loginScreen').style.display = '';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
}

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'users') loadUsers();
    if (tab.dataset.tab === 'workspaces') loadWorkspaces();
    if (tab.dataset.tab === 'storage') loadStorageStats();
    if (tab.dataset.tab === 'backups') { loadBackups(); loadWorkspaceSelector(); }
    if (tab.dataset.tab === 'deleted') loadDeleted();
    if (tab.dataset.tab === 'audit') { loadAuditStats(); loadAuditLog(); }
  });
});

// Overview Stats
async function loadStats() {
  try {
    const s = await api('/admin/stats');
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Users</div>
        <div class="stat-value">${fmt(s.users.total)}</div>
        <div class="stat-sub"><span>+${fmt(s.users.last7d)}</span> last 7d &middot; <span>+${fmt(s.users.last30d)}</span> last 30d</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Workspaces</div>
        <div class="stat-value">${fmt(s.workspaces.total)}</div>
        <div class="stat-sub"><span>+${fmt(s.workspaces.last7d)}</span> last 7d &middot; <span>+${fmt(s.workspaces.last30d)}</span> last 30d</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Messages</div>
        <div class="stat-value">${fmt(s.messages.total)}</div>
        <div class="stat-sub"><span>+${fmt(s.messages.last7d)}</span> last 7d &middot; <span>+${fmt(s.messages.last30d)}</span> last 30d</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Users (7d)</div>
        <div class="stat-value">${fmt(s.activeUsers7d)}</div>
        <div class="stat-sub">Users with recent sessions</div>
      </div>
    `;
    const providers = Object.entries(s.authProviders).map(([k,v]) => `${esc(k)}: ${v}`).join(', ');
    document.getElementById('statsGridSecondary').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Songs</div>
        <div class="stat-value">${fmt(s.songs)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Setlists</div>
        <div class="stat-value">${fmt(s.setlists)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Gigs</div>
        <div class="stat-value">${fmt(s.gigs)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Auth Providers</div>
        <div class="stat-value" style="font-size:16px">${providers || 'N/A'}</div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// Users — event delegation instead of inline onclick (XSS-safe)
async function loadUsers(search) {
  try {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    const data = await api(`/admin/users${q}`);
    cachedUsers = data.users;
    const tbody = document.getElementById('usersTable');

    if (cachedUsers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No users found</td></tr>';
      return;
    }

    tbody.innerHTML = cachedUsers.map(u => `
      <tr style="cursor:pointer" data-user-id="${esc(u.id)}">
        <td>
          <strong>${esc(u.displayName)}</strong>
          ${u.isSystemAdmin ? '<span class="badge badge-admin">SYSTEM ADMIN</span>' : ''}
        </td>
        <td>${esc(u.email)}</td>
        <td>
          <span class="badge badge-${esc(u.authProvider)}">${esc(u.authProvider)}</span>
          ${u.emailVerified ? '<span class="badge badge-verified">verified</span>' : ''}
        </td>
        <td>${u._count.workspaces}</td>
        <td>${fmtDate(u.createdAt)}</td>
        <td>
          <button class="toggle-btn" data-toggle-id="${esc(u.id)}">
            ${u.isSystemAdmin ? 'Revoke Admin' : 'Grant Admin'}
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

// Event delegation for user table clicks
document.getElementById('usersTable').addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('[data-toggle-id]');
  if (toggleBtn) {
    e.stopPropagation();
    const userId = toggleBtn.dataset.toggleId;
    const user = cachedUsers.find(u => u.id === userId);
    if (user) toggleAdmin(userId, user.displayName, user.isSystemAdmin);
    return;
  }
  const row = e.target.closest('[data-user-id]');
  if (row) showUserDetail(row.dataset.userId);
});

document.getElementById('userSearch').addEventListener('input', (e) => {
  clearTimeout(userSearchTimer);
  userSearchTimer = setTimeout(() => loadUsers(e.target.value), 300);
});

// User detail modal
async function showUserDetail(userId) {
  try {
    const u = await api(`/admin/users/${userId}`);
    document.getElementById('modalUserName').textContent = u.displayName;

    let html = `
      <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${esc(u.email)}</span></div>
      <div class="detail-row"><span class="detail-label">Provider</span><span class="detail-value">${esc(u.authProvider)}</span></div>
      <div class="detail-row"><span class="detail-label">Verified</span><span class="detail-value">${u.emailVerified ? 'Yes' : 'No'}</span></div>
      <div class="detail-row"><span class="detail-label">System Admin</span><span class="detail-value">${u.isSystemAdmin ? 'Yes' : 'No'}</span></div>
      <div class="detail-row"><span class="detail-label">Joined</span><span class="detail-value">${fmtDate(u.createdAt)}</span></div>
      <div class="detail-row"><span class="detail-label">Messages Created</span><span class="detail-value">${fmt(u._count.messages)}</span></div>
      <div class="detail-row"><span class="detail-label">Songs Created</span><span class="detail-value">${fmt(u._count.songs)}</span></div>
      <div class="detail-row"><span class="detail-label">Gigs Created</span><span class="detail-value">${fmt(u._count.gigs)}</span></div>
    `;

    if (u.bio) {
      html += `<div class="detail-row"><span class="detail-label">Bio</span><span class="detail-value">${esc(u.bio)}</span></div>`;
    }

    if (u.workspaces?.length) {
      html += '<div class="detail-section"><h4>Workspaces</h4>';
      u.workspaces.forEach(wm => {
        html += `<div class="detail-row">
          <span class="detail-value">${esc(wm.workspace.name)}</span>
          <span class="badge badge-${wm.role === 'ADMIN' ? 'admin' : 'local'}">${esc(wm.role)}</span>
        </div>`;
      });
      html += '</div>';
    }

    document.getElementById('modalUserContent').innerHTML = html;
    document.getElementById('userModal').classList.add('open');
  } catch (err) {
    console.error('Failed to load user detail:', err);
  }
}

function closeUserModal() {
  document.getElementById('userModal').classList.remove('open');
}

document.getElementById('userModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeUserModal();
});

// Toggle admin
async function toggleAdmin(userId, displayName, currentStatus) {
  const action = currentStatus ? 'revoke system admin from' : 'grant system admin to';
  if (!confirm(`Are you sure you want to ${action} ${displayName}?`)) return;

  try {
    await api(`/admin/users/${userId}/toggle-admin`, { method: 'POST' });
    loadUsers(document.getElementById('userSearch').value);
  } catch (err) {
    alert(err.message || 'Failed to update admin status');
  }
}

// Workspaces
async function loadWorkspaces(search) {
  try {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    const data = await api(`/admin/workspaces${q}`);
    const workspaces = data.workspaces;
    const tbody = document.getElementById('workspacesTable');

    if (workspaces.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No workspaces found</td></tr>';
      return;
    }

    tbody.innerHTML = workspaces.map(w => {
      const isPro = w.plan === 'PRO';
      const planBadge = isPro
        ? '<span style="background:#22c55e;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600">PRO</span>'
        : '<span style="background:#6b7280;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600">FREE</span>';
      const planBtn = isPro
        ? `<button class="btn btn-sm" style="background:#6b7280" data-toggle-plan="${w.id}" data-ws-name="${esc(w.name)}">Revoke PRO</button>`
        : `<button class="btn btn-sm" style="background:#22c55e" data-toggle-plan="${w.id}" data-ws-name="${esc(w.name)}">Grant PRO</button>`;
      const ownerInfo = w.owner ? `<div style="font-size:12px;color:#9ca3af;margin-top:2px">Admin: ${esc(w.owner.displayName)}${w.owner.email ? ` (${esc(w.owner.email)})` : ''}</div>` : '';
      const slugInfo = w.slug ? `<div style="font-size:11px;color:#6b7280;margin-top:1px">${esc(w.slug)}</div>` : '';
      const shortId = w.id.substring(0, 8);
      return `
      <tr>
        <td>
          <strong>${esc(w.name)}</strong> ${planBadge}
          ${ownerInfo}
          ${slugInfo}
          <div style="font-size:11px;color:#6b7280;margin-top:1px;cursor:pointer" title="Click to copy full ID" data-copy-id="${esc(w.id)}">${esc(shortId)}...</div>
        </td>
        <td>${w._count.members}</td>
        <td>${w._count.channels}</td>
        <td>${fmt(w.messageCount)}</td>
        <td>${fmtBytes(Number(w.storageUsedBytes || 0))}</td>
        <td>${fmtDate(w.createdAt)}</td>
        <td>${planBtn} <button class="btn btn-danger btn-sm" data-delete-ws="${w.id}" data-ws-name="${esc(w.name)}">Delete</button></td>
      </tr>
    `;
    }).join('');
  } catch (err) {
    console.error('Failed to load workspaces:', err);
  }
}

document.getElementById('workspaceSearch').addEventListener('input', (e) => {
  clearTimeout(workspaceSearchTimer);
  workspaceSearchTimer = setTimeout(() => loadWorkspaces(e.target.value), 300);
});

// Event delegation for workspace buttons (plan toggle + delete)
document.getElementById('workspacesTable').addEventListener('click', async (e) => {
  // Copy-full-ID. This was an inline onclick, which the page CSP
  // (`script-src 'self'`, no 'unsafe-inline') silently blocked — the control
  // looked clickable but never fired. Delegated like every other action here.
  const copyEl = e.target.closest('[data-copy-id]');
  if (copyEl) {
    const fullId = copyEl.dataset.copyId;
    try {
      await navigator.clipboard.writeText(fullId);
      const original = copyEl.textContent;
      copyEl.textContent = 'Copied!';
      setTimeout(() => { copyEl.textContent = original; }, 1500);
    } catch {
      alert(fullId);
    }
    return;
  }

  const planBtn = e.target.closest('[data-toggle-plan]');
  if (planBtn) {
    const name = planBtn.dataset.wsName;
    const action = planBtn.textContent.trim();
    if (!confirm(`${action} for "${name}"?`)) return;
    try {
      const result = await api(`/admin/workspaces/${planBtn.dataset.togglePlan}/plan`, { method: 'POST' });
      loadWorkspaces();
    } catch (err) {
      alert('Failed to update plan: ' + err.message);
    }
    return;
  }

  const deleteBtn = e.target.closest('[data-delete-ws]');
  if (deleteBtn) {
    const name = deleteBtn.dataset.wsName;
    if (!confirm(`Soft-delete workspace "${name}"? It will be recoverable for 30 days.`)) return;
    try {
      const result = await api(`/admin/workspaces/${deleteBtn.dataset.deleteWs}`, { method: 'DELETE' });
      alert(result.message);
      loadWorkspaces();
      loadDeleted();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }
});

// Storage tab
async function loadStorageStats() {
  try {
    const data = await api('/admin/storage/stats');
    const total = Number(data.totalTrackedBytes || 0);
    const grid = document.getElementById('storageStatsGrid');
    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Tracked Storage</div>
        <div class="stat-value">${fmtBytes(total)}</div>
        <div class="stat-sub">Across ${data.workspaces.length} workspaces</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">R2 Status</div>
        <div class="stat-value" style="font-size:24px">${data.r2Available ? 'Connected' : 'Not Configured'}</div>
        <div class="stat-sub" style="color:${data.r2Available ? 'var(--green)' : 'var(--yellow)'}">
          ${data.r2Available ? 'Cloudflare R2 active' : 'Set R2 env vars to enable'}
        </div>
      </div>
    `;

    const tbody = document.getElementById('storageWorkspaceTable');
    tbody.innerHTML = data.workspaces.map(w => `
      <tr>
        <td><strong>${esc(w.name)}</strong></td>
        <td>${fmtBytes(Number(w.storageUsedBytes || 0))}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load storage stats:', err);
  }
}

// Orphan scan
document.getElementById('scanOrphansBtn').addEventListener('click', async () => {
  const status = document.getElementById('orphanStatus');
  status.textContent = 'Scanning...';
  try {
    const data = await api('/admin/storage/orphans');
    status.textContent = `Found ${data.orphanCount} orphans (${fmtBytes(data.orphanBytes)}) out of ${data.totalR2Objects} R2 objects. ${data.knownUrlCount} URLs tracked in DB.`;
    if (data.orphanCount > 0) {
      document.getElementById('cleanupDryBtn').style.display = '';
      document.getElementById('cleanupBtn').style.display = '';
      document.getElementById('orphanResults').innerHTML = data.orphans.map(o =>
        `<div style="font-size:12px;color:var(--text-secondary)">${esc(o.key)} (${fmtBytes(o.size)})</div>`
      ).join('');
    }
  } catch (err) {
    status.textContent = 'Scan failed: ' + (err.message || 'R2 not configured');
  }
});

// Dry run cleanup
document.getElementById('cleanupDryBtn').addEventListener('click', async () => {
  try {
    const data = await api('/admin/storage/cleanup', { method: 'POST', body: JSON.stringify({ dryRun: true }) });
    document.getElementById('orphanStatus').textContent =
      `Dry run: would delete ${data.wouldDelete} files, freeing ${fmtBytes(data.wouldFreeBytes)}`;
  } catch (err) {
    document.getElementById('orphanStatus').textContent = 'Dry run failed: ' + err.message;
  }
});

// Actual cleanup
document.getElementById('cleanupBtn').addEventListener('click', async () => {
  if (!confirm('Delete all orphaned R2 files? This cannot be undone.')) return;
  try {
    const data = await api('/admin/storage/cleanup', { method: 'POST', body: JSON.stringify({ dryRun: false }) });
    document.getElementById('orphanStatus').textContent =
      `Deleted ${data.deleted} files, freed ${fmtBytes(data.freedBytes)}`;
    document.getElementById('cleanupDryBtn').style.display = 'none';
    document.getElementById('cleanupBtn').style.display = 'none';
    document.getElementById('orphanResults').innerHTML = '';
  } catch (err) {
    document.getElementById('orphanStatus').textContent = 'Cleanup failed: ' + err.message;
  }
});

// Recalculate storage
document.getElementById('recalcBtn').addEventListener('click', async () => {
  const status = document.getElementById('recalcStatus');
  status.textContent = 'Recalculating...';
  try {
    const data = await api('/admin/storage/recalculate', { method: 'POST' });
    status.textContent = `Recalculated ${data.recalculated} workspaces`;
    loadStorageStats();
  } catch (err) {
    status.textContent = 'Failed: ' + err.message;
  }
});

// Backups tab
async function loadBackups() {
  const tbody = document.getElementById('backupsTable');
  tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading...</td></tr>';
  try {
    const data = await api('/admin/backups');
    if (!data.r2Available) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">R2 storage not configured. Backups require Cloudflare R2.</td></tr>';
      document.getElementById('backupNowBtn').disabled = true;
      return;
    }
    if (data.backups.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No backups yet</td></tr>';
      return;
    }
    tbody.innerHTML = data.backups.map(b => {
      const filename = b.key.replace('backups/', '');
      return `<tr>
        <td>${fmtDate(b.lastModified)}</td>
        <td>${fmtBytes(b.size)}</td>
        <td>gzip</td>
        <td>
          <button class="btn-sm" data-download="${esc(filename)}">Download</button>
          <button class="btn-restore" data-restore-key="${esc(b.key)}">Restore</button>
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Failed to load backups: ${esc(err.message)}</td></tr>`;
  }
}

// Event delegation for backup downloads (needs auth header)
document.getElementById('backupsTable').addEventListener('click', async (e) => {
  const downloadBtn = e.target.closest('[data-download]');
  if (downloadBtn) {
    const filename = downloadBtn.dataset.download;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading...';
    try {
      const res = await fetch(`/api/admin/backups/download/${encodeURIComponent(filename)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Download failed: ' + err.message);
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Download';
    }
    return;
  }

  const restoreBtn = e.target.closest('[data-restore-key]');
  if (restoreBtn) {
    e.stopPropagation();
    openRestoreModal(restoreBtn.dataset.restoreKey);
  }
});

// Backup Now button
document.getElementById('backupNowBtn').addEventListener('click', async () => {
  const btn = document.getElementById('backupNowBtn');
  const progress = document.getElementById('backupProgress');
  btn.disabled = true;
  progress.style.display = 'block';
  try {
    await api('/admin/backups', { method: 'POST' });
    progress.style.display = 'none';
    btn.disabled = false;
    loadBackups();
  } catch (err) {
    progress.textContent = 'Backup failed: ' + (err.message || 'Unknown error');
    btn.disabled = false;
  }
});

// ==========================================
// Workspace Backups
// ==========================================

let wsRestoreKey = null;

async function loadWorkspaceSelector() {
  const selector = document.getElementById('wsBackupSelector');
  try {
    const data = await api('/admin/workspaces');
    const workspaces = data.workspaces || [];
    selector.innerHTML = '<option value="">Select workspace...</option>' +
      workspaces.map(w => {
        const members = w._count?.members ?? '?';
        const msgs = w._count?.channels ?? '?';
        const created = fmtDate(w.createdAt);
        return `<option value="${esc(w.id)}">${esc(w.name)} — ${members} members · Created ${created}</option>`;
      }).join('');
  } catch (err) {
    console.error('Failed to load workspaces for backup selector:', err);
  }
}

async function loadWorkspaceBackups(workspaceId) {
  const tbody = document.getElementById('wsBackupsTable');
  if (!workspaceId) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Select a workspace to view backups</td></tr>';
    return;
  }
  tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading...</td></tr>';
  try {
    const data = await api(`/admin/workspaces/${workspaceId}/backups`);
    if (!data.backups?.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No backups for this workspace</td></tr>';
      return;
    }
    tbody.innerHTML = data.backups.map(b => {
      const parts = b.key.split('/');
      const filename = parts[parts.length - 1];
      const wsId = parts[2]; // backups/workspace/{wsId}/filename
      return `<tr>
        <td>${fmtDate(b.lastModified)}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${esc(wsId.substring(0, 8))}...</td>
        <td>${fmtBytes(b.size)}</td>
        <td>
          <button class="btn-sm" data-ws-download="${esc(wsId)}/${esc(filename)}">Download</button>
          <button class="btn-restore" data-ws-restore-key="${esc(b.key)}">Restore</button>
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Failed: ${esc(err.message)}</td></tr>`;
  }
}

document.getElementById('wsBackupSelector').addEventListener('change', (e) => {
  const wsId = e.target.value;
  document.getElementById('wsBackupNowBtn').disabled = !wsId;
  loadWorkspaceBackups(wsId);
});

document.getElementById('wsBackupNowBtn').addEventListener('click', async () => {
  const wsId = document.getElementById('wsBackupSelector').value;
  if (!wsId) return;
  const btn = document.getElementById('wsBackupNowBtn');
  const progress = document.getElementById('wsBackupProgress');
  btn.disabled = true;
  progress.style.display = 'block';
  try {
    await api(`/admin/workspaces/${wsId}/backup`, { method: 'POST' });
    progress.style.display = 'none';
    btn.disabled = false;
    loadWorkspaceBackups(wsId);
  } catch (err) {
    progress.textContent = 'Backup failed: ' + (err.message || 'Unknown error');
    btn.disabled = false;
  }
});

// Event delegation for workspace backup table
document.getElementById('wsBackupsTable').addEventListener('click', async (e) => {
  const downloadBtn = e.target.closest('[data-ws-download]');
  if (downloadBtn) {
    const pathParts = downloadBtn.dataset.wsDownload;
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Downloading...';
    try {
      const res = await fetch(`/api/admin/workspace-backups/download/${encodeURIComponent(pathParts.split('/')[0])}/${encodeURIComponent(pathParts.split('/')[1])}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pathParts.split('/')[1];
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Download failed: ' + err.message);
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Download';
    }
    return;
  }

  const restoreBtn = e.target.closest('[data-ws-restore-key]');
  if (restoreBtn) {
    openWsRestoreModal(restoreBtn.dataset.wsRestoreKey);
  }
});

async function openWsRestoreModal(key) {
  wsRestoreKey = key;
  const modal = document.getElementById('wsRestoreModal');
  const content = document.getElementById('wsRestoreModalContent');
  content.innerHTML = '<div class="restore-progress"><div class="spinner"></div><p>Loading backup preview...</p></div>';
  modal.classList.add('open');

  try {
    const preview = await api('/admin/workspace-backups/preview', {
      method: 'POST',
      body: JSON.stringify({ key })
    });

    const stats = preview.stats || {};
    const statItems = Object.entries(stats)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `<div class="restore-stat"><div class="restore-stat-value">${fmt(v)}</div><div class="restore-stat-label">${esc(k)}</div></div>`)
      .join('');

    content.innerHTML = `
      <p style="color:var(--text-secondary);font-size:14px;margin-bottom:4px">
        Workspace: <strong>${esc(preview.workspaceName)}</strong>
      </p>
      <p style="color:var(--text-secondary);font-size:14px;margin-bottom:8px">
        Backup from <strong>${esc(preview.createdAt ? fmtDate(preview.createdAt) : 'unknown')}</strong> · ${preview.userStubCount || 0} user references
      </p>
      <div class="restore-stats">${statItems}</div>
      <div class="restore-warning">
        <strong>Warning:</strong> This will replace ALL data for this workspace with the backup data.
        Other workspaces will NOT be affected. Users who no longer exist will have their references anonymized.<br><br>
        No safety backup is created — use "Backup Now" first if needed.
      </div>
      <label style="display:block;font-size:13px;color:var(--text-secondary);margin-top:16px">
        Type <strong>RESTORE WORKSPACE</strong> to confirm:
      </label>
      <input class="confirm-input" id="wsRestoreConfirmInput" placeholder="RESTORE WORKSPACE" autocomplete="off" spellcheck="false">
      <button class="btn-danger" id="wsRestoreExecuteBtn" disabled>Restore Workspace</button>
    `;

    document.getElementById('wsRestoreConfirmInput').addEventListener('input', (e) => {
      document.getElementById('wsRestoreExecuteBtn').disabled = e.target.value !== 'RESTORE WORKSPACE';
    });

    document.getElementById('wsRestoreExecuteBtn').addEventListener('click', executeWsRestore);
  } catch (err) {
    content.innerHTML = `<p style="color:var(--red)">Failed to load preview: ${esc(err.message)}</p>`;
  }
}

async function executeWsRestore() {
  const content = document.getElementById('wsRestoreModalContent');
  content.innerHTML = `
    <div class="restore-progress">
      <div class="spinner"></div>
      <p>Restoring workspace data...</p>
      <p style="font-size:12px;color:var(--text-secondary);margin-top:8px">This may take a minute. Do not close this page.</p>
    </div>
  `;

  try {
    const result = await api('/admin/workspace-backups/restore', {
      method: 'POST',
      body: JSON.stringify({ key: wsRestoreKey, confirmPhrase: 'RESTORE WORKSPACE' })
    });

    content.innerHTML = `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:40px;margin-bottom:12px">✅</div>
        <h3 style="color:var(--green);margin-bottom:8px">Workspace Restored Successfully</h3>
        <p style="color:var(--text-secondary);font-size:14px">
          ${fmt(result.resolvedUsers)} users resolved, ${fmt(result.missingUsers)} missing (anonymized)
        </p>
        <button class="btn-sm" style="margin-top:16px" id="closeWsRestoreSuccessBtn">Close</button>
      </div>
    `;

    document.getElementById('closeWsRestoreSuccessBtn').addEventListener('click', closeWsRestoreModal);
    // Reload workspace backups
    const wsId = document.getElementById('wsBackupSelector').value;
    if (wsId) loadWorkspaceBackups(wsId);
  } catch (err) {
    content.innerHTML = `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:40px;margin-bottom:12px">❌</div>
        <h3 style="color:var(--red);margin-bottom:8px">Restore Failed</h3>
        <p style="color:var(--text-secondary);font-size:14px">${esc(err.message)}</p>
        <button class="btn-sm" style="margin-top:16px" id="closeWsRestoreErrorBtn">Close</button>
      </div>
    `;
    document.getElementById('closeWsRestoreErrorBtn').addEventListener('click', closeWsRestoreModal);
  }
}

function closeWsRestoreModal() {
  document.getElementById('wsRestoreModal').classList.remove('open');
  wsRestoreKey = null;
}

document.getElementById('wsRestoreModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeWsRestoreModal();
});

document.getElementById('wsRestoreModalCloseBtn').addEventListener('click', closeWsRestoreModal);

// --- Restore functionality ---
async function openRestoreModal(key) {
  restoreKey = key;
  const modal = document.getElementById('restoreModal');
  const content = document.getElementById('restoreModalContent');
  content.innerHTML = '<div class="restore-progress"><div class="spinner"></div><p>Loading backup preview...</p></div>';
  modal.classList.add('open');

  try {
    const preview = await api('/admin/backups/restore-preview', {
      method: 'POST',
      body: JSON.stringify({ key })
    });

    const counts = preview.entityCounts || {};
    const statItems = Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `<div class="restore-stat"><div class="restore-stat-value">${fmt(v)}</div><div class="restore-stat-label">${esc(k)}</div></div>`)
      .join('');

    content.innerHTML = `
      <p style="color:var(--text-secondary);font-size:14px;margin-bottom:8px">
        Backup from <strong>${esc(preview.createdAt ? fmtDate(preview.createdAt) : 'unknown')}</strong> (version ${preview.version || '?'})
      </p>
      <div class="restore-stats">${statItems}</div>
      <div class="restore-warning">
        <strong>Warning:</strong> This will completely replace the current database with the backup data.
        All current data will be lost. A safety backup will be created first.<br><br>
        <strong>Important:</strong> Passwords are not included in backups. Local-auth users must use password reset after restore.
        Google OAuth users can sign in normally. All sessions will be invalidated.
      </div>
      <label style="display:block;font-size:13px;color:var(--text-secondary);margin-top:16px">
        Type <strong>RESTORE DATABASE</strong> to confirm:
      </label>
      <input class="confirm-input" id="restoreConfirmInput" placeholder="RESTORE DATABASE" autocomplete="off" spellcheck="false">
      <button class="btn-danger" id="restoreExecuteBtn" disabled>Restore Database</button>
    `;

    document.getElementById('restoreConfirmInput').addEventListener('input', (e) => {
      document.getElementById('restoreExecuteBtn').disabled = e.target.value !== 'RESTORE DATABASE';
    });

    document.getElementById('restoreExecuteBtn').addEventListener('click', executeRestore);
  } catch (err) {
    content.innerHTML = `<p style="color:var(--red)">Failed to load backup preview: ${esc(err.message)}</p>`;
  }
}

async function executeRestore() {
  const content = document.getElementById('restoreModalContent');
  content.innerHTML = `
    <div class="restore-progress">
      <div class="spinner"></div>
      <p id="restoreProgressText">Creating safety backup...</p>
      <p style="font-size:12px;color:var(--text-secondary);margin-top:8px">This may take several minutes. Do not close this page.</p>
    </div>
  `;

  try {
    const result = await api('/admin/backups/restore', {
      method: 'POST',
      body: JSON.stringify({ key: restoreKey, confirmPhrase: 'RESTORE DATABASE' })
    });

    content.innerHTML = `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:40px;margin-bottom:12px">✅</div>
        <h3 style="color:var(--green);margin-bottom:8px">Database Restored Successfully</h3>
        <p style="color:var(--text-secondary);font-size:14px;margin-bottom:16px">
          Safety backup saved as:<br>
          <code style="font-size:12px;color:var(--text-primary)">${esc(result.safetyBackupKey)}</code>
        </p>
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:20px">
          All sessions have been invalidated. You will be logged out in 5 seconds.
        </p>
      </div>
    `;

    // Auto-logout after 5 seconds (sessions are wiped)
    setTimeout(() => {
      handleLogout();
      closeRestoreModal();
    }, 5000);
  } catch (err) {
    content.innerHTML = `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:40px;margin-bottom:12px">❌</div>
        <h3 style="color:var(--red);margin-bottom:8px">Restore Failed</h3>
        <p style="color:var(--text-secondary);font-size:14px">${esc(err.message)}</p>
        <button class="btn-sm" style="margin-top:16px" id="closeRestoreErrorBtn">Close</button>
      </div>
    `;
    document.getElementById('closeRestoreErrorBtn').addEventListener('click', closeRestoreModal);
  }
}

function closeRestoreModal() {
  document.getElementById('restoreModal').classList.remove('open');
  restoreKey = null;
}

document.getElementById('restoreModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeRestoreModal();
});

// Keyboard shortcut: Escape closes modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeUserModal();
    closeRestoreModal();
    closeWsRestoreModal();
  }
});

// ==========================================
// Deleted Items Tab
// ==========================================

async function loadDeleted() {
  const usersTable = document.getElementById('deletedUsersTable');
  const wsTable = document.getElementById('deletedWorkspacesTable');
  usersTable.innerHTML = '<tr><td colspan="5" class="empty-state">Loading...</td></tr>';
  wsTable.innerHTML = '<tr><td colspan="5" class="empty-state">Loading...</td></tr>';

  try {
    const data = await api('/admin/deleted');
    document.getElementById('deletedGraceInfo').textContent = `${data.graceDays}-day grace period before permanent deletion`;

    if (data.users.length === 0) {
      usersTable.innerHTML = '<tr><td colspan="5" class="empty-state">No deleted users</td></tr>';
    } else {
      usersTable.innerHTML = data.users.map(u => `
        <tr>
          <td><strong>${esc(u.displayName)}</strong></td>
          <td>${esc(u.email)}</td>
          <td>${fmtDate(u.deletedAt)}</td>
          <td><span class="badge ${u.daysRemaining <= 5 ? 'badge-admin' : 'badge-verified'}">${u.daysRemaining}d</span></td>
          <td>
            <button class="btn-sm" data-restore-user="${esc(u.id)}">Restore</button>
            <button class="btn-sm" style="background:var(--red);margin-left:4px" data-purge-user="${esc(u.id)}" data-purge-name="${esc(u.displayName)}">Purge</button>
          </td>
        </tr>
      `).join('');
    }

    if (data.workspaces.length === 0) {
      wsTable.innerHTML = '<tr><td colspan="5" class="empty-state">No deleted workspaces</td></tr>';
    } else {
      wsTable.innerHTML = data.workspaces.map(w => `
        <tr>
          <td><strong>${esc(w.name)}</strong></td>
          <td>${w._count.members}</td>
          <td>${fmtDate(w.deletedAt)}</td>
          <td><span class="badge ${w.daysRemaining <= 5 ? 'badge-admin' : 'badge-verified'}">${w.daysRemaining}d</span></td>
          <td>
            <button class="btn-sm" data-restore-ws="${esc(w.id)}">Restore</button>
            <button class="btn-sm" style="background:var(--red);margin-left:4px" data-purge-ws="${esc(w.id)}" data-purge-name="${esc(w.name)}">Purge</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load deleted items:', err);
    usersTable.innerHTML = `<tr><td colspan="5" class="empty-state">Failed to load: ${esc(err.message)}</td></tr>`;
    wsTable.innerHTML = '';
  }
}

// Event delegation for deleted users table
document.getElementById('deletedUsersTable').addEventListener('click', async (e) => {
  const restoreBtn = e.target.closest('[data-restore-user]');
  if (restoreBtn) {
    if (!confirm('Restore this user? They will be able to log in again.')) return;
    try {
      const result = await api(`/admin/users/${restoreBtn.dataset.restoreUser}/restore`, { method: 'POST' });
      alert(result.message);
      loadDeleted();
    } catch (err) { alert('Restore failed: ' + err.message); }
    return;
  }
  const purgeBtn = e.target.closest('[data-purge-user]');
  if (purgeBtn) {
    const name = purgeBtn.dataset.purgeName;
    if (!confirm(`PERMANENTLY delete user "${name}"? This cannot be undone. All their data will be anonymized.`)) return;
    try {
      const result = await api(`/admin/users/${purgeBtn.dataset.purgeUser}/purge`, { method: 'DELETE' });
      alert(result.message);
      loadDeleted();
    } catch (err) { alert('Purge failed: ' + err.message); }
  }
});

// Event delegation for deleted workspaces table
document.getElementById('deletedWorkspacesTable').addEventListener('click', async (e) => {
  const restoreBtn = e.target.closest('[data-restore-ws]');
  if (restoreBtn) {
    if (!confirm('Restore this workspace? All members will regain access.')) return;
    try {
      const result = await api(`/admin/workspaces/${restoreBtn.dataset.restoreWs}/restore`, { method: 'POST' });
      alert(result.message);
      loadDeleted();
    } catch (err) { alert('Restore failed: ' + err.message); }
    return;
  }
  const purgeBtn = e.target.closest('[data-purge-ws]');
  if (purgeBtn) {
    const name = purgeBtn.dataset.purgeName;
    if (!confirm(`PERMANENTLY delete workspace "${name}"? This cannot be undone. All channels, messages, songs, and files will be destroyed.`)) return;
    try {
      const result = await api(`/admin/workspaces/${purgeBtn.dataset.purgeWs}/purge`, { method: 'DELETE' });
      alert(result.message);
      loadDeleted();
    } catch (err) { alert('Purge failed: ' + err.message); }
  }
});

// --- Audit Log ---

let auditCursor = null;
let auditFilterTimer = null;
let auditKnownActions = new Set();

async function loadAuditStats() {
  const grid = document.getElementById('auditStatsGrid');
  try {
    const s = await api('/admin/audit/stats');
    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Events</div>
        <div class="stat-value">${fmt(s.total)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Last 24 Hours</div>
        <div class="stat-value">${fmt(s.last24h)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Last 7 Days</div>
        <div class="stat-value">${fmt(s.last7d)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Top Action (7d)</div>
        <div class="stat-value" style="font-size:14px">${s.topActions?.[0] ? esc(s.topActions[0].action) + ' (' + s.topActions[0].count + ')' : 'None'}</div>
      </div>
    `;
    // Populate action filter dropdown
    const select = document.getElementById('auditActionFilter');
    const currentVal = select.value;
    s.topActions?.forEach(a => auditKnownActions.add(a.action));
    select.innerHTML = '<option value="">All actions</option>' +
      [...auditKnownActions].sort().map(a => `<option value="${esc(a)}" ${a === currentVal ? 'selected' : ''}>${esc(a)}</option>`).join('');
  } catch (err) {
    grid.innerHTML = `<div class="stat-card"><div class="stat-label">Error</div><div class="stat-value" style="font-size:14px">${esc(err.message)}</div></div>`;
  }
}

async function loadAuditLog(append = false) {
  const table = document.getElementById('auditTable');
  const loadMoreBtn = document.getElementById('auditLoadMore');
  if (!append) {
    auditCursor = null;
    table.innerHTML = '<tr><td colspan="5" class="empty-state">Loading...</td></tr>';
  }

  const params = new URLSearchParams();
  const actionFilter = document.getElementById('auditActionFilter').value;
  if (actionFilter) params.set('action', actionFilter);
  if (auditCursor) params.set('cursor', auditCursor);
  params.set('limit', '50');

  try {
    const data = await api(`/admin/audit?${params}`);
    if (!append) table.innerHTML = '';

    if (data.entries.length === 0 && !append) {
      table.innerHTML = '<tr><td colspan="5" class="empty-state">No audit events found</td></tr>';
      loadMoreBtn.style.display = 'none';
      return;
    }

    data.entries.forEach(entry => {
      auditKnownActions.add(entry.action);
      const tr = document.createElement('tr');
      const meta = entry.metadata ? JSON.stringify(entry.metadata, null, 2) : '';
      tr.innerHTML = `
        <td style="white-space:nowrap">${new Date(entry.createdAt).toLocaleString()}</td>
        <td><span class="badge ${getAuditBadgeClass(entry.action)}">${esc(entry.action)}</span></td>
        <td>${entry.actor ? esc(entry.actor.displayName || entry.actor.email) : '<span style="color:var(--text-secondary)">system</span>'}</td>
        <td style="font-family:monospace;font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(entry.targetId || '')}</td>
        <td>${meta ? `<details><summary style="cursor:pointer;font-size:12px;color:var(--text-secondary)">details</summary><pre style="font-size:11px;margin:4px 0;white-space:pre-wrap;max-width:300px">${esc(meta)}</pre></details>` : ''}</td>
      `;
      table.appendChild(tr);
    });

    auditCursor = data.nextCursor;
    loadMoreBtn.style.display = data.hasMore ? 'inline-block' : 'none';
  } catch (err) {
    if (!append) table.innerHTML = `<tr><td colspan="5" class="empty-state">Failed to load: ${esc(err.message)}</td></tr>`;
    loadMoreBtn.style.display = 'none';
  }
}

function getAuditBadgeClass(action) {
  if (action.startsWith('admin.')) return 'badge-admin';
  if (action.includes('deleted') || action.includes('purged') || action.includes('removed')) return 'badge-admin';
  if (action.includes('created') || action.includes('joined') || action.includes('activated')) return 'badge-verified';
  return '';
}

// Audit filter handlers
document.getElementById('auditActionFilter').addEventListener('change', () => loadAuditLog());
document.getElementById('auditActorFilter').addEventListener('input', () => {
  clearTimeout(auditFilterTimer);
  auditFilterTimer = setTimeout(() => loadAuditLog(), 300);
});
document.getElementById('auditLoadMore').addEventListener('click', () => loadAuditLog(true));

// Logout button handler
document.getElementById('logoutBtn').addEventListener('click', handleLogout);

// User modal close button
document.getElementById('userModalCloseBtn').addEventListener('click', closeUserModal);

// Restore modal close button
document.getElementById('restoreModalCloseBtn').addEventListener('click', closeRestoreModal);
