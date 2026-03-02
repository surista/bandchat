import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import ConfirmDialog from '../common/ConfirmDialog';

function ChannelMembersPanel({ channel, workspace, onClose }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removeMemberId, setRemoveMemberId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addLoading, setAddLoading] = useState(null);
  const searchRef = useRef(null);

  const isAdmin = workspace.members?.find(m => m.user.id === user?.id)?.role === 'ADMIN';

  useEffect(() => {
    loadMembers();
  }, [channel.id]);

  useEffect(() => {
    if (!socket) return;

    const handleMemberAdded = ({ channelId, member }) => {
      if (channelId === channel.id) {
        setMembers(prev => {
          if (prev.some(m => m.userId === member.userId)) return prev;
          return [...prev, member];
        });
      }
    };

    const handleMemberRemoved = ({ channelId, userId }) => {
      if (channelId === channel.id) {
        setMembers(prev => prev.filter(m => m.userId !== userId));
      }
    };

    socket.on('channel:member:added', handleMemberAdded);
    socket.on('channel:member:removed', handleMemberRemoved);

    return () => {
      socket.off('channel:member:added', handleMemberAdded);
      socket.off('channel:member:removed', handleMemberRemoved);
    };
  }, [socket, channel.id]);

  useEffect(() => {
    if (showAddMenu && searchRef.current) {
      searchRef.current.focus();
    }
  }, [showAddMenu]);

  const loadMembers = async () => {
    try {
      const data = await api.getChannel(channel.id);
      setMembers(data.members || []);
    } catch (err) {
      console.error('Failed to load channel members:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (userId) => {
    setAddLoading(userId);
    try {
      await api.addChannelMember(channel.id, userId);
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to add member:', err);
    } finally {
      setAddLoading(null);
    }
  };

  const handleRemoveMember = async (userId) => {
    try {
      await api.removeChannelMember(channel.id, userId);
      setRemoveMemberId(null);
    } catch (err) {
      console.error('Failed to remove member:', err);
      setRemoveMemberId(null);
    }
  };

  const memberUserIds = new Set(members.map(m => m.userId));
  const nonMembers = (workspace.members || []).filter(
    m => !memberUserIds.has(m.user.id)
  );
  const filteredNonMembers = searchQuery.trim()
    ? nonMembers.filter(m =>
        m.user.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.user.email?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : nonMembers;

  return (
    <div className="flex flex-col h-full bg-gray-800 border-l border-gray-700">
      {/* Header */}
      <div className="h-14 border-b border-gray-700 px-4 flex items-center justify-between shrink-0">
        <h3 className="text-white font-semibold">Members</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-2 -mr-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Close members panel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Add Members Section */}
        {!channel.isDirect && (
          <div className="p-3 border-b border-gray-700">
            {showAddMenu ? (
              <div>
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                  {filteredNonMembers.length === 0 ? (
                    <p className="text-gray-500 text-sm px-2 py-1">
                      {nonMembers.length === 0
                        ? 'All workspace members are in this channel'
                        : 'No matching members found'}
                    </p>
                  ) : (
                    filteredNonMembers.map((m) => (
                      <button
                        key={m.user.id}
                        onClick={() => handleAddMember(m.user.id)}
                        disabled={addLoading === m.user.id}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 text-left disabled:opacity-50"
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-medium shrink-0">
                          {m.user.avatarUrl ? (
                            <img src={m.user.avatarUrl} className="w-7 h-7 rounded-full object-cover" alt="" />
                          ) : (
                            m.user.displayName?.charAt(0).toUpperCase() || '?'
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm truncate">{m.user.displayName}</div>
                        </div>
                        {addLoading === m.user.id ? (
                          <span className="text-gray-400 text-xs">Adding...</span>
                        ) : (
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        )}
                      </button>
                    ))
                  )}
                </div>
                <button
                  onClick={() => { setShowAddMenu(false); setSearchQuery(''); }}
                  className="mt-2 text-gray-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddMenu(true)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-700 text-blue-400 hover:text-blue-300 text-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Add Members
              </button>
            )}
          </div>
        )}

        {/* Members List */}
        {loading ? (
          <div className="p-4 text-gray-400 text-sm">Loading members...</div>
        ) : (
          <div className="p-2 space-y-0.5">
            {members.map((member) => {
              const memberUser = member.user;
              if (!memberUser) return null;
              const isCurrentUser = memberUser.id === user?.id;

              return (
                <div
                  key={memberUser.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 group"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-sm font-medium shrink-0">
                    {memberUser.avatarUrl ? (
                      <img src={memberUser.avatarUrl} className="w-8 h-8 rounded-full object-cover" alt="" />
                    ) : (
                      memberUser.displayName?.charAt(0).toUpperCase() || '?'
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-sm truncate block">
                      {memberUser.displayName}
                      {isCurrentUser && <span className="text-gray-500 ml-1">(you)</span>}
                    </span>
                  </div>
                  {/* Remove button - shown for admins, but not for self or in DMs */}
                  {isAdmin && !isCurrentUser && !channel.isDirect && (
                    <button
                      onClick={() => setRemoveMemberId(memberUser.id)}
                      className="hidden group-hover:block text-gray-500 hover:text-red-400 p-1"
                      title="Remove from channel"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={removeMemberId !== null}
        title="Remove Member"
        message="Remove this member from the channel?"
        confirmText="Remove"
        confirmVariant="danger"
        onConfirm={() => handleRemoveMember(removeMemberId)}
        onCancel={() => setRemoveMemberId(null)}
      />
    </div>
  );
}

export default ChannelMembersPanel;
