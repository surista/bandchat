import { isSafeUrl } from '../../utils/urlSafety';
import { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorMessage from '../common/ErrorMessage';
import Skeleton from '../common/Skeleton';
import VenueForm from './VenueForm';

function VenueList({ workspace, isAdmin }) {
  const workspaceId = workspace?.id;
  const { socket } = useSocket();
  const toast = useToast();
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);
  const [deleteVenueId, setDeleteVenueId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadVenues();
  }, [workspaceId]);

  // Socket.IO real-time listeners
  useEffect(() => {
    if (!socket) return;

    const handleCreated = (venue) => {
      if (venue.workspaceId === workspaceId) {
        setVenues(prev => prev.some(v => v.id === venue.id) ? prev : [...prev, venue]);
      }
    };

    const handleUpdated = (venue) => {
      setVenues(prev => prev.map(v => v.id === venue.id ? venue : v));
    };

    const handleDeleted = ({ id }) => {
      setVenues(prev => prev.filter(v => v.id !== id));
    };

    socket.on('venue:created', handleCreated);
    socket.on('venue:updated', handleUpdated);
    socket.on('venue:deleted', handleDeleted);

    return () => {
      socket.off('venue:created', handleCreated);
      socket.off('venue:updated', handleUpdated);
      socket.off('venue:deleted', handleDeleted);
    };
  }, [socket, workspaceId]);

  const loadVenues = async () => {
    try {
      const data = await api.getVenues(workspaceId);
      setVenues(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load venues:', err);
      setError(err.message || 'Failed to load venues');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data) => {
    try {
      if (editingVenue) {
        const updated = await api.updateVenue(editingVenue.id, data);
        setVenues(prev => prev.map(v => v.id === updated.id ? updated : v));
        toast.success('Venue updated');
      } else {
        const created = await api.createVenue(workspaceId, data);
        setVenues(prev => [...prev, created]);
        toast.success('Venue added');
      }
      setShowForm(false);
      setEditingVenue(null);
    } catch (err) {
      throw new Error(err.message || 'Failed to save venue');
    }
  };

  const handleDelete = async (venueId) => {
    try {
      await api.deleteVenue(venueId);
      setVenues(prev => prev.filter(v => v.id !== venueId));
      setDeleteVenueId(null);
      toast.success('Venue deleted');
    } catch (err) {
      console.error('Failed to delete venue:', err);
      toast.error(err.message || 'Failed to delete venue');
      setDeleteVenueId(null);
    }
  };

  const filteredVenues = venues.filter(venue => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      venue.name.toLowerCase().includes(q) ||
      venue.city?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({length: 3}).map((_, i) => <Skeleton.ListItem key={i} />)}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--color-bg-primary)] min-h-0">
      {/* Header */}
      <div className="p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Venues</h2>
          <button
            onClick={() => { setEditingVenue(null); setShowForm(true); }}
            className="btn bg-green-600 hover:bg-green-700 text-white"
          >
            + Add Venue
          </button>
        </div>

        {/* Search */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or city..."
            className="flex-1 min-w-[200px] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] px-3 py-2 rounded-lg border border-[var(--color-border)] focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Venue List */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && !loading && venues.length === 0 ? (
          <ErrorMessage
            message={error}
            onRetry={loadVenues}
            className="py-16"
          />
        ) : filteredVenues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4">{venues.length === 0 ? '📍' : '🔍'}</div>
            <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
              {venues.length === 0 ? 'No venues yet' : 'No matches found'}
            </h3>
            <p className="text-[var(--color-text-muted)] max-w-sm mb-4">
              {venues.length === 0
                ? 'Keep track of the venues your band plays at -- capacity, contacts, and notes all in one place.'
                : 'Try a different search term.'}
            </p>
            {venues.length === 0 && (
              <button
                onClick={() => { setEditingVenue(null); setShowForm(true); }}
                className="btn bg-green-600 hover:bg-green-700 text-white"
              >
                + Add Venue
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredVenues.map(venue => (
              <VenueCard
                key={venue.id}
                venue={venue}
                onEdit={() => { setEditingVenue(venue); setShowForm(true); }}
                onDelete={() => setDeleteVenueId(venue.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Venue Form Modal */}
      {showForm && (
        <VenueForm
          venue={editingVenue}
          workspaceId={workspaceId}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingVenue(null); }}
        />
      )}

      <ConfirmDialog
        isOpen={deleteVenueId !== null}
        title="Delete Venue"
        message="Delete this venue? This cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDelete(deleteVenueId)}
        onCancel={() => setDeleteVenueId(null)}
      />
    </div>
  );
}

function VenueCard({ venue, onEdit, onDelete }) {
  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 hover:bg-[var(--color-bg-tertiary)] transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-3 min-w-0">
          {/* Venue logo thumbnail */}
          {venue.imageUrl ? (
            <img
              src={venue.imageUrl}
              alt={venue.name}
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center flex-shrink-0 text-lg">
              📍
            </div>
          )}
          <div className="min-w-0">
            <h4 className="font-medium text-[var(--color-text-primary)] truncate">{venue.name}</h4>
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              {venue.city && <span>{venue.city}</span>}
              {venue.city && venue.capacity && <span>-</span>}
              {venue.capacity && <span>Cap: {venue.capacity.toLocaleString()}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {venue._count?.gigs > 0 && (
            <span
              className="text-xs bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded-full"
              title={`${venue._count.gigs} gig${venue._count.gigs === 1 ? '' : 's'}`}
            >
              {venue._count.gigs} gig{venue._count.gigs === 1 ? '' : 's'}
            </span>
          )}
          <button
            onClick={onEdit}
            className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded"
            title="Edit"
            aria-label="Edit venue"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-[var(--color-text-muted)] hover:text-red-400 hover:bg-[var(--color-bg-tertiary)] rounded"
            title="Delete"
            aria-label="Delete venue"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-1 text-sm">
        {venue.email && (
          <a href={`mailto:${venue.email}`} className="block text-blue-400 hover:text-blue-300 truncate">
            {venue.email}
          </a>
        )}
        {venue.phone && (
          <a href={`tel:${venue.phone}`} className="block text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            {venue.phone}
          </a>
        )}
        {venue.website && (
          isSafeUrl(venue.website) ? (
            <a href={venue.website} target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:text-blue-300 truncate">
              {venue.website.replace(/^https?:\/\//, '')}
            </a>
          ) : (
            <span className="block text-[var(--color-text-secondary)] truncate">{venue.website}</span>
          )
        )}
        {venue.address && (
          <p className="text-[var(--color-text-muted)] truncate">{venue.address}</p>
        )}
        {venue.notes && (
          <p className="text-[var(--color-text-muted)] text-xs mt-2 line-clamp-2">{venue.notes}</p>
        )}
      </div>
    </div>
  );
}

export default VenueList;
