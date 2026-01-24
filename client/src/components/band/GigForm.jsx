import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import api from '../../services/api';

// Generate Google Calendar URL
const getGoogleCalendarUrl = (gig) => {
  const formatGoogleDate = (date) => {
    return format(new Date(date), "yyyyMMdd'T'HHmmss");
  };

  const startDate = formatGoogleDate(gig.date);
  const endDate = gig.endDate
    ? formatGoogleDate(gig.endDate)
    : formatGoogleDate(new Date(new Date(gig.date).getTime() + 2 * 60 * 60 * 1000));

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: gig.title,
    dates: `${startDate}/${endDate}`,
  });

  if (gig.venue || gig.address) {
    params.append('location', [gig.venue, gig.address].filter(Boolean).join(', '));
  }

  const details = [];
  if (gig.type) details.push(`Type: ${gig.type}`);
  if (gig.notes) details.push(gig.notes);
  if (details.length > 0) {
    params.append('details', details.join('\n'));
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

function GigForm({ gig, defaultDate, setlists, onSave, onClose, onDelete, isAdmin, workspaceId, workspaceMembers = [] }) {
  // Round minutes to nearest half hour
  const roundToHalfHour = (minutes) => minutes < 15 ? '00' : minutes < 45 ? '30' : '00';

  const getDefaultDate = () => {
    if (gig?.date) return format(new Date(gig.date), 'yyyy-MM-dd');
    if (defaultDate) return format(defaultDate, 'yyyy-MM-dd');
    return format(new Date(), 'yyyy-MM-dd');
  };

  // Convert 24-hour time to 12-hour format with AM/PM
  const to12Hour = (dateVal, fallback = { hour: '7', minute: '00', period: 'PM' }) => {
    if (dateVal) {
      const d = new Date(dateVal);
      let hours = d.getHours();
      const mins = roundToHalfHour(d.getMinutes());
      const period = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      if (hours === 0) hours = 12;
      return { hour: hours.toString(), minute: mins, period };
    }
    return fallback;
  };

  // Convert 12-hour format back to 24-hour time string
  const to24Hour = (hour, minute, period) => {
    let h = parseInt(hour);
    if (period === 'AM' && h === 12) h = 0;
    else if (period === 'PM' && h !== 12) h += 12;
    return `${h.toString().padStart(2, '0')}:${minute}`;
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

  const startTime12 = to12Hour(gig?.date, { hour: '7', minute: '00', period: 'PM' });
  const endTime12 = to12Hour(gig?.endDate, { hour: '9', minute: '00', period: 'PM' });

  const [formData, setFormData] = useState({
    title: gig?.title || '',
    type: gig?.type || 'GIG',
    startDate: getDefaultDate(),
    startHour: startTime12.hour,
    startMinute: startTime12.minute,
    startPeriod: startTime12.period,
    endHour: endTime12.hour,
    endMinute: endTime12.minute,
    endPeriod: endTime12.period,
    venue: gig?.venue || '',
    address: gig?.address || '',
    notes: gig?.notes || '',
    pay: gig?.pay || '',
    status: gig?.status || 'SCHEDULED',
    setlistId: gig?.setlistId || '',
    isLocked: gig?.isLocked || false,
    isPersonal: gig?.isPersonal || false
  });
  const [selectedSets, setSelectedSets] = useState(getInitialSets());
  const [useMultiSet, setUseMultiSet] = useState((gig?.setlists?.length || 0) > 1);
  const [selectedAttendees, setSelectedAttendees] = useState(
    gig?.attendees?.map(a => a.userId || a.user?.id) || []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availabilitySummary, setAvailabilitySummary] = useState(null);

  // Fetch availability summary when date changes
  useEffect(() => {
    if (workspaceId && formData.startDate) {
      api.getAvailabilitySummary(workspaceId, formData.startDate)
        .then(setAvailabilitySummary)
        .catch(err => console.error('Failed to load availability:', err));
    }
  }, [workspaceId, formData.startDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Combine date and time fields (convert 12-hour to 24-hour)
      const startTime24 = to24Hour(formData.startHour, formData.startMinute, formData.startPeriod);
      const startDateTime = new Date(`${formData.startDate}T${startTime24}`);

      // End time uses same date as start
      const endTime24 = to24Hour(formData.endHour, formData.endMinute, formData.endPeriod);
      const endDateTime = new Date(`${formData.startDate}T${endTime24}`);

      const saveData = {
        title: formData.title,
        type: formData.type,
        date: startDateTime.toISOString(),
        endDate: endDateTime.toISOString(),
        venue: formData.venue || null,
        address: formData.address || null,
        notes: formData.notes || null,
        pay: formData.pay ? parseFloat(formData.pay) : null,
        status: formData.status,
        isLocked: formData.isLocked,
        isPersonal: formData.isPersonal,
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

      // Include attendees
      saveData.attendeeIds = selectedAttendees;

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
                  Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleChange('startDate', e.target.value)}
                  className="modal-input"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="modal-label">Start Time</label>
                  <div className="flex gap-1">
                    <select
                      value={formData.startHour}
                      onChange={(e) => handleChange('startHour', e.target.value)}
                      className="modal-input flex-1"
                      required
                    >
                      {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => (
                        <option key={h} value={h.toString()}>{h}</option>
                      ))}
                    </select>
                    <select
                      value={formData.startMinute}
                      onChange={(e) => handleChange('startMinute', e.target.value)}
                      className="modal-input w-14"
                      required
                    >
                      <option value="00">:00</option>
                      <option value="30">:30</option>
                    </select>
                    <select
                      value={formData.startPeriod}
                      onChange={(e) => handleChange('startPeriod', e.target.value)}
                      className="modal-input w-14"
                      required
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="modal-label">End Time</label>
                  <div className="flex gap-1">
                    <select
                      value={formData.endHour}
                      onChange={(e) => handleChange('endHour', e.target.value)}
                      className="modal-input flex-1"
                      required
                    >
                      {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => (
                        <option key={h} value={h.toString()}>{h}</option>
                      ))}
                    </select>
                    <select
                      value={formData.endMinute}
                      onChange={(e) => handleChange('endMinute', e.target.value)}
                      className="modal-input w-14"
                      required
                    >
                      <option value="00">:00</option>
                      <option value="30">:30</option>
                    </select>
                    <select
                      value={formData.endPeriod}
                      onChange={(e) => handleChange('endPeriod', e.target.value)}
                      className="modal-input w-14"
                      required
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Availability Summary */}
              {availabilitySummary && availabilitySummary.total > 0 && (
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Team Availability</span>
                    <span className="text-sm font-medium">
                      <span className="text-green-400">{availabilitySummary.available}</span>
                      <span className="text-gray-500">/{availabilitySummary.total}</span>
                    </span>
                  </div>
                  <div className="flex gap-0.5 h-2 rounded overflow-hidden mb-2">
                    {availabilitySummary.available > 0 && (
                      <div className="bg-green-500" style={{ flex: availabilitySummary.available }} />
                    )}
                    {availabilitySummary.maybe > 0 && (
                      <div className="bg-yellow-500" style={{ flex: availabilitySummary.maybe }} />
                    )}
                    {availabilitySummary.unavailable > 0 && (
                      <div className="bg-red-500" style={{ flex: availabilitySummary.unavailable }} />
                    )}
                    {availabilitySummary.unknown > 0 && (
                      <div className="bg-gray-600" style={{ flex: availabilitySummary.unknown }} />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {availabilitySummary.members?.map(m => (
                      <span
                        key={m.user.id}
                        className={`px-2 py-0.5 rounded ${
                          m.status === 'AVAILABLE' ? 'bg-green-900/50 text-green-300' :
                          m.status === 'UNAVAILABLE' ? 'bg-red-900/50 text-red-300' :
                          m.status === 'MAYBE' ? 'bg-yellow-900/50 text-yellow-300' :
                          'bg-gray-700 text-gray-400'
                        }`}
                        title={m.note || m.status}
                      >
                        {m.user.displayName?.split(' ')[0]}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Attendees Selection */}
              {workspaceMembers.length > 0 && (
                <div>
                  <label className="modal-label">
                    Attending
                    <span className="text-gray-500 font-normal ml-2">
                      ({selectedAttendees.length} selected)
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {workspaceMembers.map(member => {
                      const userId = member.user?.id || member.userId;
                      const displayName = member.user?.displayName || member.displayName;
                      const isSelected = selectedAttendees.includes(userId);

                      // Get availability status for this member if available
                      const availStatus = availabilitySummary?.members?.find(
                        m => m.user.id === userId
                      )?.status;

                      return (
                        <button
                          key={userId}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedAttendees(selectedAttendees.filter(id => id !== userId));
                            } else {
                              setSelectedAttendees([...selectedAttendees, userId]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                            isSelected
                              ? 'bg-green-600 text-white ring-2 ring-green-400'
                              : availStatus === 'UNAVAILABLE'
                              ? 'bg-gray-700 text-red-400 hover:bg-gray-600'
                              : availStatus === 'MAYBE'
                              ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {isSelected && <span className="mr-1">✓</span>}
                          {displayName?.split(' ')[0]}
                        </button>
                      );
                    })}
                  </div>
                  {selectedAttendees.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Click members to mark them as attending
                    </p>
                  )}
                </div>
              )}

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

              {setlists.length > 0 && formData.type === 'GIG' && (
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

              {/* Visibility options */}
              <div className="space-y-3 pt-2 border-t border-gray-700">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPersonal}
                    onChange={(e) => handleChange('isPersonal', e.target.checked)}
                    className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-gray-200">Personal entry</span>
                    <p className="text-xs text-gray-500">Only you can see this event</p>
                  </div>
                </label>

                {isAdmin && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isLocked}
                      onChange={(e) => handleChange('isLocked', e.target.checked)}
                      className="rounded bg-gray-700 border-gray-600 text-yellow-500 focus:ring-yellow-500"
                    />
                    <div>
                      <span className="text-gray-200">Lock event</span>
                      <p className="text-xs text-gray-500">Only admins can edit or delete</p>
                    </div>
                  </label>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-6 flex-wrap">
              {gig && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(gig.id)}
                  className="btn bg-red-600 hover:bg-red-700 text-white"
                >
                  Delete
                </button>
              )}
              {gig && (
                <a
                  href={getGoogleCalendarUrl(gig)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn bg-orange-600 hover:bg-orange-700 text-white"
                >
                  + Google Cal
                </a>
              )}
              <div className="flex-1" />
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
