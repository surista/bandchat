import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { formatDistanceToNow } from 'date-fns';
import Skeleton from '../common/Skeleton';

const PRIORITIES = [
  { id: 'low', label: 'Low', color: 'text-gray-400', bg: 'bg-gray-700' },
  { id: 'normal', label: 'Normal', color: 'text-blue-400', bg: 'bg-blue-900/50' },
  { id: 'high', label: 'High', color: 'text-yellow-400', bg: 'bg-yellow-900/50' },
  { id: 'urgent', label: 'Urgent', color: 'text-red-400', bg: 'bg-red-900/50' }
];

function AnnouncementsList({ workspaceId, workspace }) {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);

  const isAdmin = workspace?.members?.find(m => m.user.id === user?.id)?.role === 'ADMIN';

  useEffect(() => {
    loadAnnouncements();
  }, [workspaceId]);

  const loadAnnouncements = async () => {
    try {
      const data = await api.getAnnouncements(workspaceId);
      setAnnouncements(data);
    } catch (err) {
      console.error('Failed to load announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data) => {
    try {
      if (editingAnnouncement) {
        const updated = await api.updateAnnouncement(editingAnnouncement.id, data);
        setAnnouncements(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
      } else {
        const created = await api.createAnnouncement(workspaceId, data);
        setAnnouncements(prev => [created, ...prev]);
      }
      setShowForm(false);
      setEditingAnnouncement(null);
    } catch (err) {
      throw new Error(err.message || 'Failed to save announcement');
    }
  };

  const handleAcknowledge = async (announcementId) => {
    try {
      await api.acknowledgeAnnouncement(announcementId);
      setAnnouncements(prev =>
        prev.map(a =>
          a.id === announcementId
            ? { ...a, isAcknowledged: true, acknowledgmentCount: (a.acknowledgmentCount || 0) + 1 }
            : a
        )
      );
    } catch (err) {
      console.error('Failed to acknowledge:', err);
    }
  };

  const handleDelete = async (announcementId) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await api.deleteAnnouncement(announcementId);
      setAnnouncements(prev => prev.filter(a => a.id !== announcementId));
    } catch (err) {
      console.error('Failed to delete announcement:', err);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({length: 3}).map((_, i) => <Skeleton.Card key={i} />)}
      </div>
    );
  }

  const unacknowledged = announcements.filter(a => !a.isAcknowledged && a.isPinned);
  const acknowledged = announcements.filter(a => a.isAcknowledged || !a.isPinned);

  return (
    <div className="flex-1 flex flex-col bg-gray-900 min-h-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Announcements</h2>
          {isAdmin && (
            <button
              onClick={() => { setEditingAnnouncement(null); setShowForm(true); }}
              className="btn bg-green-600 hover:bg-green-700 text-white"
            >
              + New Announcement
            </button>
          )}
        </div>
      </div>

      {/* Announcements List */}
      <div className="flex-1 overflow-y-auto p-4">
        {announcements.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            No announcements yet.
            {isAdmin && ' Create one to share important updates with your band.'}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Unacknowledged announcements */}
            {unacknowledged.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-yellow-400 mb-3 flex items-center gap-2">
                  <span>Requires Acknowledgment</span>
                  <span className="bg-yellow-600 text-white text-xs px-2 py-0.5 rounded-full">
                    {unacknowledged.length}
                  </span>
                </h3>
                <div className="space-y-3">
                  {unacknowledged.map(announcement => (
                    <AnnouncementCard
                      key={announcement.id}
                      announcement={announcement}
                      isAdmin={isAdmin}
                      onAcknowledge={() => handleAcknowledge(announcement.id)}
                      onEdit={() => { setEditingAnnouncement(announcement); setShowForm(true); }}
                      onDelete={() => handleDelete(announcement.id)}
                      memberCount={workspace?.members?.length || 0}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Acknowledged/archived announcements */}
            {acknowledged.length > 0 && (
              <div>
                {unacknowledged.length > 0 && (
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Previous Announcements</h3>
                )}
                <div className="space-y-3">
                  {acknowledged.map(announcement => (
                    <AnnouncementCard
                      key={announcement.id}
                      announcement={announcement}
                      isAdmin={isAdmin}
                      onAcknowledge={() => handleAcknowledge(announcement.id)}
                      onEdit={() => { setEditingAnnouncement(announcement); setShowForm(true); }}
                      onDelete={() => handleDelete(announcement.id)}
                      memberCount={workspace?.members?.length || 0}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Announcement Form Modal */}
      {showForm && (
        <AnnouncementForm
          announcement={editingAnnouncement}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingAnnouncement(null); }}
        />
      )}
    </div>
  );
}

function AnnouncementCard({ announcement, isAdmin, onAcknowledge, onEdit, onDelete, memberCount }) {
  const priority = PRIORITIES.find(p => p.id === announcement.priority) || PRIORITIES[1];

  return (
    <div className={`rounded-lg p-4 ${priority.bg} border border-gray-700`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {announcement.isPinned && (
            <span className="text-yellow-400" title="Pinned">📌</span>
          )}
          <h4 className="font-medium text-white">{announcement.title}</h4>
          <span className={`text-xs px-2 py-0.5 rounded ${priority.color} ${priority.bg}`}>
            {priority.label}
          </span>
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <button
              onClick={onEdit}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
              title="Edit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <p className="text-gray-300 whitespace-pre-wrap mb-3">{announcement.content}</p>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4 text-gray-500">
          <span>
            By {announcement.createdBy?.displayName} • {formatDistanceToNow(new Date(announcement.createdAt), { addSuffix: true })}
          </span>
          <span className="flex items-center gap-1">
            <span className="text-green-400">{announcement.acknowledgmentCount || 0}</span>
            <span>/ {memberCount} acknowledged</span>
          </span>
        </div>

        {!announcement.isAcknowledged && announcement.isPinned && (
          <button
            onClick={onAcknowledge}
            className="btn bg-green-600 hover:bg-green-700 text-white text-sm py-1"
          >
            Acknowledge
          </button>
        )}
        {announcement.isAcknowledged && (
          <span className="text-green-400 text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Acknowledged
          </span>
        )}
      </div>
    </div>
  );
}

function AnnouncementForm({ announcement, onSave, onClose }) {
  const [formData, setFormData] = useState({
    title: announcement?.title || '',
    content: announcement?.content || '',
    priority: announcement?.priority || 'normal',
    isPinned: announcement?.isPinned !== false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await onSave(formData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-lg">
        <div className="modal-header">
          <h3>{announcement ? 'Edit Announcement' : 'New Announcement'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl" aria-label="Close">&times;</button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="modal-label">Title <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="modal-input"
                placeholder="Announcement title"
                required
              />
            </div>

            <div>
              <label className="modal-label">Content <span className="text-red-400">*</span></label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                className="modal-input"
                rows={5}
                placeholder="What do you want to announce?"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="modal-label">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                  className="modal-input"
                >
                  {PRIORITIES.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer mt-6">
                  <input
                    type="checkbox"
                    checked={formData.isPinned}
                    onChange={(e) => setFormData(prev => ({ ...prev, isPinned: e.target.checked }))}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-gray-300">Pin & require acknowledgment</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t border-gray-700">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.title.trim() || !formData.content.trim()}
                className="btn bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                {loading ? 'Saving...' : announcement ? 'Update' : 'Post Announcement'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AnnouncementsList;
