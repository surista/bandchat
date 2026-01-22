import { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, subDays, addDays, isSameMonth, isToday, isSameDay } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const STATUS_COLORS = {
  AVAILABLE: 'bg-green-500',
  UNAVAILABLE: 'bg-red-500',
  MAYBE: 'bg-yellow-500',
  UNKNOWN: 'bg-gray-600'
};

const STATUS_LABELS = {
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  MAYBE: 'Maybe',
  UNKNOWN: 'Not Set'
};

function AvailabilityCalendar({ workspaceId, workspace }) {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('personal'); // 'personal' or 'team'
  const [selectedDate, setSelectedDate] = useState(null);
  const [saving, setSaving] = useState(false);

  // Get workspace members
  const members = useMemo(() => {
    return workspace?.members?.map(m => m.user) || [];
  }, [workspace]);

  useEffect(() => {
    loadAvailability();
  }, [workspaceId, currentMonth]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (selectedDate) return; // Don't navigate if modal open
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentMonth(prev => subMonths(prev, 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentMonth(prev => addMonths(prev, 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDate]);

  const loadAvailability = async () => {
    try {
      setLoading(true);
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      // Extend range to include visible days from prev/next months
      const startDate = format(subDays(monthStart, 7), 'yyyy-MM-dd');
      const endDate = format(addDays(monthEnd, 7), 'yyyy-MM-dd');

      const data = await api.getAvailability(workspaceId, startDate, endDate);
      setAvailability(data);
    } catch (err) {
      console.error('Failed to load availability:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetStatus = async (date, status) => {
    setSaving(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      if (status === 'CLEAR') {
        await api.clearAvailability(workspaceId, dateStr);
        setAvailability(prev => prev.filter(a =>
          !(a.userId === user.id && format(new Date(a.date), 'yyyy-MM-dd') === dateStr)
        ));
      } else {
        const result = await api.setAvailability(workspaceId, dateStr, status);
        setAvailability(prev => {
          const existing = prev.findIndex(a =>
            a.userId === user.id && format(new Date(a.date), 'yyyy-MM-dd') === dateStr
          );
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = result;
            return updated;
          }
          return [...prev, result];
        });
      }
      setSelectedDate(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Calendar calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startDay = monthStart.getDay();
  const endDay = monthEnd.getDay();

  const prevMonthDays = startDay > 0
    ? eachDayOfInterval({ start: subDays(monthStart, startDay), end: subDays(monthStart, 1) })
    : [];
  const currentMonthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const nextMonthDays = endDay < 6
    ? eachDayOfInterval({ start: addDays(monthEnd, 1), end: addDays(monthEnd, 6 - endDay) })
    : [];
  const calendarDays = [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];

  // Group availability by date and user
  const availabilityByDate = useMemo(() => {
    const map = {};
    availability.forEach(a => {
      const dateKey = format(new Date(a.date), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = {};
      map[dateKey][a.userId] = a;
    });
    return map;
  }, [availability]);

  // Get my status for a date
  const getMyStatus = (date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return availabilityByDate[dateKey]?.[user?.id]?.status || 'UNKNOWN';
  };

  // Get team summary for a date
  const getTeamSummary = (date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayData = availabilityByDate[dateKey] || {};

    const summary = { available: 0, unavailable: 0, maybe: 0, unknown: 0 };
    members.forEach(member => {
      const status = dayData[member.id]?.status || 'UNKNOWN';
      switch (status) {
        case 'AVAILABLE': summary.available++; break;
        case 'UNAVAILABLE': summary.unavailable++; break;
        case 'MAYBE': summary.maybe++; break;
        default: summary.unknown++; break;
      }
    });
    return summary;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Availability</h2>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-700 rounded overflow-hidden">
              <button
                onClick={() => setView('personal')}
                className={`px-3 py-2 text-sm ${view === 'personal' ? 'bg-slack-purple text-white' : 'text-gray-300'}`}
              >
                My Availability
              </button>
              <button
                onClick={() => setView('team')}
                className={`px-3 py-2 text-sm ${view === 'team' ? 'bg-slack-purple text-white' : 'text-gray-300'}`}
              >
                Team View
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 text-gray-400 hover:text-white"
          >
            ← Prev
          </button>
          <h3 className="text-lg font-medium text-white">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 text-gray-400 hover:text-white"
          >
            Next →
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-gray-400">Available</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span className="text-gray-400">Maybe</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-gray-400">Unavailable</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-gray-600"></div>
            <span className="text-gray-400">Not Set</span>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            Loading availability...
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            {/* Day Headers */}
            <div className="grid grid-cols-7 bg-gray-700">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="p-2 text-center text-gray-400 text-sm font-medium">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7">
              {calendarDays.map(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const myStatus = getMyStatus(day);
                const teamSummary = getTeamSummary(day);

                return (
                  <div
                    key={dateKey}
                    onClick={() => view === 'personal' && setSelectedDate(day)}
                    className={`p-2 min-h-[80px] border-t border-gray-700 ${
                      view === 'personal' ? 'cursor-pointer hover:bg-gray-700/50' : ''
                    } ${!isCurrentMonth ? 'bg-gray-900/70' : ''} ${
                      isToday(day) ? 'bg-blue-900/20' : ''
                    }`}
                  >
                    <div className={`text-sm mb-1 flex items-center justify-between ${
                      isToday(day) ? 'text-blue-400 font-bold' : isCurrentMonth ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      <span>{format(day, 'd')}</span>
                      {view === 'personal' && myStatus !== 'UNKNOWN' && (
                        <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[myStatus]}`} />
                      )}
                    </div>

                    {view === 'team' && (
                      <div className="space-y-1">
                        {/* Summary bars */}
                        <div className="flex gap-0.5 h-2">
                          {teamSummary.available > 0 && (
                            <div
                              className="bg-green-500 rounded-sm"
                              style={{ flex: teamSummary.available }}
                              title={`${teamSummary.available} available`}
                            />
                          )}
                          {teamSummary.maybe > 0 && (
                            <div
                              className="bg-yellow-500 rounded-sm"
                              style={{ flex: teamSummary.maybe }}
                              title={`${teamSummary.maybe} maybe`}
                            />
                          )}
                          {teamSummary.unavailable > 0 && (
                            <div
                              className="bg-red-500 rounded-sm"
                              style={{ flex: teamSummary.unavailable }}
                              title={`${teamSummary.unavailable} unavailable`}
                            />
                          )}
                          {teamSummary.unknown > 0 && (
                            <div
                              className="bg-gray-600 rounded-sm"
                              style={{ flex: teamSummary.unknown }}
                              title={`${teamSummary.unknown} not set`}
                            />
                          )}
                        </div>
                        {/* Count */}
                        <div className="text-xs text-gray-500">
                          {teamSummary.available}/{members.length}
                        </div>
                      </div>
                    )}

                    {view === 'personal' && myStatus !== 'UNKNOWN' && (
                      <div className={`text-xs mt-1 ${
                        myStatus === 'AVAILABLE' ? 'text-green-400' :
                        myStatus === 'UNAVAILABLE' ? 'text-red-400' :
                        'text-yellow-400'
                      }`}>
                        {STATUS_LABELS[myStatus]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Team Detail View */}
        {view === 'team' && !loading && (
          <div className="mt-4 bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-medium text-white mb-3">Team Members</h3>
            <div className="space-y-2">
              {members.map(member => (
                <div key={member.id} className="flex items-center gap-3 p-2 bg-gray-900 rounded">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slack-purple flex items-center justify-center text-white text-sm">
                      {member.displayName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-white flex-1">{member.displayName}</span>
                  <span className="text-gray-400 text-sm">
                    {member.id === user?.id && '(You)'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Set Status Modal */}
      {selectedDate && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedDate(null)}
        >
          <div
            className="bg-gray-800 rounded-lg p-6 w-full max-w-sm border border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white mb-2">
              Set Availability
            </h3>
            <p className="text-gray-400 mb-4">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleSetStatus(selectedDate, 'AVAILABLE')}
                disabled={saving}
                className="w-full flex items-center gap-3 p-3 rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-50"
              >
                <div className="w-4 h-4 rounded-full bg-green-300"></div>
                Available
              </button>
              <button
                onClick={() => handleSetStatus(selectedDate, 'MAYBE')}
                disabled={saving}
                className="w-full flex items-center gap-3 p-3 rounded bg-yellow-600 hover:bg-yellow-500 text-white disabled:opacity-50"
              >
                <div className="w-4 h-4 rounded-full bg-yellow-300"></div>
                Maybe
              </button>
              <button
                onClick={() => handleSetStatus(selectedDate, 'UNAVAILABLE')}
                disabled={saving}
                className="w-full flex items-center gap-3 p-3 rounded bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
              >
                <div className="w-4 h-4 rounded-full bg-red-300"></div>
                Unavailable
              </button>
              {getMyStatus(selectedDate) !== 'UNKNOWN' && (
                <button
                  onClick={() => handleSetStatus(selectedDate, 'CLEAR')}
                  disabled={saving}
                  className="w-full flex items-center gap-3 p-3 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50"
                >
                  <div className="w-4 h-4 rounded-full bg-gray-500"></div>
                  Clear
                </button>
              )}
            </div>

            <button
              onClick={() => setSelectedDate(null)}
              className="w-full mt-4 p-2 text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AvailabilityCalendar;
