import { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from 'date-fns';
import api from '../../services/api';
import GigForm from './GigForm';

function GigCalendar({ workspaceId }) {
  const [gigs, setGigs] = useState([]);
  const [setlists, setSetlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editingGig, setEditingGig] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [view, setView] = useState('calendar'); // calendar or list
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [gigsData, setlistsData] = await Promise.all([
        api.getGigs(workspaceId),
        api.getSetlists(workspaceId)
      ]);
      setGigs(gigsData);
      setSetlists(setlistsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGig = async (gigData) => {
    try {
      if (editingGig) {
        const updated = await api.updateGig(editingGig.id, gigData);
        setGigs(prev => prev.map(g => g.id === updated.id ? updated : g));
      } else {
        const created = await api.createGig(workspaceId, gigData);
        setGigs(prev => [...prev, created]);
      }
      setShowForm(false);
      setEditingGig(null);
      setSelectedDate(null);
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteGig = async (gigId) => {
    if (!confirm('Delete this event?')) return;
    try {
      await api.deleteGig(gigId);
      setGigs(prev => prev.filter(g => g.id !== gigId));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCompleteGig = async (gig) => {
    try {
      const updated = await api.completeGig(gig.id, []);
      setGigs(prev => prev.map(g => g.id === updated.id ? updated : g));
    } catch (err) {
      alert(err.message);
    }
  };

  // Calendar calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad to start on Sunday
  const startDay = monthStart.getDay();
  const paddingDays = Array(startDay).fill(null);

  const gigsByDate = useMemo(() => {
    const map = {};
    gigs.forEach(gig => {
      const dateKey = format(new Date(gig.date), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(gig);
    });
    return map;
  }, [gigs]);

  const filteredGigs = filterType
    ? gigs.filter(g => g.type === filterType)
    : gigs;

  const upcomingGigs = filteredGigs
    .filter(g => new Date(g.date) >= new Date() && g.status !== 'CANCELLED')
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const getTypeColor = (type) => {
    switch (type) {
      case 'GIG': return 'bg-green-500';
      case 'REHEARSAL': return 'bg-blue-500';
      case 'RECORDING': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED': return <span className="text-xs px-1.5 py-0.5 bg-green-900/50 text-green-300 rounded">Done</span>;
      case 'CANCELLED': return <span className="text-xs px-1.5 py-0.5 bg-red-900/50 text-red-300 rounded">Cancelled</span>;
      default: return null;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading calendar...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Calendar</h2>
          <div className="flex items-center gap-3">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
            >
              <option value="">All Events</option>
              <option value="GIG">Gigs</option>
              <option value="REHEARSAL">Rehearsals</option>
              <option value="RECORDING">Recording</option>
              <option value="OTHER">Other</option>
            </select>
            <div className="flex bg-gray-700 rounded overflow-hidden">
              <button
                onClick={() => setView('calendar')}
                className={`px-3 py-2 text-sm ${view === 'calendar' ? 'bg-slack-purple text-white' : 'text-gray-300'}`}
              >
                Calendar
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-3 py-2 text-sm ${view === 'list' ? 'bg-slack-purple text-white' : 'text-gray-300'}`}
              >
                List
              </button>
            </div>
            <button
              onClick={() => {
                setEditingGig(null);
                setSelectedDate(null);
                setShowForm(true);
              }}
              className="btn btn-primary"
            >
              + Add Event
            </button>
          </div>
        </div>

        {view === 'calendar' && (
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
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}

        {view === 'calendar' ? (
          /* Calendar View */
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
              {paddingDays.map((_, i) => (
                <div key={`pad-${i}`} className="p-2 min-h-[100px] border-t border-gray-700 bg-gray-900/50" />
              ))}
              {daysInMonth.map(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const dayGigs = gigsByDate[dateKey] || [];
                const filteredDayGigs = filterType
                  ? dayGigs.filter(g => g.type === filterType)
                  : dayGigs;

                return (
                  <div
                    key={dateKey}
                    onClick={() => {
                      setSelectedDate(day);
                      setEditingGig(null);
                      setShowForm(true);
                    }}
                    className={`p-2 min-h-[100px] border-t border-gray-700 cursor-pointer hover:bg-gray-700/50 transition-colors ${
                      !isSameMonth(day, currentMonth) ? 'bg-gray-900/50' : ''
                    } ${isToday(day) ? 'bg-blue-900/20' : ''}`}
                  >
                    <div className={`text-sm mb-1 ${
                      isToday(day) ? 'text-blue-400 font-bold' : 'text-gray-400'
                    }`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1">
                      {filteredDayGigs.slice(0, 3).map(gig => (
                        <div
                          key={gig.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingGig(gig);
                            setShowForm(true);
                          }}
                          className={`text-xs p-1 rounded text-white truncate ${getTypeColor(gig.type)} ${
                            gig.status === 'CANCELLED' ? 'opacity-50 line-through' : ''
                          }`}
                        >
                          {gig.title}
                        </div>
                      ))}
                      {filteredDayGigs.length > 3 && (
                        <div className="text-xs text-gray-500">
                          +{filteredDayGigs.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* List View */
          <div className="space-y-4">
            {upcomingGigs.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                No upcoming events
              </div>
            ) : (
              upcomingGigs.map(gig => (
                <div
                  key={gig.id}
                  className="bg-gray-800 rounded-lg p-4 border border-gray-700"
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-2 h-full rounded ${getTypeColor(gig.type)}`} />
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-white font-medium">{gig.title}</h3>
                          <p className="text-gray-400 text-sm">
                            {format(new Date(gig.date), 'EEEE, MMMM d, yyyy')} at {format(new Date(gig.date), 'h:mm a')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(gig.status)}
                          <span className={`text-xs px-2 py-1 rounded ${getTypeColor(gig.type)} text-white`}>
                            {gig.type}
                          </span>
                        </div>
                      </div>

                      {(gig.venue || gig.address) && (
                        <p className="text-gray-400 text-sm mt-2">
                          📍 {gig.venue}{gig.address && ` - ${gig.address}`}
                        </p>
                      )}

                      {gig.setlist && (
                        <p className="text-gray-400 text-sm mt-1">
                          🎵 Setlist: {gig.setlist.name}
                        </p>
                      )}

                      {gig.pay && (
                        <p className="text-green-400 text-sm mt-1">
                          💰 ${gig.pay}
                        </p>
                      )}

                      {gig.notes && (
                        <p className="text-gray-500 text-sm mt-2 italic">{gig.notes}</p>
                      )}

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => {
                            setEditingGig(gig);
                            setShowForm(true);
                          }}
                          className="text-sm text-gray-400 hover:text-white"
                        >
                          Edit
                        </button>
                        {gig.status === 'SCHEDULED' && (
                          <button
                            onClick={() => handleCompleteGig(gig)}
                            className="text-sm text-green-400 hover:text-green-300"
                          >
                            Mark Complete
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteGig(gig.id)}
                          className="text-sm text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Gig Form Modal */}
      {showForm && (
        <GigForm
          gig={editingGig}
          defaultDate={selectedDate}
          setlists={setlists}
          onSave={handleSaveGig}
          onClose={() => {
            setShowForm(false);
            setEditingGig(null);
            setSelectedDate(null);
          }}
        />
      )}
    </div>
  );
}

export default GigCalendar;
