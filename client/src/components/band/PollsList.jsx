import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { formatDistanceToNow } from 'date-fns';
import ConfirmDialog from '../common/ConfirmDialog';
import Skeleton from '../common/Skeleton';

function PollsList({ workspaceId }) {
  const { user } = useAuth();
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletePollId, setDeletePollId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    loadPolls();
  }, [workspaceId, showClosed]);

  const loadPolls = async () => {
    try {
      const data = await api.getPolls(workspaceId, { includeCompleted: showClosed });
      setPolls(data);
    } catch (err) {
      console.error('Failed to load polls:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (data) => {
    try {
      const created = await api.createPoll(workspaceId, data);
      setPolls(prev => [created, ...prev]);
      setShowForm(false);
    } catch (err) {
      throw new Error(err.message || 'Failed to create poll');
    }
  };

  const handleVote = async (pollId, optionIds) => {
    try {
      const result = await api.votePoll(pollId, optionIds);
      setPolls(prev =>
        prev.map(poll => {
          if (poll.id !== pollId) return poll;
          return {
            ...poll,
            userVotes: optionIds,
            totalVotes: result.totalVotes,
            options: poll.options.map(opt => {
              const updated = result.options.find(o => o.id === opt.id);
              return updated ? { ...opt, ...updated } : opt;
            })
          };
        })
      );
    } catch (err) {
      console.error('Failed to vote:', err);
    }
  };

  const handleClose = async (pollId) => {
    try {
      await api.closePoll(pollId);
      setPolls(prev =>
        prev.map(poll =>
          poll.id === pollId ? { ...poll, isClosed: true } : poll
        )
      );
    } catch (err) {
      console.error('Failed to close poll:', err);
    }
  };

  const handleDelete = async (pollId) => {
    try {
      await api.deletePoll(pollId);
      setPolls(prev => prev.filter(p => p.id !== pollId));
      setDeletePollId(null);
    } catch (err) {
      console.error('Failed to delete poll:', err);
      setDeletePollId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({length: 3}).map((_, i) => <Skeleton.Card key={i} />)}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--color-bg-primary)] min-h-0">
      {/* Header */}
      <div className="p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Polls</h2>
          <button
            onClick={() => setShowForm(true)}
            className="btn bg-green-600 hover:bg-green-700 text-white"
          >
            + Create Poll
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] cursor-pointer">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          Show closed polls
        </label>
      </div>

      {/* Polls List */}
      <div className="flex-1 overflow-y-auto p-4">
        {polls.length === 0 ? (
          <div className="text-center text-[var(--color-text-muted)] py-12">
            No {showClosed ? '' : 'active '}polls yet. Create one to get your band's opinion!
          </div>
        ) : (
          <div className="space-y-4">
            {polls.map(poll => (
              <PollCard
                key={poll.id}
                poll={poll}
                userId={user?.id}
                onVote={(optionIds) => handleVote(poll.id, optionIds)}
                onClose={() => handleClose(poll.id)}
                onDelete={() => setDeletePollId(poll.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Poll Modal */}
      {showForm && (
        <PollForm
          onSave={handleCreate}
          onClose={() => setShowForm(false)}
        />
      )}

      <ConfirmDialog
        isOpen={deletePollId !== null}
        title="Delete Poll"
        message="Delete this poll?"
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDelete(deletePollId)}
        onCancel={() => setDeletePollId(null)}
      />
    </div>
  );
}

function PollCard({ poll, userId, onVote, onClose, onDelete }) {
  const [selectedOptions, setSelectedOptions] = useState(poll.userVotes || []);
  const hasVoted = poll.userVotes?.length > 0;
  const canVote = !poll.isClosed && !hasVoted;
  const isCreator = poll.createdBy?.id === userId;

  const handleOptionClick = (optionId) => {
    if (!canVote) return;

    if (poll.allowMultiple) {
      setSelectedOptions(prev =>
        prev.includes(optionId)
          ? prev.filter(id => id !== optionId)
          : [...prev, optionId]
      );
    } else {
      setSelectedOptions([optionId]);
    }
  };

  const handleSubmitVote = () => {
    if (selectedOptions.length === 0) return;
    onVote(selectedOptions);
  };

  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-medium text-[var(--color-text-primary)] text-lg">{poll.question}</h4>
          {poll.description && (
            <p className="text-[var(--color-text-muted)] text-sm mt-1">{poll.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {poll.isClosed && (
            <span className="text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-2 py-0.5 rounded">Closed</span>
          )}
          {poll.isAnonymous && (
            <span className="text-xs bg-purple-900 text-purple-300 px-2 py-0.5 rounded">Anonymous</span>
          )}
          {isCreator && !poll.isClosed && (
            <button
              onClick={onClose}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              Close Poll
            </button>
          )}
          {isCreator && (
            <button
              onClick={onDelete}
              className="p-1 text-[var(--color-text-muted)] hover:text-red-400"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2 mb-3">
        {poll.options.map(option => {
          const isSelected = selectedOptions.includes(option.id);
          const isVoted = poll.userVotes?.includes(option.id);

          return (
            <button
              key={option.id}
              onClick={() => handleOptionClick(option.id)}
              disabled={!canVote}
              className={`w-full text-left p-3 rounded-lg transition-colors relative overflow-hidden ${
                canVote
                  ? isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] cursor-default'
              }`}
            >
              {/* Progress bar background */}
              {(hasVoted || poll.isClosed) && (
                <div
                  className="absolute inset-0 bg-blue-600/20"
                  style={{ width: `${option.percentage}%` }}
                />
              )}

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {canVote && (
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? 'border-white bg-white' : 'border-[var(--color-text-muted)]'
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </span>
                  )}
                  <span>{option.text}</span>
                  {isVoted && (
                    <span className="text-green-400 text-sm">(Your vote)</span>
                  )}
                </div>
                {(hasVoted || poll.isClosed) && (
                  <span className="text-sm font-medium">
                    {option.percentage}% ({option.voteCount})
                  </span>
                )}
              </div>

              {/* Voters (if not anonymous and voted/closed) */}
              {!poll.isAnonymous && option.voters?.length > 0 && (hasVoted || poll.isClosed) && (
                <div className="relative mt-1 text-xs text-[var(--color-text-muted)]">
                  {option.voters.map(v => v.displayName).join(', ')}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Vote button */}
      {canVote && selectedOptions.length > 0 && (
        <button
          onClick={handleSubmitVote}
          className="w-full btn bg-green-600 hover:bg-green-700 text-white"
        >
          Submit Vote
        </button>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mt-3 pt-3 border-t border-[var(--color-border)]">
        <span>
          Created by {poll.createdBy?.displayName || poll.removedCreatorName || 'Deleted User'} • {formatDistanceToNow(new Date(poll.createdAt), { addSuffix: true })}
        </span>
        <span>{poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

function PollForm({ onSave, onClose }) {
  const [formData, setFormData] = useState({
    question: '',
    description: '',
    options: ['', ''],
    allowMultiple: false,
    isAnonymous: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAddOption = () => {
    if (formData.options.length >= 10) return;
    setFormData(prev => ({ ...prev, options: [...prev.options, ''] }));
  };

  const handleRemoveOption = (index) => {
    if (formData.options.length <= 2) return;
    setFormData(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const handleOptionChange = (index, value) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => i === index ? value : opt)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const validOptions = formData.options.filter(o => o.trim());
    if (validOptions.length < 2) {
      setError('At least 2 options are required');
      setLoading(false);
      return;
    }

    try {
      await onSave({
        question: formData.question,
        description: formData.description || null,
        options: validOptions,
        allowMultiple: formData.allowMultiple,
        isAnonymous: formData.isAnonymous
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-lg">
        <div className="modal-header">
          <h3>Create Poll</h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-2xl" aria-label="Close">&times;</button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="modal-label">Question <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={formData.question}
                onChange={(e) => setFormData(prev => ({ ...prev, question: e.target.value }))}
                className="modal-input"
                placeholder="What would you like to ask?"
                required
              />
            </div>

            <div>
              <label className="modal-label">Description (optional)</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="modal-input"
                placeholder="Add more context..."
              />
            </div>

            <div>
              <label className="modal-label">Options</label>
              <div className="space-y-2">
                {formData.options.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => handleOptionChange(index, e.target.value)}
                      className="modal-input flex-1"
                      placeholder={`Option ${index + 1}`}
                    />
                    {formData.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(index)}
                        className="p-2 text-[var(--color-text-muted)] hover:text-red-400"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {formData.options.length < 10 && (
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  + Add option
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.allowMultiple}
                  onChange={(e) => setFormData(prev => ({ ...prev, allowMultiple: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <span className="text-[var(--color-text-secondary)]">Allow multiple selections</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isAnonymous}
                  onChange={(e) => setFormData(prev => ({ ...prev, isAnonymous: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <span className="text-[var(--color-text-secondary)]">Anonymous voting</span>
              </label>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t border-[var(--color-border)]">
              <button type="button" onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.question.trim()}
                className="btn bg-green-600 hover:bg-green-700 text-white"
              >
                {loading ? 'Creating...' : 'Create Poll'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default PollsList;
