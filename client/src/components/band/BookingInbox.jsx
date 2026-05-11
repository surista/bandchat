import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import api from '../../services/api';
import Skeleton from '../common/Skeleton';
import ErrorMessage from '../common/ErrorMessage';
import { useToast } from '../../context/ToastContext';

/**
 * Admin-only band view listing public booking requests submitted via the
 * /book/:slug form. Lets admins filter by status, copy/email the requester,
 * mark "responded", archive, or delete.
 *
 * The public submission URL is shown at the top so admins can copy it
 * straight onto their socials / band bio.
 */
function BookingInbox({ workspaceId, workspace }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState('new');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.request(`/bookings/workspace/${workspaceId}?status=${statusFilter}&limit=100`);
      setItems(data.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load booking requests');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => {
    try {
      await api.request(`/bookings/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      // Optimistic: drop from current list if it no longer matches the filter
      setItems((prev) => prev.filter((b) => b.id !== id));
      toast.success(status === 'responded' ? 'Marked as responded' : status === 'archived' ? 'Archived' : 'Reopened');
    } catch (err) {
      toast.error(err.message || 'Failed to update');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this booking request? This cannot be undone.')) return;
    try {
      await api.request(`/bookings/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((b) => b.id !== id));
      toast.success('Deleted');
    } catch (err) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const slug = workspace?.slug;
  const publicUrl = slug ? `${window.location.origin}/book/${slug}` : null;

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg-primary)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">Booking Inbox</h2>

        {/* Public URL banner */}
        {publicUrl ? (
          <div className="mb-6 p-4 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)]">
            <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Your public booking form</p>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-sm px-2 py-1 bg-[var(--color-bg-tertiary)] rounded text-[var(--color-text-primary)] break-all flex-1 min-w-0">
                {publicUrl}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Link copied'); }}
                className="text-xs px-3 py-1.5 rounded bg-[var(--color-primary)] text-white hover:opacity-90"
              >
                Copy
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
              >
                Preview ↗
              </a>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 rounded bg-yellow-500/10 border border-yellow-500/30 text-sm text-[var(--color-text-secondary)]">
            Set a workspace slug in settings to enable your public booking form.
          </div>
        )}

        {/* Status tabs */}
        <div className="flex gap-1 mb-4 border-b border-[var(--color-border)]">
          {[
            { key: 'new', label: 'New' },
            { key: 'responded', label: 'Responded' },
            { key: 'archived', label: 'Archived' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                statusFilter === tab.key
                  ? 'border-[var(--color-primary)] text-[var(--color-text-primary)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton.Card key={i} />)}
          </div>
        ) : error ? (
          <ErrorMessage message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📬</div>
            <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
              No {statusFilter} requests
            </h3>
            <p className="text-[var(--color-text-muted)] max-w-sm mx-auto">
              {statusFilter === 'new'
                ? 'New booking requests will appear here. Share your booking link to get started.'
                : `Nothing in ${statusFilter} yet.`}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((b) => (
              <li key={b.id} className="p-4 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)]">
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-[var(--color-text-primary)] break-words">{b.requesterName}</h3>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      <a href={`mailto:${b.requesterEmail}`} className="hover:underline">{b.requesterEmail}</a>
                      {b.requesterPhone && <> · <a href={`tel:${b.requesterPhone}`} className="hover:underline">{b.requesterPhone}</a></>}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                    {format(new Date(b.createdAt), 'd MMM yyyy, h:mm a')}
                  </span>
                </div>

                {/* Event meta */}
                {(b.venueName || b.eventDate || b.feeOffer) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-text-secondary)] mb-2">
                    {b.eventDate && <span>📅 {format(new Date(b.eventDate), 'd MMM yyyy')}</span>}
                    {b.venueName && <span>📍 {b.venueName}</span>}
                    {b.feeOffer && <span>💰 {b.feeOffer}</span>}
                  </div>
                )}

                <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap break-words mb-3">
                  {b.message}
                </p>

                {b.respondedBy && b.respondedAt && (
                  <p className="text-xs text-[var(--color-text-muted)] mb-2">
                    Responded by {b.respondedBy.displayName} · {format(new Date(b.respondedAt), 'd MMM yyyy')}
                  </p>
                )}

                <div className="flex gap-2 flex-wrap">
                  {statusFilter !== 'responded' && (
                    <button
                      onClick={() => setStatus(b.id, 'responded')}
                      className="text-xs px-3 py-1.5 rounded bg-[var(--color-primary)] text-white hover:opacity-90"
                    >
                      Mark as responded
                    </button>
                  )}
                  {statusFilter !== 'archived' && (
                    <button
                      onClick={() => setStatus(b.id, 'archived')}
                      className="text-xs px-3 py-1.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
                    >
                      Archive
                    </button>
                  )}
                  {(statusFilter === 'archived' || statusFilter === 'responded') && (
                    <button
                      onClick={() => setStatus(b.id, 'new')}
                      className="text-xs px-3 py-1.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
                    >
                      Reopen
                    </button>
                  )}
                  <button
                    onClick={() => remove(b.id)}
                    className="text-xs px-3 py-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default BookingInbox;
