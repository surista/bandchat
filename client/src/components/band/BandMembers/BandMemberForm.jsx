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
  'Violin',
  'Percussion',
  'DJ',
  'Other'
];

function BandMemberForm({ member, onSave, onCancel, loading }) {
  const [name, setName] = useState('');
  const [instrument, setInstrument] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (member) {
      setName(member.name || '');
      setInstrument(member.instrument || '');
      setStartDate(member.startDate ? new Date(member.startDate).toISOString().split('T')[0] : '');
      setEndDate(member.endDate ? new Date(member.endDate).toISOString().split('T')[0] : '');
      setNotes(member.notes || '');
    } else {
      setName('');
      setInstrument('');
      setStartDate('');
      setEndDate('');
      setNotes('');
    }
  }, [member]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || !instrument || !startDate) return;

    onSave({
      name,
      instrument,
      startDate,
      endDate: endDate || null,
      notes: notes || null
    });
  };

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
        <label className="block text-gray-300 text-sm font-medium mb-2">
          Instrument <span className="text-red-500">*</span>
        </label>
        <select
          value={instrument}
          onChange={(e) => setInstrument(e.target.value)}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
          required
        >
          <option value="">Select instrument...</option>
          {INSTRUMENTS.map(inst => (
            <option key={inst} value={inst}>{inst}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-gray-300 text-sm font-medium mb-2">
            Start Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
            required
          />
        </div>

        <div>
          <label className="block text-gray-300 text-sm font-medium mb-2">
            End Date <span className="text-gray-500 text-xs">(leave empty if current)</span>
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
          />
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
          disabled={loading || !name || !instrument || !startDate}
          className="btn bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-600"
        >
          {loading ? 'Saving...' : (member ? 'Update Member' : 'Add Member')}
        </button>
      </div>
    </form>
  );
}

export default BandMemberForm;
