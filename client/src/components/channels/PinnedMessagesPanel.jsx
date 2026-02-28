import { format } from 'date-fns';

function PinnedMessagesPanel({ pinnedMessages, onUnpin, onClose }) {
  const formatTime = (date) => {
    const d = new Date(date);
    return format(d, 'MMM d, yyyy h:mm a');
  };

  const renderPreview = (content) => {
    if (!content) return '';
    return content.length > 150 ? content.substring(0, 150) + '...' : content;
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 border-l border-gray-700">
      {/* Header */}
      <div className="h-14 border-b border-gray-700 px-4 flex items-center justify-between shrink-0">
        <h3 className="text-white font-semibold">Pinned Messages</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {pinnedMessages.length === 0 ? (
          <div className="p-4 text-gray-400 text-sm text-center mt-8">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p>No pinned messages yet</p>
            <p className="text-xs text-gray-500 mt-1">Pin important messages so they are easy to find</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {pinnedMessages.map((pin) => (
              <div
                key={pin.id}
                className="bg-gray-750 border border-gray-700 rounded-lg p-3 hover:bg-gray-700/50"
              >
                {/* Author and time */}
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-slack-green flex-shrink-0 flex items-center justify-center text-white text-xs font-medium">
                    {pin.message.author?.avatarUrl ? (
                      <img
                        src={pin.message.author.avatarUrl}
                        alt={pin.message.author?.displayName || pin.message.removedUserName || 'Deleted User'}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      (pin.message.author?.displayName || pin.message.removedUserName || 'Deleted User').charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="text-white text-sm font-medium">
                    {pin.message.author?.displayName || pin.message.removedUserName || 'Deleted User'}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {formatTime(pin.message.createdAt)}
                  </span>
                </div>

                {/* Message content preview */}
                <div className="text-gray-300 text-sm break-words whitespace-pre-wrap pl-8">
                  {renderPreview(pin.message.content)}
                </div>

                {/* Attachments indicator */}
                {pin.message.attachments?.length > 0 && (
                  <div className="pl-8 mt-1">
                    <span className="text-gray-500 text-xs">
                      {pin.message.attachments.length} attachment{pin.message.attachments.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                {/* Footer: pinned by + unpin button */}
                <div className="flex items-center justify-between mt-2 pl-8">
                  <span className="text-gray-500 text-xs">
                    Pinned by {pin.pinnedBy?.displayName || 'Deleted User'}
                  </span>
                  <button
                    onClick={() => onUnpin(pin.messageId)}
                    className="text-gray-500 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-gray-600/50 transition-colors"
                  >
                    Unpin
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PinnedMessagesPanel;
