import { useState, useEffect } from 'react';
import api from '../../../services/api';
import BandTimeline from './BandTimeline';

function BandMembersList({ workspaceId }) {
  const [members, setMembers] = useState({ current: [], former: [], all: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadMembers();
  }, [workspaceId]);

  const loadMembers = async () => {
    try {
      setLoading(true);
      const data = await api.getBandMembers(workspaceId);
      setMembers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatYearRange = (startDate, endDate) => {
    const start = new Date(startDate).getFullYear();
    if (!endDate) return `${start}–present`;
    const end = new Date(endDate).getFullYear();
    return start === end ? `${start}` : `${start}–${end}`;
  };

  const getInstrumentColor = (instrument) => {
    const colors = {
      'Vocals': 'bg-purple-600',
      'Lead Guitar': 'bg-red-600',
      'Rhythm Guitar': 'bg-red-500',
      'Guitar': 'bg-red-600',
      'Bass': 'bg-blue-600',
      'Drums': 'bg-green-600',
      'Keyboard': 'bg-orange-500',
      'Piano': 'bg-orange-500',
      'Saxophone': 'bg-yellow-600',
      'Trumpet': 'bg-yellow-500',
      'Violin': 'bg-pink-500',
      'Percussion': 'bg-green-500',
      'DJ': 'bg-cyan-500',
    };
    return colors[instrument] || 'bg-gray-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading band members...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (members.all.length === 0) {
    return (
      <div className="h-full flex flex-col bg-gray-800">
        <div className="flex-shrink-0 p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Band Members</h2>
          <p className="text-gray-400 text-sm mt-1">Member history and timeline</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center py-12 text-gray-400">
            <div className="text-6xl mb-4">👥</div>
            <p className="text-lg mb-2">No band members added yet</p>
            <p className="text-sm">Admins can add members in Settings → Band Members</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Band Members</h2>
        <p className="text-gray-400 text-sm mt-1">Member history and timeline</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Timeline */}
        {members.all.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
              Timeline
            </h3>
            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <BandTimeline members={members.all} />
            </div>
          </div>
        )}

        {/* Current Members */}
        {members.current.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
              Current Members ({members.current.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {members.current.map((member) => (
                <div
                  key={member.id}
                  className="bg-gray-900 rounded-lg p-4 border border-gray-700"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full ${getInstrumentColor(member.instrument)} flex items-center justify-center text-white font-bold text-lg`}>
                      {member.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white truncate">{member.name}</h4>
                      <p className="text-gray-400 text-sm">{member.instrument}</p>
                      <p className="text-gray-500 text-xs mt-1">
                        {formatYearRange(member.startDate, member.endDate)}
                      </p>
                    </div>
                  </div>
                  {member.notes && (
                    <p className="text-gray-500 text-sm mt-3 pt-3 border-t border-gray-700">
                      {member.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Former Members */}
        {members.former.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
              Former Members ({members.former.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {members.former.map((member) => (
                <div
                  key={member.id}
                  className="bg-gray-900 rounded-lg p-4 border border-gray-700 opacity-75"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full ${getInstrumentColor(member.instrument)} flex items-center justify-center text-white font-bold text-lg opacity-60`}>
                      {member.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white truncate">{member.name}</h4>
                      <p className="text-gray-400 text-sm">{member.instrument}</p>
                      <p className="text-gray-500 text-xs mt-1">
                        {formatYearRange(member.startDate, member.endDate)}
                      </p>
                    </div>
                  </div>
                  {member.notes && (
                    <p className="text-gray-500 text-sm mt-3 pt-3 border-t border-gray-700">
                      {member.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-8 pt-4 border-t border-gray-700">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            Instrument Colors
          </h3>
          <div className="flex flex-wrap gap-3">
            {[
              { name: 'Vocals', color: 'bg-purple-600' },
              { name: 'Guitar', color: 'bg-red-600' },
              { name: 'Bass', color: 'bg-blue-600' },
              { name: 'Drums', color: 'bg-green-600' },
              { name: 'Keyboard', color: 'bg-orange-500' },
              { name: 'Other', color: 'bg-gray-500' },
            ].map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded ${item.color}`} />
                <span className="text-sm text-gray-400">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BandMembersList;
