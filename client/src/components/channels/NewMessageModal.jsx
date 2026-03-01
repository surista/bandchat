import { useState, useRef, useEffect } from 'react';
import Modal from '../common/Modal';

function NewMessageModal({ workspace, user, onStartDM, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const selectedIds = new Set(selectedUsers.map(u => u.id));

  const availableMembers = (workspace.members || [])
    .filter(m => m.user.id !== user.id && !selectedIds.has(m.user.id))
    .filter(m => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        m.user.displayName?.toLowerCase().includes(q) ||
        m.user.email?.toLowerCase().includes(q)
      );
    });

  const handleSelect = (member) => {
    setSelectedUsers(prev => [...prev, member.user]);
    setSearchQuery('');
    searchRef.current?.focus();
  };

  const handleRemove = (userId) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId));
    searchRef.current?.focus();
  };

  const handleStartChat = async () => {
    if (selectedUsers.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      await onStartDM(selectedUsers.map(u => u.id));
      onClose();
    } catch (err) {
      console.error('Failed to create DM:', err);
      setError('Failed to start chat. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={loading ? undefined : onClose} title="New Message">
      <div className="p-4 space-y-3">
        {/* Selected members chips */}
        {selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedUsers.map(u => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded-full text-sm"
              >
                {u.displayName || 'Unknown'}
                <button
                  onClick={() => handleRemove(u.id)}
                  className="hover:text-white ml-0.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search input */}
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for members..."
          className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500"
        />

        {/* Member list */}
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {availableMembers.length === 0 ? (
            <p className="text-gray-500 text-sm px-2 py-2">
              {searchQuery.trim() ? 'No matching members found' : 'No more members to add'}
            </p>
          ) : (
            availableMembers.map(m => (
              <button
                key={m.user.id}
                onClick={() => handleSelect(m)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 text-left"
              >
                <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-medium shrink-0">
                  {m.user.avatarUrl ? (
                    <img src={m.user.avatarUrl} className="w-7 h-7 rounded-full object-cover" alt="" />
                  ) : (
                    m.user.displayName?.charAt(0).toUpperCase() || '?'
                  )}
                </div>
                <span className="text-white text-sm truncate">{m.user.displayName}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 text-red-400 text-sm">{error}</div>
      )}

      {/* Footer */}
      <div className="px-4 pb-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-300 hover:text-white text-sm rounded-lg hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={handleStartChat}
          disabled={selectedUsers.length === 0 || loading}
          className="btn btn-blue text-sm"
        >
          {loading ? 'Starting...' : 'Start Chat'}
        </button>
      </div>
    </Modal>
  );
}

export default NewMessageModal;
