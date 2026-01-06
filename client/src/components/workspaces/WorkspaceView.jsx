import { useState, useEffect } from 'react';
import { useParams, useNavigate, Routes, Route } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import Sidebar from '../channels/Sidebar';
import ChannelView from '../channels/ChannelView';
import ThreadView from '../threads/ThreadView';

function WorkspaceView() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { socket, joinWorkspace } = useSocket();
  const [workspace, setWorkspace] = useState(null);
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    loadWorkspace();
  }, [workspaceId]);

  useEffect(() => {
    if (socket) {
      joinWorkspace(workspaceId);

      socket.on('channel:created', handleChannelCreated);
      socket.on('channel:deleted', handleChannelDeleted);
      socket.on('member:joined', handleMemberJoined);
      socket.on('member:removed', handleMemberRemoved);

      return () => {
        socket.off('channel:created', handleChannelCreated);
        socket.off('channel:deleted', handleChannelDeleted);
        socket.off('member:joined', handleMemberJoined);
        socket.off('member:removed', handleMemberRemoved);
      };
    }
  }, [socket, workspaceId]);

  const loadWorkspace = async () => {
    try {
      const [workspaceData, channelsData] = await Promise.all([
        api.getWorkspace(workspaceId),
        api.getChannels(workspaceId)
      ]);
      setWorkspace(workspaceData);
      setChannels(channelsData);

      // Select first channel by default
      if (channelsData.length > 0 && !selectedChannel) {
        const generalChannel = channelsData.find(c => c.name === 'general');
        setSelectedChannel(generalChannel || channelsData[0]);
      }
    } catch (err) {
      console.error('Failed to load workspace:', err);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleChannelCreated = (channel) => {
    setChannels(prev => [...prev, { ...channel, unreadCount: 0 }]);
  };

  const handleChannelDeleted = ({ channelId }) => {
    setChannels(prev => prev.filter(c => c.id !== channelId));
    if (selectedChannel?.id === channelId) {
      const remaining = channels.filter(c => c.id !== channelId);
      setSelectedChannel(remaining[0] || null);
    }
  };

  const handleMemberJoined = ({ user: newUser }) => {
    setWorkspace(prev => ({
      ...prev,
      members: [...prev.members, { user: newUser, role: 'MEMBER' }]
    }));
  };

  const handleMemberRemoved = ({ userId }) => {
    if (userId === user.id) {
      navigate('/');
      return;
    }
    setWorkspace(prev => ({
      ...prev,
      members: prev.members.filter(m => m.user.id !== userId)
    }));
  };

  const handleCreateChannel = async (name, isPrivate) => {
    try {
      const channel = await api.createChannel(workspaceId, { name, isPrivate });
      // Channel will be added via socket event
      setSelectedChannel(channel);
    } catch (err) {
      console.error('Failed to create channel:', err);
    }
  };

  const updateChannelUnread = (channelId, count) => {
    setChannels(prev =>
      prev.map(c =>
        c.id === channelId ? { ...c, unreadCount: count } : c
      )
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slack-sidebar flex items-center justify-center">
        <div className="text-white text-xl">Loading workspace...</div>
      </div>
    );
  }

  if (!workspace) {
    return null;
  }

  return (
    <div className="h-screen flex bg-gray-900">
      {/* Sidebar */}
      <Sidebar
        workspace={workspace}
        channels={channels}
        selectedChannel={selectedChannel}
        onSelectChannel={(channel) => {
          setSelectedChannel(channel);
          setSelectedThread(null);
        }}
        onCreateChannel={handleCreateChannel}
        onShowInvite={() => setShowInvite(true)}
        onLogout={logout}
        user={user}
      />

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Channel View */}
        <div className={`flex-1 flex flex-col ${selectedThread ? 'hidden md:flex' : ''}`}>
          {selectedChannel ? (
            <ChannelView
              channel={selectedChannel}
              workspace={workspace}
              onOpenThread={setSelectedThread}
              onUpdateUnread={(count) => updateChannelUnread(selectedChannel.id, count)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              Select a channel to start chatting
            </div>
          )}
        </div>

        {/* Thread Panel */}
        {selectedThread && (
          <div className="w-full md:w-96 border-l border-gray-700 flex flex-col">
            <ThreadView
              message={selectedThread}
              channelId={selectedChannel?.id}
              onClose={() => setSelectedThread(null)}
            />
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Invite to {workspace.name}</h3>
            <p className="text-gray-600 mb-4">Share this invite code with your bandmates:</p>
            <div className="bg-gray-100 rounded-lg p-4 text-center mb-4">
              <code className="text-2xl font-mono font-bold tracking-wider">
                {workspace.inviteCode}
              </code>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Or share this link:<br />
              <code className="text-xs break-all">
                {window.location.origin}/join/{workspace.inviteCode}
              </code>
            </p>
            <button
              onClick={() => setShowInvite(false)}
              className="w-full btn btn-primary"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkspaceView;
