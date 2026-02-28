import { useState, useEffect } from 'react';
import api from '../../services/api';
import ConfirmDialog from '../common/ConfirmDialog';
import Skeleton from '../common/Skeleton';

const CATEGORIES = [
  { id: 'venue', label: 'Venues', icon: '🏟️' },
  { id: 'sound_engineer', label: 'Sound Engineers', icon: '🎚️' },
  { id: 'photographer', label: 'Photographers', icon: '📷' },
  { id: 'agent', label: 'Agents/Bookers', icon: '📋' },
  { id: 'other', label: 'Other', icon: '📇' }
];

function ContactsList({ workspaceId }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [deleteContactId, setDeleteContactId] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadContacts();
  }, [workspaceId]);

  const loadContacts = async () => {
    try {
      const data = await api.getContacts(workspaceId);
      setContacts(data);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data) => {
    try {
      if (editingContact) {
        const updated = await api.updateContact(editingContact.id, data);
        setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
      } else {
        const created = await api.createContact(workspaceId, data);
        setContacts(prev => [...prev, created]);
      }
      setShowForm(false);
      setEditingContact(null);
    } catch (err) {
      throw new Error(err.message || 'Failed to save contact');
    }
  };

  const handleDelete = async (contactId) => {
    try {
      await api.deleteContact(contactId);
      setContacts(prev => prev.filter(c => c.id !== contactId));
      setDeleteContactId(null);
    } catch (err) {
      console.error('Failed to delete contact:', err);
      setDeleteContactId(null);
    }
  };

  const filteredContacts = contacts.filter(contact => {
    const matchesCategory = filterCategory === 'all' || contact.category === filterCategory;
    const matchesSearch = !searchQuery ||
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.notes?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const groupedContacts = CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = filteredContacts.filter(c => c.category === cat.id);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({length: 3}).map((_, i) => <Skeleton.ListItem key={i} />)}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-900 min-h-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Contacts</h2>
          <button
            onClick={() => { setEditingContact(null); setShowForm(true); }}
            className="btn bg-green-600 hover:bg-green-700 text-white"
          >
            + Add Contact
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts..."
            className="flex-1 min-w-[200px] bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-gray-800 text-white px-3 py-2 rounded-lg border border-gray-700"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredContacts.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            {contacts.length === 0
              ? 'No contacts yet. Add your first contact!'
              : 'No contacts match your filters.'}
          </div>
        ) : filterCategory === 'all' ? (
          // Grouped view
          <div className="space-y-6">
            {CATEGORIES.map(cat => {
              const catContacts = groupedContacts[cat.id];
              if (catContacts.length === 0) return null;
              return (
                <div key={cat.id}>
                  <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                    <span className="text-gray-600">({catContacts.length})</span>
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {catContacts.map(contact => (
                      <ContactCard
                        key={contact.id}
                        contact={contact}
                        onEdit={() => { setEditingContact(contact); setShowForm(true); }}
                        onDelete={() => setDeleteContactId(contact.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Flat view for single category
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredContacts.map(contact => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onEdit={() => { setEditingContact(contact); setShowForm(true); }}
                onDelete={() => setDeleteContactId(contact.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Contact Form Modal */}
      {showForm && (
        <ContactForm
          contact={editingContact}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingContact(null); }}
        />
      )}

      <ConfirmDialog
        isOpen={deleteContactId !== null}
        title="Delete Contact"
        message="Delete this contact?"
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDelete(deleteContactId)}
        onCancel={() => setDeleteContactId(null)}
      />
    </div>
  );
}

function ContactCard({ contact, onEdit, onDelete }) {
  const category = CATEGORIES.find(c => c.id === contact.category);

  return (
    <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-medium text-white">{contact.name}</h4>
          <span className="text-xs text-gray-500">{category?.icon} {category?.label}</span>
        </div>
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
      </div>

      <div className="space-y-1 text-sm">
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="block text-blue-400 hover:text-blue-300 truncate">
            {contact.email}
          </a>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="block text-gray-300 hover:text-white">
            {contact.phone}
          </a>
        )}
        {contact.website && (
          <a href={contact.website} target="_blank" rel="noopener noreferrer" className="block text-blue-400 hover:text-blue-300 truncate">
            {contact.website.replace(/^https?:\/\//, '')}
          </a>
        )}
        {contact.address && (
          <p className="text-gray-400 truncate">{contact.address}</p>
        )}
        {contact.notes && (
          <p className="text-gray-500 text-xs mt-2 line-clamp-2">{contact.notes}</p>
        )}
      </div>
    </div>
  );
}

function ContactForm({ contact, onSave, onClose }) {
  const [formData, setFormData] = useState({
    name: contact?.name || '',
    category: contact?.category || 'venue',
    email: contact?.email || '',
    phone: contact?.phone || '',
    website: contact?.website || '',
    address: contact?.address || '',
    notes: contact?.notes || ''
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
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-lg">
        <div className="modal-header">
          <h3>{contact ? 'Edit Contact' : 'Add Contact'}</h3>
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
              <label className="modal-label">Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="modal-input"
                placeholder="Contact name"
                required
              />
            </div>

            <div>
              <label className="modal-label">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="modal-input"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="modal-label">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="modal-input"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="modal-label">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="modal-input"
                  placeholder="+1 555-123-4567"
                />
              </div>
            </div>

            <div>
              <label className="modal-label">Website</label>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                className="modal-input"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="modal-label">Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                className="modal-input"
                placeholder="123 Main St, City, State"
              />
            </div>

            <div>
              <label className="modal-label">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="modal-input"
                rows={3}
                placeholder="Additional notes..."
              />
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t border-gray-700">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.name.trim()}
                className="btn bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                {loading ? 'Saving...' : contact ? 'Update' : 'Add Contact'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ContactsList;
