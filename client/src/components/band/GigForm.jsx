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

function GigForm({ gig, defaultDate, setlists, onSave, onClose, onDelete, isAdmin, workspaceId, workspaceMembers = [], previousEvents = [] }) {
  const getDefaultDate = () => {
    if (gig?.date) return format(new Date(gig.date), 'yyyy-MM-dd');
    if (defaultDate) return format(defaultDate, 'yyyy-MM-dd');
    return format(new Date(), 'yyyy-MM-dd');
  };

  // Get time in HH:MM format from a date, or return default
  const getTimeFromDate = (dateVal, defaultTime) => {
    if (dateVal) {
      const d = new Date(dateVal);
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes();
      // Round to nearest half hour
      const roundedMins = mins < 15 ? '00' : mins < 45 ? '30' : '00';
      const finalHours = mins >= 45 ? ((d.getHours() + 1) % 24).toString().padStart(2, '0') : hours;
      return `${finalHours}:${roundedMins}`;
    }
    return defaultTime;
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
    type: gig?.type || 'REHEARSAL',
    startDate: getDefaultDate(),
    startTime: getTimeFromDate(gig?.date, '19:00'),
    endTime: getTimeFromDate(gig?.endDate, '21:00'),
    venue: gig?.venue || '',
    address: gig?.address || '',
    notes: gig?.notes || '',
    pay: gig?.pay || '',
    status: gig?.status || 'SCHEDULED',
    setlistId: gig?.setlistId || '',
    isLocked: gig?.isLocked || false,
    isPersonal: gig?.isPersonal || false
  });

  // Time dropdown visibility
  const [showStartTimeDropdown, setShowStartTimeDropdown] = useState(false);
  const [showEndTimeDropdown, setShowEndTimeDropdown] = useState(false);

  // Generate time options (00:00 to 23:30 in 30-min increments)
  const timeOptions = [];
  for (let h = 0; h < 24; h++) {
    timeOptions.push(`${h.toString().padStart(2, '0')}:00`);
    timeOptions.push(`${h.toString().padStart(2, '0')}:30`);
  }
  const [selectedSets, setSelectedSets] = useState(getInitialSets());
  const [useMultiSet, setUseMultiSet] = useState((gig?.setlists?.length || 0) > 1);
  const [selectedAttendees, setSelectedAttendees] = useState(
    gig?.attendees?.map(a => a.bandMemberId || a.bandMember?.id) || []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availabilitySummary, setAvailabilitySummary] = useState(null);
  const [bandMembers, setBandMembers] = useState({ current: [], former: [], guests: [] });
  const [showMoreAttendees, setShowMoreAttendees] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);

  // Get unique titles and venues from previous events, filtered by type
  const getSuggestions = (field, eventType) => {
    const filtered = previousEvents.filter(e => {
      if (eventType && e.type !== eventType) return false;
      return e[field] && e[field].trim();
    });
    // Get unique values, sorted by most recent first (most frequently used)
    const counts = {};
    filtered.forEach(e => {
      const val = e[field].trim();
      counts[val] = (counts[val] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([val]) => val);
  };

  const titleSuggestions = getSuggestions('title', formData.type);
  const venueSuggestions = getSuggestions('venue', formData.type);

  // Filter suggestions based on current input
  const filteredTitleSuggestions = titleSuggestions.filter(t =>
    t.toLowerCase().includes(formData.title.toLowerCase()) && t !== formData.title
  );
  const filteredVenueSuggestions = venueSuggestions.filter(v =>
    v.toLowerCase().includes(formData.venue.toLowerCase()) && v !== formData.venue
  );

  // Fetch availability summary when date changes
  useEffect(() => {
    if (workspaceId && formData.startDate) {
      api.getAvailabilitySummary(workspaceId, formData.startDate)
        .then(setAvailabilitySummary)
        .catch(err => console.error('Failed to load availability:', err));
    }
  }, [workspaceId, formData.startDate]);

  // Fetch band members for former/guest selection
  useEffect(() => {
    if (workspaceId) {
      api.getBandMembers(workspaceId)
        .then(setBandMembers)
        .catch(err => console.error('Failed to load band members:', err));
    }
  }, [workspaceId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Combine date and time fields
      const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
      const endDateTime = new Date(`${formData.startDate}T${formData.endTime}`);

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
      // IMPORTANT: Only send setlistIds if actually using multi-set mode
      // Sending setlistIds: null was causing the server to clear setlistId
      if (useMultiSet && selectedSets.length > 0) {
        // Multi-set mode: send setlistIds array, clear legacy setlistId
        saveData.setlistIds = selectedSets.filter(id => id);
        saveData.setlistId = null;
      } else if (formData.setlistId) {
        // Single setlist mode - only send setlistId
        saveData.setlistId = formData.setlistId;
      }
      // If neither, don't send any setlist fields - preserve existing value on server

      // Include attendees (band member IDs)
      saveData.bandMemberIds = selectedAttendees;

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
      <div className="modal-content max-w-lg max-h-modal overflow-y-auto">
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
              <div className="relative">
                <label className="modal-label">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  onFocus={() => setShowTitleSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 150)}
                  className="modal-input"
                  placeholder="e.g., Friday Night at The Venue"
                  required
                />
                {showTitleSuggestions && filteredTitleSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg shadow-lg">
                    {filteredTitleSuggestions.slice(0, 8).map(title => (
                      <button
                        key={title}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleChange('title', title);
                          // Also auto-fill venue if we have it from a matching previous event
                          const matchingEvent = previousEvents.find(e => e.title === title && e.type === formData.type);
                          if (matchingEvent?.venue && !formData.venue) {
                            handleChange('venue', matchingEvent.venue);
                            if (matchingEvent.address) {
                              handleChange('address', matchingEvent.address);
                            }
                          }
                          setShowTitleSuggestions(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-700 text-gray-300"
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                )}
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

              <div className="relative">
                <label className="modal-label">
                  Date <span className="text-red-400">*</span>
                </label>
                <div
                  className="modal-input cursor-pointer flex items-center justify-between"
                  onClick={() => document.getElementById('gig-date-picker').showPicker?.() || document.getElementById('gig-date-picker').click()}
                >
                  <span>
                    {formData.startDate
                      ? format(new Date(formData.startDate + 'T00:00:00'), 'd-MMM-yyyy')
                      : 'Select date'}
                  </span>
                  <span className="text-gray-500">📅</span>
                </div>
                <input
                  id="gig-date-picker"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleChange('startDate', e.target.value)}
                  className="absolute opacity-0 pointer-events-none"
                  style={{ top: 0, left: 0, width: '1px', height: '1px' }}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="modal-label">Start Time</label>
                  <input
                    type="text"
                    value={formData.startTime}
                    onChange={(e) => handleChange('startTime', e.target.value)}
                    onFocus={() => setShowStartTimeDropdown(true)}
                    onBlur={() => setTimeout(() => setShowStartTimeDropdown(false), 150)}
                    className="modal-input w-full"
                    placeholder="19:00"
                    pattern="[0-2][0-9]:[0-5][0-9]"
                  />
                  {showStartTimeDropdown && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg shadow-lg">
                      {timeOptions.map(time => (
                        <button
                          key={time}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleChange('startTime', time);
                            setShowStartTimeDropdown(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 ${
                            formData.startTime === time ? 'bg-blue-600 text-white' : 'text-gray-300'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className="modal-label">End Time</label>
                  <input
                    type="text"
                    value={formData.endTime}
                    onChange={(e) => handleChange('endTime', e.target.value)}
                    onFocus={() => setShowEndTimeDropdown(true)}
                    onBlur={() => setTimeout(() => setShowEndTimeDropdown(false), 150)}
                    className="modal-input w-full"
                    placeholder="21:00"
                    pattern="[0-2][0-9]:[0-5][0-9]"
                  />
                  {showEndTimeDropdown && (
                    <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg shadow-lg">
                      {timeOptions.map(time => (
                        <button
                          key={time}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleChange('endTime', time);
                            setShowEndTimeDropdown(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 ${
                            formData.endTime === time ? 'bg-blue-600 text-white' : 'text-gray-300'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  )}
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

              {/* Attendees Selection - uses band members */}
              {(() => {
                const allBandMembers = [
                  ...(bandMembers.current || []),
                  ...(bandMembers.former || []),
                  ...(bandMembers.guests || [])
                ];
                if (allBandMembers.length === 0) return null;

                // Filter for search
                const filteredMembers = attendeeSearch
                  ? allBandMembers.filter(bm =>
                      bm.name.toLowerCase().includes(attendeeSearch.toLowerCase())
                    )
                  : allBandMembers;

                // Separate current vs former/guest
                const currentMembers = filteredMembers.filter(bm => !bm.isGuest && bandMembers.current?.some(c => c.id === bm.id));
                const otherMembers = filteredMembers.filter(bm => bm.isGuest || bandMembers.former?.some(f => f.id === bm.id) || bandMembers.guests?.some(g => g.id === bm.id));

                return (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="modal-label mb-0">
                        Attending
                        <span className="text-gray-500 font-normal ml-2">
                          ({selectedAttendees.length} selected)
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const allCurrentIds = currentMembers.map(bm => bm.id);
                          const allSelected = allCurrentIds.every(id => selectedAttendees.includes(id));
                          if (allSelected) {
                            // Deselect all current members
                            setSelectedAttendees(selectedAttendees.filter(id => !allCurrentIds.includes(id)));
                          } else {
                            // Select all current members (keep any others already selected)
                            setSelectedAttendees([...new Set([...selectedAttendees, ...allCurrentIds])]);
                          }
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        {currentMembers.every(bm => selectedAttendees.includes(bm.id)) ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    {allBandMembers.length > 6 && (
                      <input
                        type="text"
                        placeholder="Search members..."
                        value={attendeeSearch}
                        onChange={(e) => setAttendeeSearch(e.target.value)}
                        className="w-full px-3 py-1.5 mb-2 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                      />
                    )}

                    {/* Current band members */}
                    <div className="flex flex-wrap gap-2">
                      {currentMembers.map(bm => {
                        const isSelected = selectedAttendees.includes(bm.id);
                        // Get availability status if this band member is linked to a user
                        const availStatus = bm.linkedUserId && availabilitySummary?.members?.find(
                          m => m.user.id === bm.linkedUserId
                        )?.status;

                        return (
                          <button
                            key={bm.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedAttendees(selectedAttendees.filter(id => id !== bm.id));
                              } else {
                                setSelectedAttendees([...selectedAttendees, bm.id]);
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
                            {bm.name.split(' ')[0]}
                          </button>
                        );
                      })}
                    </div>

                    {/* Former/Guest members */}
                    {otherMembers.length > 0 && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setShowMoreAttendees(!showMoreAttendees)}
                          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <span className={`transform transition-transform ${showMoreAttendees ? 'rotate-90' : ''}`}>
                            ▶
                          </span>
                          {showMoreAttendees ? 'Hide' : 'Show'} former/guest members ({otherMembers.length})
                        </button>

                        {showMoreAttendees && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {otherMembers.map(bm => {
                              const isSelected = selectedAttendees.includes(bm.id);
                              const label = bm.isGuest ? 'Guest' : 'Former';

                              return (
                                <button
                                  key={bm.id}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedAttendees(selectedAttendees.filter(id => id !== bm.id));
                                    } else {
                                      setSelectedAttendees([...selectedAttendees, bm.id]);
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                                    isSelected
                                      ? 'bg-green-600 text-white ring-2 ring-green-400'
                                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                  }`}
                                >
                                  {isSelected && <span className="mr-1">✓</span>}
                                  {bm.name}
                                  <span className={`ml-1 text-xs ${bm.isGuest ? 'text-purple-400' : 'text-gray-500'}`}>
                                    ({label})
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedAttendees.length === 0 && (
                      <p className="text-xs text-gray-500 mt-2">
                        Click members to mark them as attending
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="relative">
                <label className="modal-label">Venue</label>
                <input
                  type="text"
                  value={formData.venue}
                  onChange={(e) => handleChange('venue', e.target.value)}
                  onFocus={() => setShowVenueSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowVenueSuggestions(false), 150)}
                  className="modal-input"
                  placeholder="Venue name"
                />
                {showVenueSuggestions && filteredVenueSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg shadow-lg">
                    {filteredVenueSuggestions.slice(0, 8).map(venue => (
                      <button
                        key={venue}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleChange('venue', venue);
                          // Also auto-fill address if we have it from a matching previous event
                          const matchingEvent = previousEvents.find(ev => ev.venue === venue);
                          if (matchingEvent?.address && !formData.address) {
                            handleChange('address', matchingEvent.address);
                          }
                          setShowVenueSuggestions(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-700 text-gray-300"
                      >
                        {venue}
                      </button>
                    ))}
                  </div>
                )}
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
