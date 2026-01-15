import { useState } from 'react';
import { format } from 'date-fns';

function GigForm({ gig, defaultDate, setlists, onSave, onClose }) {
  const getDefaultDateTime = () => {
    if (gig?.date) {
      return format(new Date(gig.date), "yyyy-MM-dd'T'HH:mm");
    }
    if (defaultDate) {
      return format(defaultDate, "yyyy-MM-dd'T'19:00");
    }
    return format(new Date(), "yyyy-MM-dd'T'19:00");
  };

  const [formData, setFormData] = useState({
    title: gig?.title || '',
    type: gig?.type || 'GIG',
    date: getDefaultDateTime(),
    endDate: gig?.endDate ? format(new Date(gig.endDate), "yyyy-MM-dd'T'HH:mm") : '',
    venue: gig?.venue || '',
    address: gig?.address || '',
    notes: gig?.notes || '',
    pay: gig?.pay || '',
    status: gig?.status || 'SCHEDULED',
    setlistId: gig?.setlistId || ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await onSave({
        title: formData.title,
        type: formData.type,
        date: new Date(formData.date).toISOString(),
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null,
        venue: formData.venue || null,
        address: formData.address || null,
        notes: formData.notes || null,
        pay: formData.pay ? parseFloat(formData.pay) : null,
        status: formData.status,
        setlistId: formData.setlistId || null
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            {gig ? 'Edit Event' : 'New Event'}
          </h3>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="e.g., Friday Night at The Venue"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => handleChange('type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  >
                    <option value="GIG">Gig</option>
                    <option value="REHEARSAL">Rehearsal</option>
                    <option value="RECORDING">Recording</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                {gig && (
                  <div>
                    <label className="block text-gray-700 font-medium mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => handleChange('status', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                    >
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Start Date/Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.date}
                    onChange={(e) => handleChange('date', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">End Date/Time</label>
                  <input
                    type="datetime-local"
                    value={formData.endDate}
                    onChange={(e) => handleChange('endDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Venue</label>
                <input
                  type="text"
                  value={formData.venue}
                  onChange={(e) => handleChange('venue', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="Venue name"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="Full address"
                />
              </div>

              {setlists.length > 0 && (
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Setlist</label>
                  <select
                    value={formData.setlistId}
                    onChange={(e) => handleChange('setlistId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  >
                    <option value="">No setlist</option>
                    {setlists.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {formData.type === 'GIG' && (
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Pay ($)</label>
                  <input
                    type="number"
                    value={formData.pay}
                    onChange={(e) => handleChange('pay', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
              )}

              <div>
                <label className="block text-gray-700 font-medium mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  rows={3}
                  placeholder="Additional details..."
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
              >
                {loading ? 'Saving...' : gig ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default GigForm;
