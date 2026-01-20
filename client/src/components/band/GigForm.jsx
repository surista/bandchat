import { useState } from 'react';
import { format } from 'date-fns';

function GigForm({ gig, defaultDate, setlists, onSave, onClose }) {
  // Round minutes to nearest half hour
  const roundToHalfHour = (minutes) => minutes < 15 ? '00' : minutes < 45 ? '30' : '00';

  const getDefaultDate = () => {
    if (gig?.date) return format(new Date(gig.date), 'yyyy-MM-dd');
    if (defaultDate) return format(defaultDate, 'yyyy-MM-dd');
    return format(new Date(), 'yyyy-MM-dd');
  };

  const getDefaultTime = (dateVal, fallback = '19:00') => {
    if (dateVal) {
      const d = new Date(dateVal);
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = roundToHalfHour(d.getMinutes());
      return `${hours}:${mins}`;
    }
    return fallback;
  };

  // Initialize selected sets from existing gig data
  const getInitialSets = () => {
    if (gig?.setlists && gig.setlists.length > 0) {
      return gig.setlists
        .sort((a, b) => a.setNumber - b.setNumber)
        .map(gs => gs.setlistId || gs.setlist?.id);
    } else if (gig?.setlistId) {
      return [gig.setlistId];
    }
    return [];
  };

  const [formData, setFormData] = useState({
    title: gig?.title || '',
    type: gig?.type || 'GIG',
    startDate: getDefaultDate(),
    startTime: getDefaultTime(gig?.date),
    endDate: gig?.endDate ? format(new Date(gig.endDate), 'yyyy-MM-dd') : '',
    endTime: gig?.endDate ? getDefaultTime(gig.endDate, '') : '',
    venue: gig?.venue || '',
    address: gig?.address || '',
    notes: gig?.notes || '',
    pay: gig?.pay || '',
    status: gig?.status || 'SCHEDULED',
    setlistId: gig?.setlistId || ''
  });
  const [selectedSets, setSelectedSets] = useState(getInitialSets());
  const [useMultiSet, setUseMultiSet] = useState((gig?.setlists?.length || 0) > 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Combine date and time fields
      const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
      const endDateTime = formData.endDate && formData.endTime
        ? new Date(`${formData.endDate}T${formData.endTime}`)
        : null;

      const saveData = {
        title: formData.title,
        type: formData.type,
        date: startDateTime.toISOString(),
        endDate: endDateTime ? endDateTime.toISOString() : null,
        venue: formData.venue || null,
        address: formData.address || null,
        notes: formData.notes || null,
        pay: formData.pay ? parseFloat(formData.pay) : null,
        status: formData.status,
      };

      // Handle setlist assignment
      if (useMultiSet && selectedSets.length > 0) {
        // Multi-set mode: send setlistIds array
        saveData.setlistIds = selectedSets.filter(id => id);
        saveData.setlistId = null;
      } else if (formData.setlistId) {
        // Single setlist mode
        saveData.setlistId = formData.setlistId;
        saveData.setlistIds = null;
      } else {
        saveData.setlistId = null;
        saveData.setlistIds = null;
      }

      await onSave(saveData);
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
    <div className="modal-backdrop">
      <div className="modal-content max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="modal-header">
          <h3>{gig ? 'Edit Event' : 'New Event'}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="modal-label">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  className="modal-input"
                  placeholder="e.g., Friday Night at The Venue"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="modal-label">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => handleChange('type', e.target.value)}
                    className="modal-input"
                  >
                    <option value="GIG">Gig</option>
                    <option value="REHEARSAL">Rehearsal</option>
                    <option value="RECORDING">Recording</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                {gig && (
                  <div>
                    <label className="modal-label">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => handleChange('status', e.target.value)}
                      className="modal-input"
                    >
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="modal-label">
                  Start Date/Time <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => handleChange('startDate', e.target.value)}
                    className="modal-input flex-1"
                    required
                  />
                  <select
                    value={formData.startTime}
                    onChange={(e) => handleChange('startTime', e.target.value)}
                    className="modal-input w-24"
                    required
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      ['00', '30'].map(m => (
                        <option key={`${h}-${m}`} value={`${h.toString().padStart(2, '0')}:${m}`}>
                          {h.toString().padStart(2, '0')}:{m}
                        </option>
                      ))
                    )).flat()}
                  </select>
                </div>
              </div>

              <div>
                <label className="modal-label">End Date/Time</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => handleChange('endDate', e.target.value)}
                    className="modal-input flex-1"
                  />
                  <select
                    value={formData.endTime}
                    onChange={(e) => handleChange('endTime', e.target.value)}
                    className="modal-input w-24"
                    disabled={!formData.endDate}
                  >
                    <option value="">--:--</option>
                    {Array.from({ length: 24 }, (_, h) => (
                      ['00', '30'].map(m => (
                        <option key={`${h}-${m}`} value={`${h.toString().padStart(2, '0')}:${m}`}>
                          {h.toString().padStart(2, '0')}:{m}
                        </option>
                      ))
                    )).flat()}
                  </select>
                </div>
              </div>

              <div>
                <label className="modal-label">Venue</label>
                <input
                  type="text"
                  value={formData.venue}
                  onChange={(e) => handleChange('venue', e.target.value)}
                  className="modal-input"
                  placeholder="Venue name"
                />
              </div>

              <div>
                <label className="modal-label">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  className="modal-input"
                  placeholder="Full address"
                />
              </div>

              {setlists.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="modal-label mb-0">Setlist(s)</label>
                    <button
                      type="button"
                      onClick={() => {
                        setUseMultiSet(!useMultiSet);
                        if (!useMultiSet && formData.setlistId) {
                          setSelectedSets([formData.setlistId]);
                        }
                      }}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        useMultiSet
                          ? 'bg-indigo-600 text-white'
                          : 'bg-[var(--color-modal-border)] text-gray-300 hover:bg-gray-500'
                      }`}
                    >
                      {useMultiSet ? 'Multi-Set Mode' : 'Single Set'}
                    </button>
                  </div>

                  {useMultiSet ? (
                    <div className="space-y-2">
                      {selectedSets.map((setId, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="w-8 h-8 flex items-center justify-center bg-indigo-600/30 text-indigo-300 rounded-full font-bold text-sm">
                            {index + 1}
                          </span>
                          <select
                            value={setId}
                            onChange={(e) => {
                              const newSets = [...selectedSets];
                              newSets[index] = e.target.value;
                              setSelectedSets(newSets);
                            }}
                            className="modal-input flex-1"
                          >
                            <option value="">Select setlist...</option>
                            {setlists.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          {selectedSets.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setSelectedSets(selectedSets.filter((_, i) => i !== index))}
                              className="p-2 text-red-400 hover:text-red-300 min-w-[36px] min-h-[36px]"
                              aria-label="Remove set"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSelectedSets([...selectedSets, ''])}
                        className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                      >
                        + Add Another Set
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formData.setlistId}
                      onChange={(e) => handleChange('setlistId', e.target.value)}
                      className="modal-input"
                    >
                      <option value="">No setlist</option>
                      {setlists.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {formData.type === 'GIG' && (
                <div>
                  <label className="modal-label">Pay ($)</label>
                  <input
                    type="number"
                    value={formData.pay}
                    onChange={(e) => handleChange('pay', e.target.value)}
                    className="modal-input"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
              )}

              <div>
                <label className="modal-label">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  className="modal-input"
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
                className="btn bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
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
