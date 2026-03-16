import { useState, useEffect, useCallback, memo } from 'react';
import { format } from 'date-fns';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { escapeHtml } from '../../utils/escapeHtml';
import { formatDuration } from '../../utils/formatDuration';
import SetlistBuilder from './SetlistBuilder';
import Modal from '../common/Modal';
import ConfirmDialog from '../common/ConfirmDialog';
import ActionDropdown from '../common/ActionDropdown';
import ContextMenu from '../common/ContextMenu';
import useLongPress from '../../hooks/useLongPress';
import Skeleton from '../common/Skeleton';
import ErrorMessage from '../common/ErrorMessage';
import LiveMode from './LiveMode';

const SetlistCard = memo(function SetlistCard({ setlist, onTap, onEdit, onRename, onDuplicate, onDelete, onContextMenu, calculateDuration, formatTime12h }) {
  const longPress = useLongPress({
    onLongPress: (pos) => onContextMenu(pos),
    onTap,
  });

  return (
    <div
      className="bg-[var(--color-bg-secondary)] rounded-lg p-4 hover:bg-[var(--color-bg-tertiary)] transition-colors border border-[var(--color-border)] cursor-pointer group"
      {...longPress}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-[var(--color-text-primary)] font-medium truncate">{setlist.name}</h3>
          {(setlist.performedAt || setlist.venue) && (
            <p className="text-[var(--color-text-muted)] text-xs truncate">
              {setlist.performedAt && format(new Date(setlist.performedAt), 'dd-MMM-yyyy')}
              {setlist.performedAt && setlist.venue && ' · '}
              {setlist.venue}
            </p>
          )}
          {setlist.description && (
            <p className="text-[var(--color-text-muted)] text-sm truncate">{setlist.description}</p>
          )}
        </div>
        <div className="hidden sm:flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" title="Edit Songs">✏️</button>
          <button onClick={(e) => { e.stopPropagation(); onRename(); }} className="p-1 text-[var(--color-text-muted)] hover:text-yellow-400" title="Rename">✍️</button>
          <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="p-1 text-[var(--color-text-muted)] hover:text-blue-400" title="Copy">📋</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 text-[var(--color-text-muted)] hover:text-red-400" title="Delete">🗑️</button>
        </div>
        <ActionDropdown actions={[
          { label: 'Edit Songs', icon: '✏️', onClick: onEdit },
          { label: 'Rename', icon: '✍️', onClick: onRename },
          { label: 'Copy', icon: '📋', onClick: onDuplicate },
          { label: 'Delete', icon: '🗑️', onClick: onDelete, danger: true },
        ]} />
      </div>

      <div className="flex flex-wrap gap-2 text-xs mb-3">
        {(() => {
          const actualSongs = setlist.songs?.filter(s => s.type !== 'SET_BREAK' && s.type !== 'MC') || [];
          const setBreaks = setlist.songs?.filter(s => s.type === 'SET_BREAK') || [];
          return (
            <>
              <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded">
                {actualSongs.length} songs
              </span>
              {setBreaks.length > 1 && (
                <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded">
                  {setBreaks.length} sets
                </span>
              )}
            </>
          );
        })()}
        {setlist.startTime && (
          <span className="px-2 py-1 bg-cyan-900/50 text-cyan-300 rounded">
            {formatTime12h(setlist.startTime)}
          </span>
        )}
        {setlist.songs?.length > 0 && (
          <span className="px-2 py-1 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded">
            {calculateDuration(setlist.songs)}
          </span>
        )}
      </div>

      {/* Song Preview */}
      <div className="space-y-1">
        {(() => {
          const previewItems = setlist.songs?.filter(s => s.type !== 'MC') || [];
          let songNum = 0;
          return previewItems.slice(0, 4).map((ss) => {
            if (ss.type === 'SET_BREAK') {
              return (
                <div key={ss.id} className="text-sm text-blue-400 font-medium truncate">
                  📋 {ss.label || 'Set Break'}
                </div>
              );
            }
            songNum++;
            return (
              <div key={ss.id} className="text-sm text-[var(--color-text-muted)] truncate">
                {songNum}. {ss.song?.title}
              </div>
            );
          });
        })()}
        {(() => {
          const actualSongs = setlist.songs?.filter(s => s.type !== 'SET_BREAK' && s.type !== 'MC') || [];
          return actualSongs.length > 3 && (
            <div className="text-sm text-[var(--color-text-muted)]">
              +{actualSongs.length - 3} more...
            </div>
          );
        })()}
      </div>

      {setlist._count?.gigs > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
          Used in {setlist._count.gigs} gig{setlist._count.gigs !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
});

function SetlistList({ workspaceId, workspaceName }) {
  const toast = useToast();
  const [setlists, setSetlists] = useState([]);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingSetlist, setEditingSetlist] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState('');
  const [newSetlistDesc, setNewSetlistDesc] = useState('');
  const [newSetlistDate, setNewSetlistDate] = useState('');
  const [newSetlistVenue, setNewSetlistVenue] = useState('');
  const [newSetlistStartTime, setNewSetlistStartTime] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importName, setImportName] = useState('');
  const [importText, setImportText] = useState('');
  const [importDate, setImportDate] = useState('');
  const [importVenue, setImportVenue] = useState('');
  const [importStartTime, setImportStartTime] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [viewingSetlist, setViewingSetlist] = useState(null);
  const [editingDetails, setEditingDetails] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [deleteSetlistId, setDeleteSetlistId] = useState(null);
  const [duplicateSetlistId, setDuplicateSetlistId] = useState(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [contextMenu, setContextMenu] = useState(null); // { setlistId, x, y }
  const [liveModeSetlist, setLiveModeSetlist] = useState(null);
  const [renameSetlistId, setRenameSetlistId] = useState(null);
  const [renameName, setRenameName] = useState('');

  useEffect(() => {
    loadData();
    // Reset builder when navigating to this component
    setShowBuilder(false);
    setEditingSetlist(null);
  }, [workspaceId]);

  // ESC key to close modals
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (editingDetails) setEditingDetails(null);
        else if (viewingSetlist) setViewingSetlist(null);
        else if (showImportModal) {
          setShowImportModal(false);
          setImportResults(null);
        }
        else if (showCreateModal) setShowCreateModal(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [editingDetails, viewingSetlist, showImportModal, showCreateModal]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [setlistsData, songsData] = await Promise.all([
        api.getSetlists(workspaceId),
        api.getSongs(workspaceId)
      ]);
      setSetlists(setlistsData);
      setSongs(songsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSetlist = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const created = await api.createSetlist(workspaceId, {
        name: newSetlistName,
        description: newSetlistDesc || null,
        performedAt: newSetlistDate || null,
        venue: newSetlistVenue || null,
        startTime: newSetlistStartTime || null
      });
      setSetlists(prev => [created, ...prev]);
      setShowCreateModal(false);
      setNewSetlistName('');
      setNewSetlistDesc('');
      setNewSetlistDate('');
      setNewSetlistVenue('');
      setNewSetlistStartTime('');
      setEditingSetlist(created);
      setShowBuilder(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteSetlist = async (setlistId) => {
    try {
      await api.deleteSetlist(setlistId);
      setSetlists(prev => prev.filter(s => s.id !== setlistId));
      setDeleteSetlistId(null);
    } catch (err) {
      toast.error(err.message);
      setDeleteSetlistId(null);
    }
  };

  const handleDuplicateSetlist = async () => {
    if (!duplicateSetlistId || !duplicateName.trim()) return;
    try {
      const duplicated = await api.duplicateSetlist(duplicateSetlistId, duplicateName);
      setSetlists(prev => [duplicated, ...prev]);
      setDuplicateSetlistId(null);
      setDuplicateName('');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRenameSetlist = async () => {
    if (!renameSetlistId || !renameName.trim()) return;
    try {
      const updated = await api.updateSetlist(renameSetlistId, { name: renameName.trim() });
      setSetlists(prev => prev.map(s => s.id === updated.id ? updated : s));
      setRenameSetlistId(null);
      setRenameName('');
      toast.success('Setlist renamed');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSetlistUpdated = (updatedSetlist) => {
    setSetlists(prev => prev.map(s => s.id === updatedSetlist.id ? updatedSetlist : s));
  };

  const openEditDetails = (setlist) => {
    setEditingDetails(setlist);
    setEditName(setlist.name);
    setEditDate(setlist.performedAt ? new Date(setlist.performedAt).toISOString().split('T')[0] : '');
    setEditVenue(setlist.venue || '');
    setEditStartTime(setlist.startTime || '');
  };

  const handleSaveDetails = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    try {
      const updated = await api.updateSetlist(editingDetails.id, {
        name: editName,
        performedAt: editDate || null,
        venue: editVenue || null,
        startTime: editStartTime || null
      });
      setSetlists(prev => prev.map(s => s.id === updated.id ? updated : s));
      if (viewingSetlist?.id === updated.id) {
        setViewingSetlist(updated);
      }
      setEditingDetails(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const parseSongLine = (line) => {
    let title, artist;
    if (line.includes(' - ')) {
      [title, artist] = line.split(' - ').map(s => s.trim());
    } else if (line.includes(' | ')) {
      [title, artist] = line.split(' | ').map(s => s.trim());
    } else if (line.includes('\t')) {
      [title, artist] = line.split('\t').map(s => s.trim());
    } else {
      // Remove leading numbers like "1. " or "1) "
      title = line.replace(/^\d+[\.\)]\s*/, '').trim();
      artist = null;
    }
    return { title, artist };
  };

  const parseImportText = (text) => {
    const lines = text.split('\n').filter(line => line.trim());

    // Detect set markers (e.g., "Set 1", "SET 1:", "--- Set 1 ---", "First Set", etc.)
    const setMarkerRegex = /^[-=]*\s*(set\s*(\d+)|first\s+set|second\s+set|third\s+set|encore)[\s:]*[-=]*$/i;
    const sets = [];
    let currentSet = { setNumber: 1, songs: [] };

    for (const line of lines) {
      const markerMatch = line.match(setMarkerRegex);
      if (markerMatch) {
        // Save current set if it has songs
        if (currentSet.songs.length > 0) {
          sets.push(currentSet);
        }

        // Determine set number
        let setNumber;
        const numMatch = markerMatch[2];
        if (numMatch) {
          setNumber = parseInt(numMatch);
        } else if (/first/i.test(line)) {
          setNumber = 1;
        } else if (/second/i.test(line)) {
          setNumber = 2;
        } else if (/third/i.test(line)) {
          setNumber = 3;
        } else if (/encore/i.test(line)) {
          setNumber = sets.length + 2; // Encore is usually after all sets
        } else {
          setNumber = sets.length + 1;
        }

        currentSet = { setNumber, songs: [] };
      } else {
        const song = parseSongLine(line);
        if (song.title) {
          currentSet.songs.push(song);
        }
      }
    }

    // Add final set
    if (currentSet.songs.length > 0) {
      sets.push(currentSet);
    }

    return sets;
  };

  const handleImportSetlist = async (e) => {
    e.preventDefault();
    const sets = parseImportText(importText);
    const totalSongs = sets.reduce((sum, s) => sum + s.songs.length, 0);

    if (totalSongs === 0) {
      toast.warning('No songs found. Enter one song per line.');
      return;
    }

    setImportLoading(true);
    setImportResults(null);

    try {
      // Check if it's a multi-set import
      const isMultiSet = sets.length > 1;

      if (isMultiSet) {
        const result = await api.importMultiSetlist(workspaceId, importName, sets, {
          performedAt: importDate || null,
          venue: importVenue || null,
          startTime: importStartTime || null
        });
        setImportResults({ ...result.results, isMultiSet: true });

        // Add the created setlist (now returns single setlist with SET_BREAK markers)
        setSetlists(prev => [result.setlist, ...prev]);

        if (result.results.totalNotFound === 0) {
          setShowImportModal(false);
          setImportName('');
          setImportText('');
          setImportDate('');
          setImportVenue('');
          setImportStartTime('');
          setImportResults(null);
          setEditingSetlist(result.setlist);
          setShowBuilder(true);
        }
      } else {
        // Single set import
        const result = await api.importSetlist(workspaceId, importName, sets[0].songs, {
          performedAt: importDate || null,
          venue: importVenue || null,
          startTime: importStartTime || null
        });
        setImportResults(result.results);
        setSetlists(prev => [result.setlist, ...prev]);

        if (result.results.notFound.length === 0) {
          setShowImportModal(false);
          setImportName('');
          setImportText('');
          setImportDate('');
          setImportVenue('');
          setImportStartTime('');
          setImportResults(null);
          setEditingSetlist(result.setlist);
          setShowBuilder(true);
        }
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImportLoading(false);
    }
  };

  const calculateDuration = useCallback((setlistSongs) => {
    const totalSeconds = setlistSongs.reduce((acc, ss) => {
      if (ss.type === 'SET_BREAK') return acc + (ss.duration || 0);
      if (ss.type === 'MC') return acc + (ss.duration || 60);
      return acc + (ss.song?.duration || 0);
    }, 0);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }, []);

  const formatTime12h = useCallback((time24) => {
    if (!time24) return '';
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }, []);

  // Memoized callbacks for SetlistCard to prevent unnecessary re-renders
  const handleViewSetlist = useCallback((setlist) => {
    setViewingSetlist(setlist);
  }, []);

  const handleEditSetlist = useCallback((setlist) => {
    setEditingSetlist(setlist);
    setShowBuilder(true);
  }, []);

  const handleDuplicate = useCallback((setlist) => {
    setDuplicateSetlistId(setlist.id);
    setDuplicateName(`Copy of ${setlist.name}`);
  }, []);

  const handleDelete = useCallback((setlistId) => {
    setDeleteSetlistId(setlistId);
  }, []);

  const handleContextMenu = useCallback((setlistId, pos) => {
    setContextMenu({ setlistId, ...pos });
  }, []);

  const handleRename = useCallback((setlist) => {
    setRenameSetlistId(setlist.id);
    setRenameName(setlist.name);
  }, []);

  // Print/PDF export function for any setlist
  const handlePrintSetlist = (setlist) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.warning('Please allow popups for this site to print the setlist');
      return;
    }

    const dateStr = setlist.performedAt
      ? format(new Date(setlist.performedAt), 'EEEE, dd-MMM-yyyy')
      : format(new Date(), 'EEEE, dd-MMM-yyyy');

    const setlistItems = setlist.songs || [];
    const songCount = setlistItems.filter(i => i.type !== 'MC' && i.type !== 'SET_BREAK').length;
    const totalDuration = calculateDuration(setlistItems);

    // Calculate total seconds for time range
    const totalSecs = setlistItems.reduce((acc, ss) => {
      if (ss.type === 'SET_BREAK') return acc + (ss.duration || 0);
      if (ss.type === 'MC') return acc + (ss.duration || 60);
      return acc + (ss.song?.duration || 0);
    }, 0);

    const addMinsToTime = (time24, minutes) => {
      if (!time24) return '';
      const [h, m] = time24.split(':').map(Number);
      const totalMins = Math.round(h * 60 + m + minutes);
      const newH = Math.floor(totalMins / 60) % 24;
      const newM = totalMins % 60;
      return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
    };

    const printEndTime = setlist.startTime ? addMinsToTime(setlist.startTime, totalSecs / 60) : '';
    const timeRangeStr = setlist.startTime && printEndTime
      ? `${formatTime12h(setlist.startTime)} – ${formatTime12h(printEndTime)}`
      : '';

    // Split items into sets for multi-column layout
    const sets = [];
    let currentSet = { breakItem: null, items: [] };
    for (const item of setlistItems) {
      if (item.type === 'SET_BREAK') {
        if (currentSet.items.length > 0 || currentSet.breakItem) {
          sets.push(currentSet);
        }
        currentSet = { breakItem: item, items: [] };
      } else {
        currentSet.items.push(item);
      }
    }
    if (currentSet.items.length > 0 || currentSet.breakItem) {
      sets.push(currentSet);
    }

    const numSets = sets.length;
    const useShort = setlist.useShortNames;
    const isLandscape = numSets >= 2;
    const bandName = workspaceName || '';

    // Calculate per-set timings (matching SetlistBuilder logic)
    const roundUpTo5 = (time24) => {
      if (!time24) return '';
      const [rh, rm] = time24.split(':').map(Number);
      const rounded = Math.ceil(rm / 5) * 5;
      const nh = (rh + Math.floor(rounded / 60)) % 24;
      const nm = rounded % 60;
      return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
    };
    const getItemSecs = (item) => {
      if (item.type === 'SET_BREAK') return item.duration || 0;
      if (item.type === 'MC') return item.duration || 60;
      const d = item.song?.duration || 0;
      return d > 0 ? Math.ceil(d / 60) * 60 : 0;
    };
    let setTimings = null;
    if (setlist.startTime) {
      setTimings = [];
      let curTime = setlist.startTime;
      for (let i = 0; i < sets.length; i++) {
        const s = sets[i];
        const allItems = s.breakItem ? [s.breakItem, ...s.items] : s.items;
        const setStart = curTime;
        let setDurSecs = 0;
        for (const it of allItems) {
          if (it.type === 'SET_BREAK' && i > 0) {
            curTime = addMinsToTime(curTime, (it.duration || 0) / 60);
          }
          if (it.type !== 'SET_BREAK') {
            setDurSecs += getItemSecs(it);
          }
        }
        const actualStart = i > 0 ? roundUpTo5(curTime) : setStart;
        const setEnd = addMinsToTime(actualStart, setDurSecs / 60);
        setTimings.push({ start: actualStart, end: setEnd });
        curTime = setEnd;
      }
    }

    // Build HTML for each set as a column
    const columnsHtml = sets.map((set, setIndex) => {
      const setLabel = set.breakItem
        ? (escapeHtml(set.breakItem.label) || `Set ${setIndex + 1}`)
        : (numSets > 1 ? `Set ${setIndex + 1}` : '');
      const setTimeStr = setTimings?.[setIndex]
        ? ` <span class="set-time">${formatTime12h(setTimings[setIndex].start)} – ${formatTime12h(setTimings[setIndex].end)}</span>`
        : '';

      let itemsHtml = '';
      set.items.forEach(item => {
        if (item.type === 'MC') {
          itemsHtml += `<li class="mc-item">&lt;${escapeHtml(item.label) || 'MC'}&gt;</li>`;
        } else {
          const song = item.song;
          const songName = useShort && song?.shortName
            ? escapeHtml(song.shortName)
            : (escapeHtml(song?.title) || 'Unknown');
          itemsHtml += `<li class="song-item">${songName}</li>`;
        }
      });

      return `
        <div class="set-column">
          ${setLabel ? `<div class="set-header">${setLabel}${setTimeStr}</div>` : ''}
          <ul class="song-list">${itemsHtml}</ul>
        </div>
      `;
    }).join('');

    const setlistHtml = `<div class="columns columns-${numSets}">${columnsHtml}</div>`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${escapeHtml(setlist.name)} - Setlist</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { ${isLandscape ? 'size: landscape;' : ''} margin: 10mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            margin: 0 auto;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .header {
            text-align: center;
            margin-bottom: 16px;
            padding-bottom: 14px;
            border-bottom: 3px solid #222;
          }
          .band-name {
            font-size: 32px;
            font-weight: 800;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-bottom: 2px;
          }
          .header-divider {
            width: 60px;
            height: 3px;
            background: #0891b2;
            margin: 8px auto;
            border-radius: 2px;
          }
          .venue {
            font-size: 22px;
            font-weight: 600;
            margin-bottom: 2px;
          }
          .setlist-name {
            font-size: 15px;
            color: #666;
          }
          .header-details {
            display: flex;
            justify-content: center;
            gap: 18px;
            margin-top: 6px;
            font-size: 14px;
            color: #555;
          }
          .header-details span { white-space: nowrap; }
          .time-range { color: #0891b2; font-weight: 500; }
          .content { flex: 1; display: flex; align-items: flex-start; }
          .columns { display: flex; gap: 12px; width: 100%; }
          .columns-1 { max-width: 500px; margin: 0 auto; }
          .set-column { flex: 1; min-width: 0; }
          .set-header {
            font-size: 18px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 0 0 10px 0;
            padding: 6px 0;
            border-bottom: 2px solid #333;
          }
          .set-time {
            font-size: 13px;
            font-weight: normal;
            color: #0891b2;
            margin-left: 8px;
            text-transform: none;
            letter-spacing: 0;
          }
          .song-list { list-style: none; padding: 0; }
          .song-item {
            padding: 5px 0;
            font-size: 18px;
          }
          .mc-item {
            padding: 5px 0;
            font-style: italic;
            font-size: 18px;
          }
          .footer {
            margin-top: 14px;
            padding-top: 10px;
            border-top: 3px solid #222;
            text-align: center;
          }
          .stats { font-size: 12px; color: #666; }
          @media print {
            body { padding: 0; }
            .set-header { break-inside: avoid; }
            .song-item { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${bandName ? `<div class="band-name">${escapeHtml(bandName)}</div>` : ''}
          ${bandName && (setlist.venue || setlist.name) ? '<div class="header-divider"></div>' : ''}
          ${setlist.venue ? `<div class="venue">${escapeHtml(setlist.venue)}</div>` : ''}
          <div class="setlist-name">${escapeHtml(setlist.name)}</div>
          <div class="header-details">
            <span>${dateStr}</span>
            ${timeRangeStr ? `<span class="time-range">${timeRangeStr}</span>` : ''}
          </div>
        </div>
        <div class="content">${setlistHtml}</div>
        <div class="footer">
          <div class="stats">${songCount} songs &bull; ${totalDuration} total</div>
        </div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({length: 3}).map((_, i) => <Skeleton.Card key={i} />)}
      </div>
    );
  }

  if (showBuilder && editingSetlist) {
    return (
      <SetlistBuilder
        setlist={editingSetlist}
        allSongs={songs}
        workspaceName={workspaceName}
        onBack={() => {
          setShowBuilder(false);
          setEditingSetlist(null);
          loadData();
        }}
        onUpdate={handleSetlistUpdated}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Setlists</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="btn btn-secondary"
            >
              Import Setlist
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn bg-green-600 hover:bg-green-700 text-white"
            >
              + New Setlist
            </button>
          </div>
        </div>
      </div>

      {/* Setlist Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && <ErrorMessage message={error} onRetry={loadData} />}

        {setlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
              No setlists yet
            </h3>
            <p className="text-[var(--color-text-muted)] max-w-sm mb-4">
              Setlists help you organize songs for gigs and rehearsals. Add MC sections, set breaks, and see total duration.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn bg-green-600 hover:bg-green-700 text-white"
            >
              + Create Setlist
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {setlists.map(setlist => (
              <SetlistCard
                key={setlist.id}
                setlist={setlist}
                onTap={() => handleViewSetlist(setlist)}
                onEdit={() => handleEditSetlist(setlist)}
                onRename={() => handleRename(setlist)}
                onDuplicate={() => handleDuplicate(setlist)}
                onDelete={() => handleDelete(setlist.id)}
                onContextMenu={(pos) => handleContextMenu(setlist.id, pos)}
                calculateDuration={calculateDuration}
                formatTime12h={formatTime12h}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-900 mb-4">New Setlist</h3>
            <form onSubmit={handleCreateSetlist}>
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newSetlistName}
                  onChange={(e) => setNewSetlistName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="e.g., Friday Night Set"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={newSetlistDesc}
                  onChange={(e) => setNewSetlistDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  placeholder="Optional description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Date Performed</label>
                  <input
                    type="date"
                    value={newSetlistDate}
                    onChange={(e) => setNewSetlistDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Venue</label>
                  <input
                    type="text"
                    value={newSetlistVenue}
                    onChange={(e) => setNewSetlistVenue(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                    placeholder="e.g., The Blue Note"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-1">Start Time</label>
                <input
                  type="time"
                  value={newSetlistStartTime}
                  onChange={(e) => setNewSetlistStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewSetlistName('');
                    setNewSetlistDesc('');
                    setNewSetlistDate('');
                    setNewSetlistVenue('');
                    setNewSetlistStartTime('');
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="btn bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {createLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-modal overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Import Setlist</h3>

            {!importResults ? (
              <form onSubmit={handleImportSetlist}>
                <div className="mb-4">
                  <label className="block text-gray-700 font-medium mb-1">
                    Setlist Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                    placeholder="e.g., Saturday Night Set"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-gray-700 font-medium mb-1">
                    Songs (one per line)
                  </label>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={"Set 1\nSong Title - Artist\nAnother Song\n\nSet 2\nMore Songs...\n\n(Or just songs without set markers)"}
                    className="w-full h-48 px-3 py-2 border border-gray-300 rounded text-gray-900 font-mono text-sm"
                    required
                  />
                  <p className="text-gray-500 text-xs mt-1">
                    Use "Set 1", "Set 2" markers for multi-set gigs. Songs matched to your library.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-gray-700 font-medium mb-1">Date Performed</label>
                    <input
                      type="date"
                      value={importDate}
                      onChange={(e) => setImportDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-medium mb-1">Venue</label>
                    <input
                      type="text"
                      value={importVenue}
                      onChange={(e) => setImportVenue(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                      placeholder="e.g., The Blue Note"
                    />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-gray-700 font-medium mb-1">Start Time</label>
                  <input
                    type="time"
                    value={importStartTime}
                    onChange={(e) => setImportStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportModal(false);
                      setImportName('');
                      setImportText('');
                      setImportDate('');
                      setImportVenue('');
                      setImportStartTime('');
                    }}
                    className="btn btn-secondary"
                    disabled={importLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={importLoading || !importName.trim() || !importText.trim()}
                    className="btn bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-300 disabled:text-gray-500"
                  >
                    {importLoading ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="mb-4">
                  {importResults.isMultiSet ? (
                    // Multi-set results
                    <>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                        <h4 className="font-medium text-green-800 mb-2">
                          Setlist created with {importResults.sets?.length || 0} sets • {importResults.totalMatched} songs matched
                        </h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {importResults.sets?.map((setResult, i) => (
                            <div key={i} className="text-sm">
                              <span className="font-medium text-green-700">Set {setResult.setNumber}:</span>
                              <span className="text-green-600 ml-2">{setResult.matched.length} songs</span>
                              {setResult.notFound.length > 0 && (
                                <span className="text-yellow-600 ml-2">({setResult.notFound.length} not found)</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {importResults.totalNotFound > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <h4 className="font-medium text-yellow-800 mb-2">
                            {importResults.totalNotFound} songs not found
                          </h4>
                          <p className="text-sm text-yellow-700">
                            Add missing songs to your library first.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    // Single set results
                    <>
                      {importResults.matched?.length > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                          <h4 className="font-medium text-green-800 mb-2">
                            {importResults.matched.length} songs matched
                          </h4>
                          <ul className="text-sm text-green-700 max-h-32 overflow-y-auto">
                            {importResults.matched.map((m, i) => (
                              <li key={i}>{m.song.title}{m.song.artist && ` - ${m.song.artist}`}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {importResults.notFound?.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <h4 className="font-medium text-yellow-800 mb-2">
                            {importResults.notFound.length} songs not found
                          </h4>
                          <p className="text-sm text-yellow-700 mb-2">
                            These songs are not in your library.
                          </p>
                          <ul className="text-sm text-yellow-700 max-h-32 overflow-y-auto">
                            {importResults.notFound.map((s, i) => (
                              <li key={i}>{s.title}{s.artist && ` - ${s.artist}`}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportName('');
                      setImportText('');
                      setImportDate('');
                      setImportVenue('');
                      setImportStartTime('');
                      setImportResults(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportName('');
                      setImportText('');
                      setImportDate('');
                      setImportVenue('');
                      setImportStartTime('');
                      setImportResults(null);
                      const newSetlist = setlists[0];
                      if (newSetlist) {
                        setEditingSetlist(newSetlist);
                        setShowBuilder(true);
                      }
                    }}
                    className="btn bg-green-600 hover:bg-green-700 text-white"
                  >
                    Edit Setlist
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View Setlist Modal */}
      {viewingSetlist && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setViewingSetlist(null)}
        >
          <div
            className="bg-[var(--color-bg-secondary)] rounded-xl w-full max-w-2xl max-h-modal overflow-hidden border border-[var(--color-border)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-[var(--color-text-primary)]">{viewingSetlist.name}</h3>
                {(viewingSetlist.performedAt || viewingSetlist.venue || viewingSetlist.startTime) && (
                  <p className="text-[var(--color-text-muted)] text-sm">
                    {viewingSetlist.performedAt && format(new Date(viewingSetlist.performedAt), 'dd-MMM-yyyy')}
                    {viewingSetlist.startTime && (
                      <span className="text-cyan-400"> at {formatTime12h(viewingSetlist.startTime)}</span>
                    )}
                    {(viewingSetlist.performedAt || viewingSetlist.startTime) && viewingSetlist.venue && ' · '}
                    {viewingSetlist.venue}
                  </p>
                )}
                {viewingSetlist.description && (
                  <p className="text-[var(--color-text-muted)] text-sm">{viewingSetlist.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setLiveModeSetlist(viewingSetlist);
                    setViewingSetlist(null);
                  }}
                  className="btn bg-red-600 hover:bg-red-500 text-white text-sm"
                  title="Start live mode"
                >
                  Live Mode
                </button>
                <button
                  onClick={() => handlePrintSetlist(viewingSetlist)}
                  className="btn bg-orange-600 hover:bg-orange-500 text-white text-sm"
                  title="Export as PDF"
                >
                  Export PDF
                </button>
                <button
                  onClick={() => openEditDetails(viewingSetlist)}
                  className="btn btn-secondary text-sm"
                >
                  Edit Details
                </button>
                <button
                  onClick={() => {
                    setEditingSetlist(viewingSetlist);
                    setShowBuilder(true);
                    setViewingSetlist(null);
                  }}
                  className="btn btn-secondary text-sm"
                >
                  Edit Songs
                </button>
                <button
                  onClick={() => setViewingSetlist(null)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Stats */}
              <div className="flex flex-wrap gap-2 text-xs mb-4">
                {(() => {
                  const actualSongs = viewingSetlist.songs?.filter(s => s.type !== 'SET_BREAK' && s.type !== 'MC') || [];
                  const setBreaks = viewingSetlist.songs?.filter(s => s.type === 'SET_BREAK') || [];
                  return (
                    <>
                      <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded">
                        {actualSongs.length} songs
                      </span>
                      {setBreaks.length > 1 && (
                        <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded">
                          {setBreaks.length} sets
                        </span>
                      )}
                      <span className="px-2 py-1 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded">
                        {calculateDuration(viewingSetlist.songs || [])}
                      </span>
                    </>
                  );
                })()}
              </div>

              {/* Song List */}
              <div className="space-y-1">
                {(() => {
                  let songNum = 0;
                  return viewingSetlist.songs?.map((item) => {
                    if (item.type === 'SET_BREAK') {
                      songNum = 0; // Reset numbering for each set
                      return (
                        <div key={item.id} className="py-2 mt-3 first:mt-0 border-b border-blue-500/30">
                          <span className="text-blue-400 font-bold">📋 {item.label || 'Set Break'}</span>
                        </div>
                      );
                    }
                    if (item.type === 'MC') {
                      return (
                        <div key={item.id} className="flex items-center gap-3 py-2 text-yellow-400">
                          <span className="w-8 text-right text-[var(--color-text-muted)]">•</span>
                          <span>🎤 {item.label || 'MC'}</span>
                          <span className="text-yellow-600 text-sm ml-auto">
                            {item.duration ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}` : '1:00'}
                          </span>
                        </div>
                      );
                    }
                    songNum++;
                    const song = item.song;
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-2 hover:bg-[var(--color-bg-tertiary)]/50 rounded px-2 -mx-2">
                        <span className="w-8 text-right text-[var(--color-text-muted)]">{songNum}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[var(--color-text-primary)] truncate">{song?.title || 'Unknown'}</div>
                          {song?.artist && (
                            <div className="text-[var(--color-text-muted)] text-sm truncate">{song.artist}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                          {song?.key && (
                            <span className="px-1.5 py-0.5 bg-purple-900/50 rounded">{song.key}</span>
                          )}
                          {song?.bpm && (
                            <span className="px-1.5 py-0.5 bg-orange-900/50 rounded">{song.bpm}</span>
                          )}
                          {song?.duration && (
                            <span>{Math.floor(song.duration / 60)}:{String(song.duration % 60).padStart(2, '0')}</span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Details Modal */}
      {editingDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Setlist Details</h3>
            <form onSubmit={handleSaveDetails}>
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Date Performed</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Venue</label>
                  <input
                    type="text"
                    value={editVenue}
                    onChange={(e) => setEditVenue(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                    placeholder="e.g., The Blue Note"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 font-medium mb-1">Start Time</label>
                <input
                  type="time"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingDetails(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading || !editName.trim()}
                  className="btn bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {editLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={deleteSetlistId !== null}
        title="Delete Setlist"
        message="Delete this setlist? This cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDeleteSetlist(deleteSetlistId)}
        onCancel={() => setDeleteSetlistId(null)}
      />

      {/* Duplicate Name Dialog */}
      <Modal isOpen={!!duplicateSetlistId} onClose={() => { setDuplicateSetlistId(null); setDuplicateName(''); }} title="Duplicate Setlist" maxWidth="max-w-sm">
        <div className="p-6 pt-0">
          <input
            type="text"
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.target.value)}
            className="modal-input mb-4"
            placeholder="Name for the copy"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDuplicateSetlist();
            }}
          />
          <div className="flex gap-3 justify-end">
            <button onClick={() => { setDuplicateSetlistId(null); setDuplicateName(''); }} className="btn btn-secondary">Cancel</button>
            <button onClick={handleDuplicateSetlist} disabled={!duplicateName.trim()} className="btn bg-green-600 hover:bg-green-700 text-white">Duplicate</button>
          </div>
        </div>
      </Modal>

      {/* Rename Dialog */}
      <Modal isOpen={!!renameSetlistId} onClose={() => { setRenameSetlistId(null); setRenameName(''); }} title="Rename Setlist" maxWidth="max-w-sm">
        <div className="p-6 pt-0">
          <input
            type="text"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            className="modal-input mb-4"
            placeholder="New name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSetlist();
            }}
          />
          <div className="flex gap-3 justify-end">
            <button onClick={() => { setRenameSetlistId(null); setRenameName(''); }} className="btn btn-secondary">Cancel</button>
            <button onClick={handleRenameSetlist} disabled={!renameName.trim()} className="btn bg-green-600 hover:bg-green-700 text-white">Rename</button>
          </div>
        </div>
      </Modal>

      <ContextMenu
        isOpen={contextMenu !== null}
        position={contextMenu || { x: 0, y: 0 }}
        onClose={() => setContextMenu(null)}
        items={[
          {
            label: 'Live Mode',
            icon: '🎸',
            onClick: () => {
              const setlist = setlists.find(s => s.id === contextMenu?.setlistId);
              if (setlist) setLiveModeSetlist(setlist);
            }
          },
          {
            label: 'Edit Songs',
            icon: '✏️',
            onClick: () => {
              const setlist = setlists.find(s => s.id === contextMenu?.setlistId);
              if (setlist) {
                setEditingSetlist(setlist);
                setShowBuilder(true);
              }
            }
          },
          {
            label: 'Rename',
            icon: '✍️',
            onClick: () => {
              const setlist = setlists.find(s => s.id === contextMenu?.setlistId);
              if (setlist) {
                setRenameSetlistId(setlist.id);
                setRenameName(setlist.name);
              }
            }
          },
          {
            label: 'Export PDF',
            icon: '📄',
            onClick: () => {
              const setlist = setlists.find(s => s.id === contextMenu?.setlistId);
              if (setlist) handlePrintSetlist(setlist);
            }
          },
          {
            label: 'Duplicate Setlist',
            icon: '📋',
            onClick: () => {
              const setlist = setlists.find(s => s.id === contextMenu?.setlistId);
              if (setlist) {
                setDuplicateSetlistId(setlist.id);
                setDuplicateName(`Copy of ${setlist.name}`);
              }
            }
          },
          {
            label: 'Delete Setlist',
            icon: '🗑️',
            variant: 'danger',
            onClick: () => setDeleteSetlistId(contextMenu?.setlistId)
          }
        ]}
      />

      {/* Live Mode */}
      {liveModeSetlist && (
        <LiveMode
          setlistItems={liveModeSetlist.songs || []}
          setlistName={liveModeSetlist.name}
          onClose={() => setLiveModeSetlist(null)}
        />
      )}
    </div>
  );
}

export default SetlistList;
