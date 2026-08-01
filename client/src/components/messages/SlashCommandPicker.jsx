import { useState, useEffect } from 'react';
import api from '../../services/api';
import Modal from '../common/Modal';
import { isSongItem } from '../../utils/setlistDuration';

/**
 * Modal picker for slash commands. Shows list of setlists/songs/gigs
 * and lets user select one to share as an embed in chat.
 */
export default function SlashCommandPicker({ type, workspaceId, onSelect, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (type === 'setlist') {
          const data = await api.getSetlists(workspaceId);
          // `songs` is the SetlistSong relation, which also holds MC sections
          // and set breaks — count only real songs so a 7-song setlist with 4
          // MCs doesn't read as "11 songs".
          setItems(data.map(s => {
            const count = s._count?.songs ?? (s.songs || []).filter(isSongItem).length;
            return { id: s.id, title: s.name, subtitle: `${count} ${count === 1 ? 'song' : 'songs'}` };
          }));
        } else if (type === 'song') {
          const data = await api.getSongs(workspaceId);
          setItems(data.map(s => ({ id: s.id, title: s.title, subtitle: s.artist || '' })));
        } else if (type === 'gig') {
          const data = await api.getGigs(workspaceId);
          setItems(data.map(g => ({
            id: g.id,
            title: g.title,
            subtitle: new Date(g.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          })));
        } else if (type === 'poll') {
          const data = await api.getPolls(workspaceId);
          setItems(data.map(p => ({ id: p.id, title: p.question, subtitle: `${p._count?.votes || p.options?.length || 0} options` })));
        }
      } catch (err) {
        console.error('Failed to load items:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [type, workspaceId]);

  const filtered = items.filter(item =>
    item.title.toLowerCase().includes(search.toLowerCase())
  );

  const typeLabel = { setlist: 'Setlist', song: 'Song', gig: 'Gig', poll: 'Poll' }[type] || type;
  const typeIcon = { setlist: '📋', song: '🎵', gig: '🎤', poll: '📊' }[type] || '';

  return (
    <Modal isOpen onClose={onClose} title={`Share a ${typeLabel}`}>
      <div className="p-4">
        <input
          type="text"
          placeholder={`Search ${typeLabel.toLowerCase()}s...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-lg mb-3 outline-none focus:border-blue-500"
          autoFocus
        />

        {loading ? (
          <div className="flex items-center justify-center py-8 text-[var(--color-text-muted)]">
            <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-text-muted)]">
            {items.length === 0 ? `No ${typeLabel.toLowerCase()}s found` : 'No matches'}
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filtered.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(type, item.id, item.title)}
                className="w-full px-3 py-2.5 text-left rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors flex items-center gap-3"
              >
                <span className="text-lg">{typeIcon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[var(--color-text-primary)] text-sm font-medium truncate">{item.title}</div>
                  {item.subtitle && (
                    <div className="text-[var(--color-text-muted)] text-xs truncate">{item.subtitle}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
