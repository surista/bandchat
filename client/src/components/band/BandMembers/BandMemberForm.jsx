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
  const [stints, setStints] = useState([{ instrument: '', startDate: '', endDate: '' }]);

  useEffect(() => {
    if (member) {
      setName(member.name || '');
      setNotes(member.notes || '');
      if (member.stints && member.stints.length > 0) {
        setStints(member.stints.map(s => ({
          id: s.id,
          instrument: s.instrument || '',
          startDate: s.startDate ? new Date(s.startDate).toISOString().split('T')[0] : '',
          endDate: s.endDate ? new Date(s.endDate).toISOString().split('T')[0] : ''
        })));
      } else {
        setStints([{ instrument: '', startDate: '', endDate: '' }]);
      }
    } else {
      setName('');
      setNotes('');
      setStints([{ instrument: '', startDate: '', endDate: '' }]);
    }
  }, [member]);

  const handleStintChange = (index, field, value) => {
    setStints(prev => prev.map((stint, i) =>
      i === index ? { ...stint, [field]: value } : stint
    ));
  };

  const addStint = () => {
    setStints(prev => [...prev, { instrument: '', startDate: '', endDate: '' }]);
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
    const validStints = stints.filter(s => s.instrument && s.startDate);
    if (validStints.length === 0) return;

    onSave({
      name,
      notes: notes || null,
      stints: validStints.map(s => ({
        instrument: s.instrument,
        startDate: s.startDate,
        endDate: s.endDate || null
      }))
    });
  };

  const isValid = name && stints.some(s => s.instrument && s.startDate);

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
        <div className="flex items-center justify-between mb-2">
          <label className="text-gray-300 text-sm font-medium">
            Instruments <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={addStint}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            + Add Instrument
          </button>
        </div>

        <div className="space-y-3">
          {stints.map((stint, index) => (
            <div key={index} className="p-3 bg-gray-900 border border-gray-700 rounded-lg">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-3">
                  <select
                    value={stint.instrument}
                    onChange={(e) => handleStintChange(index, 'instrument', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                    required
                  >
                    <option value="">Select instrument...</option>
                    {INSTRUMENTS.map(inst => (
                      <option key={inst} value={inst}>{inst}</option>
                    ))}
                  </select>

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
                    title="Remove"
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
