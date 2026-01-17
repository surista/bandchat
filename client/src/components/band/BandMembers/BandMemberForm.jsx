import { useState, useEffect } from 'react';

const INSTRUMENTS = [
  'Vocals',
  'Lead Guitar',
  'Rhythm Guitar',
  'Guitar',
  'Bass',
  'Drums',
  'Keyboard',
  'Piano',
  'Saxophone',
  'Trumpet',
  'Harmonica',
  'Violin',
  'Percussion',
  'DJ',
  'Other'
];

function BandMemberForm({ member, onSave, onCancel, loading }) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [isGuest, setIsGuest] = useState(false);
  const [stints, setStints] = useState([{ instruments: [], startDate: '', endDate: '' }]);

  useEffect(() => {
    if (member) {
      setName(member.name || '');
      setNotes(member.notes || '');
      setIsGuest(member.isGuest || false);
      if (member.stints && member.stints.length > 0) {
        setStints(member.stints.map(s => ({
          id: s.id,
          // Handle both old (instrument) and new (instruments) format
          instruments: s.instruments || (s.instrument ? [s.instrument] : []),
          startDate: s.startDate ? new Date(s.startDate).toISOString().split('T')[0] : '',
          endDate: s.endDate ? new Date(s.endDate).toISOString().split('T')[0] : ''
        })));
      } else {
        setStints([{ instruments: [], startDate: '', endDate: '' }]);
      }
    } else {
      setName('');
      setNotes('');
      setIsGuest(false);
      setStints([{ instruments: [], startDate: '', endDate: '' }]);
    }
  }, [member]);

  const handleStintChange = (index, field, value) => {
    setStints(prev => prev.map((stint, i) =>
      i === index ? { ...stint, [field]: value } : stint
    ));
  };

  const toggleInstrument = (index, instrument) => {
    setStints(prev => prev.map((stint, i) => {
      if (i !== index) return stint;
      const instruments = stint.instruments.includes(instrument)
        ? stint.instruments.filter(inst => inst !== instrument)
        : [...stint.instruments, instrument];
      return { ...stint, instruments };
    }));
  };

  const addStint = () => {
    setStints(prev => [...prev, { instruments: [], startDate: '', endDate: '' }]);
  };

  const removeStint = (index) => {
    if (stints.length > 1) {
      setStints(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate
    if (!name) return;
    const validStints = stints.filter(s => s.instruments.length > 0 && s.startDate);
    if (validStints.length === 0) return;

    onSave({
      name,
      notes: notes || null,
      isGuest,
      stints: validStints.map(s => ({
        instruments: s.instruments,
        startDate: s.startDate,
        endDate: s.endDate || null
      }))
    });
  };

  const isValid = name && stints.some(s => s.instruments.length > 0 && s.startDate);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-gray-300 text-sm font-medium mb-2">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Member name"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
          required
        />
      </div>

      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isGuest}
            onChange={(e) => setIsGuest(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-purple-600 focus:ring-purple-500"
          />
          <span className="text-gray-300 text-sm font-medium">Guest Member</span>
          <span className="text-gray-500 text-xs">(session/touring musician)</span>
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-gray-300 text-sm font-medium">
            Instrument Stints <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={addStint}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            + Add Stint
          </button>
        </div>

        <div className="space-y-3">
          {stints.map((stint, index) => (
            <div key={index} className="p-3 bg-gray-900 border border-gray-700 rounded-lg">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-3">
                  {/* Instrument checkboxes */}
                  <div>
                    <label className="block text-gray-400 text-xs mb-2">Instruments (select all that apply)</label>
                    <div className="flex flex-wrap gap-2">
                      {INSTRUMENTS.map(inst => (
                        <button
                          key={inst}
                          type="button"
                          onClick={() => toggleInstrument(index, inst)}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            stint.instruments.includes(inst)
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {inst}
                        </button>
                      ))}
                    </div>
                    {stint.instruments.length > 0 && (
                      <div className="mt-2 text-sm text-green-400">
                        Selected: {stint.instruments.join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">From</label>
                      <input
                        type="date"
                        value={stint.startDate}
                        onChange={(e) => handleStintChange(index, 'startDate', e.target.value)}
                        className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">To (empty = present)</label>
                      <input
                        type="date"
                        value={stint.endDate}
                        onChange={(e) => handleStintChange(index, 'endDate', e.target.value)}
                        className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                      />
                    </div>
                  </div>
                </div>

                {stints.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStint(index)}
                    className="text-red-400 hover:text-red-300 p-1"
                    title="Remove stint"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-gray-300 text-sm font-medium mb-2">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional notes..."
          rows={2}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white resize-none"
        />
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !isValid}
          className="btn bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-600"
        >
          {loading ? 'Saving...' : (member ? 'Update Member' : 'Add Member')}
        </button>
      </div>
    </form>
  );
}

export default BandMemberForm;
