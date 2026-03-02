import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../common/ConfirmDialog';
import Skeleton from '../common/Skeleton';

function formatMinutes(totalMinutes) {
  if (!totalMinutes) return '0 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDateHeader(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function groupByDate(sessions) {
  const groups = [];
  let currentDate = null;
  let currentGroup = null;

  for (const session of sessions) {
    const d = new Date(session.practicedAt);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString();

    if (key !== currentDate) {
      currentDate = key;
      currentGroup = { date: session.practicedAt, data: [] };
      groups.push(currentGroup);
    }
    currentGroup.data.push(session);
  }

  return groups;
}

function PracticeDashboard({ workspaceId }) {
  const toast = useToast();
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleteSession, setDeleteSession] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [practiceData, summaryData] = await Promise.all([
        api.getMyPractice(workspaceId),
        api.getPracticeSummary(workspaceId),
      ]);
      setSessions(practiceData.sessions);
      setNextCursor(practiceData.nextCursor);
      setSummary(summaryData);
    } catch (err) {
      toast.error('Failed to load practice data');
      console.error('Failed to load practice data:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api.getMyPractice(workspaceId, nextCursor);
      setSessions(prev => [...prev, ...data.sessions]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      toast.error('Failed to load more sessions');
    } finally {
      setLoadingMore(false);
    }
  }, [workspaceId, nextCursor, loadingMore, toast]);

  const handleDelete = async () => {
    if (!deleteSession) return;
    try {
      await api.deletePracticeSession(deleteSession.id);
      setSessions(prev => prev.filter(s => s.id !== deleteSession.id));
      // Reload summary to update stats
      const summaryData = await api.getPracticeSummary(workspaceId);
      setSummary(summaryData);
      toast.success('Practice session deleted');
    } catch (err) {
      toast.error('Failed to delete session');
    } finally {
      setDeleteSession(null);
    }
  };

  const grouped = groupByDate(sessions);

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 p-4 border-b border-[var(--color-border)]">
          <Skeleton className="h-8 w-48 mb-4" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </div>
        <div className="flex-1 p-4 space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton.Card key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-[var(--color-border)]">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-4">Practice Dashboard</h2>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 text-center border border-[var(--color-border)]">
            <div className="text-2xl font-bold text-[var(--color-primary)]">
              {summary?.streak || 0}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mt-1">
              Day Streak
            </div>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 text-center border border-[var(--color-border)]">
            <div className="text-2xl font-bold text-[var(--color-primary)]">
              {formatMinutes(summary?.totalMinutes || 0)}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mt-1">
              Total Time
            </div>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 text-center border border-[var(--color-border)]">
            <div className="text-2xl font-bold text-[var(--color-primary)]">
              {summary?.totalSessions || 0}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mt-1">
              Sessions
            </div>
          </div>
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-4">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-4xl mb-4">🎸</div>
            <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
              No practice sessions yet
            </h3>
            <p className="text-[var(--color-text-muted)] max-w-sm">
              Log practice sessions from the Songs page to track your progress and build your streak.
            </p>
          </div>
        ) : (
          <>
            {grouped.map(group => (
              <div key={group.date} className="mb-6">
                <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 px-1">
                  {formatDateHeader(group.date)}
                </h3>
                <div className="space-y-2">
                  {group.data.map(session => (
                    <div
                      key={session.id}
                      className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)] flex items-center gap-4 group hover:bg-[var(--color-bg-tertiary)] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[var(--color-text-primary)] font-medium truncate">
                          {session.song?.title || 'Unknown Song'}
                        </div>
                        {session.song?.artist && (
                          <div className="text-sm text-[var(--color-text-muted)] truncate">
                            {session.song.artist}
                          </div>
                        )}
                        {session.notes && (
                          <div className="text-sm text-[var(--color-text-muted)] italic truncate mt-1">
                            {session.notes}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <span className="text-[var(--color-primary)] font-bold">
                          {formatMinutes(session.duration)}
                        </span>
                        <button
                          onClick={() => setDeleteSession(session)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-red-400 transition-all"
                          title="Delete session"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Load More */}
            {nextCursor && (
              <div className="text-center py-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="btn btn-secondary"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteSession !== null}
        title="Delete Session"
        message={`Delete this practice session for "${deleteSession?.song?.title || 'Unknown'}"?`}
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteSession(null)}
      />
    </div>
  );
}

export default PracticeDashboard;
