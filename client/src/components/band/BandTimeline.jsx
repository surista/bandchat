import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { formatDate } from '../../utils/formatDate';
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorMessage from '../common/ErrorMessage';
import Skeleton from '../common/Skeleton';

const EVENT_TYPES = [
  { value: 'formation', label: 'Band Formation', icon: '🎸' },
  { value: 'first_gig', label: 'First Gig', icon: '🎤' },
  { value: 'gig', label: 'Gig/Show', icon: '🎵' },
  { value: 'rehearsal', label: 'Rehearsal', icon: '🥁' },
  { value: 'member_joined', label: 'Member Joined', icon: '🙌' },
  { value: 'member_left', label: 'Member Left', icon: '👋' },
  { value: 'album_release', label: 'Album/EP Release', icon: '💿' },
  { value: 'milestone', label: 'Milestone', icon: '🏆' },
  { value: 'custom', label: 'Custom Event', icon: '📌' }
];

export default function BandTimeline({ workspaceId, isAdmin = false }) {
  const toast = useToast();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [deleteEventId, setDeleteEventId] = useState(null);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    eventType: 'custom',
    eventDate: new Date().toISOString().split('T')[0],
    imageUrl: ''
  });

  useEffect(() => {
    loadTimeline();
  }, [workspaceId]);

  async function loadTimeline() {
    try {
      const data = await api.getTimeline(workspaceId);
      setEvents(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load timeline:', err);
      setError(err.message || 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (editingEvent) {
        await api.updateTimelineEvent(editingEvent.id, formData);
      } else {
        await api.createTimelineEvent(workspaceId, formData);
      }
      await loadTimeline();
      resetForm();
    } catch (error) {
      toast.error(error.message || 'Failed to save event');
    }
  }

  async function handleDelete(eventId) {
    try {
      await api.deleteTimelineEvent(eventId);
      setEvents(events.filter(e => e.id !== eventId));
      setDeleteEventId(null);
    } catch (error) {
      toast.error(error.message || 'Failed to delete event');
      setDeleteEventId(null);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const result = await api.generateTimeline(workspaceId);
      setEvents(result.events);
      if (result.created > 0) {
        toast.success(`Generated ${result.created} timeline events from your band history!`);
      } else {
        toast('No new events to generate. Your timeline is up to date!');
      }
    } catch (error) {
      console.error('Failed to generate timeline:', error);
      toast.error('Failed to generate timeline: ' + (error.message || 'Unknown error'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerate() {
    setShowRegenConfirm(false);
    setRegenerating(true);
    try {
      const result = await api.regenerateTimeline(workspaceId);
      setEvents(result.events);
      toast.success(`Regenerated timeline: deleted ${result.deleted} old events, created ${result.created} new events.`);
    } catch (error) {
      console.error('Failed to regenerate timeline:', error);
      toast.error('Failed to regenerate timeline: ' + (error.message || 'Unknown error'));
    } finally {
      setRegenerating(false);
    }
  }

  function startEdit(event) {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description || '',
      eventType: event.eventType,
      eventDate: event.eventDate.split('T')[0],
      imageUrl: event.imageUrl || ''
    });
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false);
    setEditingEvent(null);
    setFormData({
      title: '',
      description: '',
      eventType: 'custom',
      eventDate: new Date().toISOString().split('T')[0],
      imageUrl: ''
    });
  }

  function getEventIcon(type) {
    const found = EVENT_TYPES.find(t => t.value === type);
    return found ? found.icon : '📌';
  }

  // Group events by year
  const eventsByYear = events.reduce((acc, event) => {
    const year = new Date(event.eventDate).getFullYear();
    if (!acc[year]) acc[year] = [];
    acc[year].push(event);
    return acc;
  }, {});

  const years = Object.keys(eventsByYear).sort((a, b) => b - a);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({length: 3}).map((_, i) => <Skeleton.ListItem key={i} />)}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-primary)]">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Band Timeline</h2>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <>
                  <button
                    onClick={() => setShowRegenConfirm(true)}
                    disabled={regenerating || generating}
                    className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                    title="Delete auto-generated events and recreate from current data"
                  >
                    {regenerating ? 'Regenerating...' : 'Regenerate'}
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={generating || regenerating}
                    className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                    title="Add new events without removing existing ones"
                  >
                    {generating ? 'Generating...' : 'Auto-Generate'}
                  </button>
                </>
              )}
              <button
                onClick={() => setShowForm(true)}
                className="btn btn-blue text-sm"
              >
                + Add Event
              </button>
            </div>
          </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="mb-8 bg-[var(--color-bg-secondary)] p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
            {editingEvent ? 'Edit Event' : 'Add Timeline Event'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">Event Type</label>
                <select
                  value={formData.eventType}
                  onChange={e => setFormData({ ...formData, eventType: e.target.value })}
                  className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded px-3 py-2"
                >
                  {EVENT_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">Date</label>
                <input
                  type="date"
                  value={formData.eventDate}
                  onChange={e => setFormData({ ...formData, eventDate: e.target.value })}
                  className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded px-3 py-2"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded px-3 py-2"
                placeholder="Event title"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded px-3 py-2"
                placeholder="Tell the story..."
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">Image URL (optional)</label>
              <input
                type="url"
                value={formData.imageUrl}
                onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded px-3 py-2"
                placeholder="https://..."
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
              >
                {editingEvent ? 'Update' : 'Add Event'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] rounded"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Timeline Display */}
      {error && !loading && events.length === 0 ? (
        <ErrorMessage
          message={error}
          onRetry={loadTimeline}
          className="py-16"
        />
      ) : events.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg text-[var(--color-text-muted)] mb-4">Your band's story starts here!</p>
          <p className="text-sm text-[var(--color-text-muted)]">Add events to build your timeline, or click "Auto-Generate" to create events from your gig history.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-[var(--color-border)]" />

          {years.map(year => (
            <div key={year} className="mb-8">
              <div className="flex items-center mb-4">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg z-10">
                  {year}
                </div>
              </div>

              {eventsByYear[year].map((event, idx) => (
                <div key={event.id} className="relative pl-20 pb-8">
                  {/* Event dot */}
                  <div className="absolute left-6 top-2 w-4 h-4 bg-[var(--color-bg-tertiary)] rounded-full border-2 border-[var(--color-bg-secondary)]" />

                  <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 hover:bg-[var(--color-bg-tertiary)] transition">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{getEventIcon(event.eventType)}</span>
                        <div>
                          <h4 className="text-[var(--color-text-primary)] font-semibold">{event.title}</h4>
                          <p className="text-sm text-[var(--color-text-muted)]">{formatDate(event.eventDate)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(event)}
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteEventId(event.id)}
                          className="text-[var(--color-text-muted)] hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {event.description && (
                      <p className="mt-2 text-[var(--color-text-secondary)]">{event.description}</p>
                    )}
                    {event.imageUrl && (
                      <img
                        src={event.imageUrl}
                        alt={event.title}
                        className="mt-3 rounded-lg max-h-48 object-cover"
                      />
                    )}
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                      Added by {event.createdBy?.displayName || event.removedCreatorName || 'Deleted User'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteEventId}
        title="Delete Event"
        message="Delete this timeline event?"
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDelete(deleteEventId)}
        onCancel={() => setDeleteEventId(null)}
      />

      <ConfirmDialog
        isOpen={showRegenConfirm}
        title="Regenerate Timeline"
        message="This will delete all auto-generated timeline events and recreate them from current band data. Custom events will be kept. Continue?"
        confirmText="Regenerate"
        confirmVariant="danger"
        onConfirm={handleRegenerate}
        onCancel={() => setShowRegenConfirm(false)}
      />
    </div>
  );
}
