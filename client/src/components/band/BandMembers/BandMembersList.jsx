import { useState, useEffect } from 'react';
import api from '../../../services/api';
import BandTimeline from './BandTimeline';

function BandMembersList({ workspaceId }) {
  const [members, setMembers] = useState({ current: [], former: [], guests: [], all: [] });
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
      'Harmonica': 'bg-cyan-600',
      'Violin': 'bg-pink-500',
      'Percussion': 'bg-green-500',
      'DJ': 'bg-cyan-500',
    };
    return colors[instrument] || 'bg-gray-500';
  };

  // Get the primary instrument (most recent stint without end date, or most recent stint)
  const getPrimaryInstrument = (member) => {
    if (!member.stints || member.stints.length === 0) {
      return member.isGuest ? 'Guest' : 'Unknown';
    }
    const currentStint = member.stints.find(s => !s.endDate);
    if (currentStint) {
      const instruments = currentStint.instruments || (currentStint.instrument ? [currentStint.instrument] : []);
      return instruments[0] || (member.isGuest ? 'Guest' : 'Unknown');
    }
    // Return the most recent stint
    const sorted = [...member.stints].sort((a, b) =>
      new Date(b.startDate) - new Date(a.startDate)
    );
    const instruments = sorted[0]?.instruments || (sorted[0]?.instrument ? [sorted[0].instrument] : []);
    return instruments[0] || (member.isGuest ? 'Guest' : 'Unknown');
  };

  // Get all unique instruments for a member
  const getInstruments = (member) => {
    if (!member.stints || member.stints.length === 0) return [];
    const allInstruments = member.stints.flatMap(s =>
      s.instruments || (s.instrument ? [s.instrument] : [])
    );
    return [...new Set(allInstruments)];
  };

  // Get year range spanning all stints
  const getMemberYearRange = (member) => {
    if (!member.stints || member.stints.length === 0) return '';
    const starts = member.stints.map(s => new Date(s.startDate).getFullYear());
    const ends = member.stints.map(s => s.endDate ? new Date(s.endDate).getFullYear() : null);
    const minStart = Math.min(...starts);
    const hasOngoing = ends.includes(null);
    if (hasOngoing) return `${minStart}–present`;
    const maxEnd = Math.max(...ends.filter(e => e !== null));
    return minStart === maxEnd ? `${minStart}` : `${minStart}–${maxEnd}`;
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

  const MemberAvatar = ({ member, size = 'md', isCurrent = true }) => {
    const primaryInstrument = getPrimaryInstrument(member);
    const sizeClasses = {
      sm: 'w-6 h-6 text-xs',
      md: 'w-10 h-10 text-lg',
      lg: 'w-14 h-14 text-xl',
    };
    const ringClasses = {
      sm: 'ring-1 ring-offset-1',
      md: 'ring-2 ring-offset-2',
      lg: 'ring-2 ring-offset-2',
    };

    if (member.imageUrl) {
      return (
        <div className={`relative ${sizeClasses[size]} flex-shrink-0`}>
          <img
            src={member.imageUrl}
            alt={member.name}
            className={`${sizeClasses[size]} rounded-full object-cover ${ringClasses[size]} ring-offset-gray-900 ${isCurrent ? 'ring-emerald-500/50' : 'ring-gray-600/50'} transition-all duration-200 hover:ring-emerald-400 hover:scale-105`}
          />
          {/* Instrument indicator dot */}
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${getInstrumentColor(primaryInstrument)}`}
            title={primaryInstrument}
          />
        </div>
      );
    }

    // Fallback to initial letter
    return (
      <div
        className={`${sizeClasses[size]} rounded-full ${getInstrumentColor(primaryInstrument)} flex items-center justify-center text-white font-bold flex-shrink-0 transition-all duration-200 hover:scale-105 hover:brightness-110 ${!isCurrent ? 'opacity-60' : ''}`}
      >
        {member.name.charAt(0)}
      </div>
    );
  };

  const MemberCard = ({ member, isCurrent }) => {
    const primaryInstrument = getPrimaryInstrument(member);
    const instruments = getInstruments(member);
    const yearRange = getMemberYearRange(member);

    return (
      <div
        className={`bg-gray-900 rounded-lg p-4 border border-gray-700 transition-all duration-200 hover:border-gray-600 hover:bg-gray-900/80 ${!isCurrent ? 'opacity-75 hover:opacity-90' : ''}`}
      >
        <div className="flex items-start gap-3">
          <MemberAvatar member={member} size="md" isCurrent={isCurrent} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-white truncate">{member.name}</h4>
              {member.isGuest && (
                <span className="px-1.5 py-0.5 text-xs bg-purple-600/30 text-purple-300 rounded">
                  Guest
                </span>
              )}
            </div>
            {/* Show all instruments */}
            <div className="flex flex-wrap gap-1 mt-1">
              {instruments.length > 0 ? (
                instruments.map((inst, idx) => (
                  <span key={idx} className="text-gray-400 text-sm">
                    {inst}{idx < instruments.length - 1 ? ',' : ''}
                  </span>
                ))
              ) : (
                <span className="text-gray-400 text-sm">
                  {member.isGuest ? 'Guest musician' : 'Unknown'}
                </span>
              )}
            </div>
            {yearRange && <p className="text-gray-500 text-xs mt-1">{yearRange}</p>}
          </div>
        </div>

        {/* Show stint details if multiple */}
        {member.stints && member.stints.length > 1 && (
          <div className="mt-3 pt-3 border-t border-gray-700 space-y-1">
            {member.stints.map((stint, idx) => {
              const stintInstruments = stint.instruments || (stint.instrument ? [stint.instrument] : []);
              return (
                <div key={stint.id || idx} className="flex items-center gap-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${getInstrumentColor(stintInstruments[0])}`} />
                  <span className="text-gray-400">{stintInstruments.join(', ')}</span>
                  <span className="text-gray-500">
                    {formatYearRange(stint.startDate, stint.endDate)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {member.notes && (
          <p className="text-gray-500 text-sm mt-3 pt-3 border-t border-gray-700">
            {member.notes}
          </p>
        )}
      </div>
    );
  };

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
                <MemberCard key={member.id} member={member} isCurrent={true} />
              ))}
            </div>
          </div>
        )}

        {/* Former Members */}
        {members.former.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
              Former Members ({members.former.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {members.former.map((member) => (
                <MemberCard key={member.id} member={member} isCurrent={false} />
              ))}
            </div>
          </div>
        )}

        {/* Guest Musicians */}
        {members.guests && members.guests.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
              Guest Musicians ({members.guests.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {members.guests.map((member) => (
                <MemberCard key={member.id} member={member} isCurrent={false} />
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
