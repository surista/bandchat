import { useState, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import Modal from '../common/Modal';

function VenueForm({ venue, workspaceId, onSave, onClose }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    name: venue?.name || '',
    address: venue?.address || '',
    city: venue?.city || '',
    phone: venue?.phone || '',
    email: venue?.email || '',
    website: venue?.website || '',
    capacity: venue?.capacity || '',
    notes: venue?.notes || '',
    imageUrl: venue?.imageUrl || ''
  });
  const [loading, setLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [error, setError] = useState('');

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageUploading(true);
    try {
      const result = await api.uploadFile(file, workspaceId);
      setFormData(prev => ({ ...prev, imageUrl: result.url }));
    } catch (err) {
      toast.error(err.message || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        ...formData,
        capacity: formData.capacity ? parseInt(formData.capacity, 10) : null
      };
      await onSave(payload);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={venue ? 'Edit Venue' : 'Add Venue'} maxWidth="max-w-lg">
      <div className="modal-body">
        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="venue-name" className="modal-label">Name <span className="text-red-400">*</span></label>
            <input
              id="venue-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="modal-input"
              placeholder="Venue name"
              required
            />
          </div>

          <div>
            <label htmlFor="venue-address" className="modal-label">Address</label>
            <input
              id="venue-address"
              type="text"
              value={formData.address}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              className="modal-input"
              placeholder="123 Main St, State, ZIP"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="venue-city" className="modal-label">City</label>
              <input
                id="venue-city"
                type="text"
                value={formData.city}
                onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                className="modal-input"
                placeholder="City"
              />
            </div>
            <div>
              <label htmlFor="venue-capacity" className="modal-label">Capacity</label>
              <input
                id="venue-capacity"
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData(prev => ({ ...prev, capacity: e.target.value }))}
                className="modal-input"
                placeholder="e.g. 500"
                min="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="venue-email" className="modal-label">Email</label>
              <input
                id="venue-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="modal-input"
                placeholder="venue@example.com"
              />
            </div>
            <div>
              <label htmlFor="venue-phone" className="modal-label">Phone</label>
              <input
                id="venue-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className="modal-input"
                placeholder="+1 555-123-4567"
              />
            </div>
          </div>

          <div>
            <label htmlFor="venue-website" className="modal-label">Website</label>
            <input
              id="venue-website"
              type="url"
              value={formData.website}
              onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
              className="modal-input"
              placeholder="https://..."
            />
          </div>

          <div>
            <label htmlFor="venue-notes" className="modal-label">Notes</label>
            <textarea
              id="venue-notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="modal-input"
              rows={3}
              placeholder="Load-in details, parking, stage dimensions, etc."
            />
          </div>

          {/* Image upload */}
          <div>
            <label className="modal-label">Venue Image</label>
            <div className="flex items-center gap-3">
              {formData.imageUrl ? (
                <div className="relative">
                  <img
                    src={formData.imageUrl}
                    alt="Venue"
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, imageUrl: '' }))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-700"
                    title="Remove image"
                  >
                    x
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center text-2xl">
                  📍
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageUploading}
                className="btn btn-secondary text-sm"
              >
                {imageUploading ? 'Uploading...' : formData.imageUrl ? 'Change Image' : 'Upload Image'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t border-[var(--color-border)]">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="btn bg-green-600 hover:bg-green-700 text-white"
            >
              {loading ? 'Saving...' : venue ? 'Update' : 'Add Venue'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export default VenueForm;
