import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import SlackImportWizard from './SlackImportWizard';

const STEPS = ['name', 'channels', 'invite', 'import', 'done'];
const STEP_LABELS = {
  name: 'Name',
  channels: 'Channels',
  invite: 'Invite',
  import: 'Import',
  done: 'Done'
};

const SUGGESTED_CHANNELS = [
  { name: 'general', description: 'General discussions', checked: true, isDefault: true },
  { name: 'rehearsals', description: 'Schedule and discuss rehearsals', checked: true },
  { name: 'gig-ideas', description: 'Venue ideas and booking opportunities', checked: true },
  { name: 'setlists', description: 'Setlist planning and discussion', checked: true },
  { name: 'off-topic', description: 'Non-band chat', checked: false },
  { name: 'gear', description: 'Equipment and gear discussion', checked: false },
  { name: 'songwriting', description: 'Original songs and arrangements', checked: false },
];

export default function OnboardingWizard({ onComplete, onClose }) {
  const [step, setStep] = useState('name');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspace, setWorkspace] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Channel step
  const [channels, setChannels] = useState(
    SUGGESTED_CHANNELS.map(c => ({ ...c }))
  );
  const [customChannelName, setCustomChannelName] = useState('');
  const [channelsCreated, setChannelsCreated] = useState(false);

  // Invite step
  const [copied, setCopied] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailsSent, setEmailsSent] = useState([]);
  const [emailError, setEmailError] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  // Import step
  const [showSlackImport, setShowSlackImport] = useState(false);
  const [slackImported, setSlackImported] = useState(false);

  const currentStepIndex = STEPS.indexOf(step);

  // --- Step handlers ---

  const handleCreateWorkspace = useCallback(async () => {
    if (!workspaceName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const ws = await api.createWorkspace(workspaceName.trim());
      setWorkspace(ws);
      setStep('channels');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceName]);

  const handleCreateChannels = useCallback(async () => {
    const toCreate = channels.filter(c => c.checked && !c.isDefault);
    if (toCreate.length === 0) {
      setChannelsCreated(true);
      setStep('invite');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await Promise.all(
        toCreate.map(c => api.createChannel(workspace.id, {
          name: c.name,
          description: c.description
        }))
      );
      setChannelsCreated(true);
      setStep('invite');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [channels, workspace]);

  const handleAddCustomChannel = useCallback(() => {
    const name = customChannelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!name) return;
    if (channels.some(c => c.name === name)) {
      setError(`Channel "${name}" already exists`);
      return;
    }
    setChannels(prev => [...prev, { name, description: '', checked: true, isCustom: true }]);
    setCustomChannelName('');
    setError(null);
  }, [customChannelName, channels]);

  const handleToggleChannel = useCallback((index) => {
    setChannels(prev => prev.map((c, i) => i === index ? { ...c, checked: !c.checked } : c));
  }, []);

  const handleRemoveCustomChannel = useCallback((index) => {
    setChannels(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleCopyInvite = useCallback(async () => {
    if (!workspace?.inviteCode) return;
    const url = `${window.location.origin}/join/${workspace.inviteCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [workspace]);

  const handleSendEmail = useCallback(async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    if (emailsSent.includes(email)) {
      setEmailError('Invite already sent to this email');
      return;
    }
    setEmailLoading(true);
    setEmailError('');
    try {
      await api.sendInviteEmail(workspace.id, email);
      setEmailsSent(prev => [...prev, email]);
      setEmailInput('');
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setEmailLoading(false);
    }
  }, [emailInput, emailsSent, workspace]);

  const handleClose = useCallback(() => {
    // If workspace was created, pass it back even if wizard wasn't finished
    if (workspace) {
      onComplete(workspace);
    } else {
      onClose();
    }
  }, [workspace, onComplete, onClose]);

  // --- Render steps ---

  const renderNameStep = () => (
    <div style={{ maxWidth: '400px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#127928;</div>
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
          Name your workspace
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          This is usually your band name.
        </p>
      </div>
      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkspace()}
          className="modal-input"
          style={{ width: '100%', padding: '12px 16px', fontSize: '16px' }}
          placeholder="e.g., The Rockers"
          autoFocus
          maxLength={50}
        />
      </div>
    </div>
  );

  const renderChannelsStep = () => (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
          Set up your channels
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Channels are where your band communicates. We've suggested a few to get you started.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
        {channels.map((channel, index) => (
          <div
            key={channel.name}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 16px', borderRadius: '8px',
              backgroundColor: 'var(--color-modal-card)',
              border: '1px solid var(--color-modal-border)',
              opacity: channel.isDefault ? 0.7 : 1
            }}
          >
            <input
              type="checkbox"
              checked={channel.checked}
              onChange={() => handleToggleChannel(index)}
              disabled={channel.isDefault}
              style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)', cursor: channel.isDefault ? 'not-allowed' : 'pointer' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>#</span>
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: '14px' }}>{channel.name}</span>
                {channel.isDefault && (
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-tertiary)', padding: '1px 6px', borderRadius: '4px' }}>
                    default
                  </span>
                )}
              </div>
              {channel.description && (
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{channel.description}</span>
              )}
            </div>
            {channel.isCustom && (
              <button
                onClick={() => handleRemoveCustomChannel(index)}
                style={{ color: 'var(--color-text-secondary)', fontSize: '18px', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                title="Remove"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add custom channel */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={customChannelName}
          onChange={(e) => setCustomChannelName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddCustomChannel()}
          className="modal-input"
          style={{ flex: 1, padding: '8px 12px', fontSize: '14px' }}
          placeholder="Add a custom channel..."
        />
        <button
          onClick={handleAddCustomChannel}
          className="btn btn-secondary"
          disabled={!customChannelName.trim()}
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          Add
        </button>
      </div>
    </div>
  );

  const renderInviteStep = () => {
    const inviteUrl = workspace?.inviteCode
      ? `${window.location.origin}/join/${workspace.inviteCode}`
      : '';

    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
            Invite your bandmates
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
            Share the invite link or send email invitations.
          </p>
        </div>

        {/* Invite link */}
        <div style={{
          padding: '16px', borderRadius: '8px', marginBottom: '20px',
          backgroundColor: 'var(--color-modal-card)',
          border: '1px solid var(--color-modal-border)'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
            Invite Link
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={inviteUrl}
              readOnly
              className="modal-input"
              style={{ flex: 1, padding: '8px 12px', fontSize: '13px', fontFamily: 'monospace' }}
              onClick={(e) => e.target.select()}
            />
            <button
              onClick={handleCopyInvite}
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: '13px', whiteSpace: 'nowrap' }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
            This invite link expires in 24 hours.
          </div>
        </div>

        {/* Email invites */}
        <div style={{
          padding: '16px', borderRadius: '8px',
          backgroundColor: 'var(--color-modal-card)',
          border: '1px solid var(--color-modal-border)'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
            Send Email Invites
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); setEmailError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSendEmail()}
              className="modal-input"
              style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
              placeholder="bandmate@email.com"
            />
            <button
              onClick={handleSendEmail}
              className="btn btn-primary"
              disabled={emailLoading || !emailInput.trim()}
              style={{ padding: '8px 16px', fontSize: '13px', whiteSpace: 'nowrap' }}
            >
              {emailLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
          {emailError && (
            <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '8px' }}>{emailError}</div>
          )}
          {emailsSent.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              {emailsSent.map(email => (
                <div key={email} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-secondary)', padding: '4px 0' }}>
                  <span style={{ color: '#22c55e' }}>&#10003;</span>
                  <span>{email}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderImportStep = () => (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
          Import from Slack
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
          Already have a Slack workspace? Import your channels, messages, and history.
        </p>
      </div>

      <div style={{
        padding: '32px', borderRadius: '8px', textAlign: 'center',
        backgroundColor: 'var(--color-modal-card)',
        border: '1px solid var(--color-modal-border)'
      }}>
        {slackImported ? (
          <>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#10003;</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Slack import complete!
            </div>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              Your Slack data has been imported into this workspace.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#128229;</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Bring your Slack history
            </div>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
              Import channels, messages, threads, and reactions from a Slack export ZIP file.
            </p>
            <button
              onClick={() => setShowSlackImport(true)}
              className="btn btn-primary"
              style={{ padding: '10px 24px', fontSize: '14px' }}
            >
              Start Slack Import
            </button>
          </>
        )}
      </div>

      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: '12px' }}>
        You can skip this step and import later from Settings.
      </p>
    </div>
  );

  const renderDoneStep = () => {
    const channelCount = channels.filter(c => c.checked).length;
    return (
      <div style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>&#127881;</div>
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
          You're all set!
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '32px' }}>
          Your workspace is ready to go.
        </p>

        <div style={{
          padding: '20px', borderRadius: '8px', textAlign: 'left', marginBottom: '32px',
          backgroundColor: 'var(--color-modal-card)',
          border: '1px solid var(--color-modal-border)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-modal-border)' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Workspace</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{workspace?.name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-modal-border)' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Channels</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{channelCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: emailsSent.length > 0 || slackImported ? '1px solid var(--color-modal-border)' : 'none' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Invites sent</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{emailsSent.length}</span>
          </div>
          {slackImported && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Slack import</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#22c55e' }}>Complete</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStep = () => {
    switch (step) {
      case 'name': return renderNameStep();
      case 'channels': return renderChannelsStep();
      case 'invite': return renderInviteStep();
      case 'import': return renderImportStep();
      case 'done': return renderDoneStep();
      default: return null;
    }
  };

  // --- Navigation ---

  const canGoNext = () => {
    switch (step) {
      case 'name': return workspaceName.trim().length > 0;
      case 'channels': return true;
      case 'invite': return true;
      case 'import': return true;
      case 'done': return true;
      default: return false;
    }
  };

  const handleNext = async () => {
    switch (step) {
      case 'name':
        await handleCreateWorkspace();
        break;
      case 'channels':
        await handleCreateChannels();
        break;
      case 'invite':
        setStep('import');
        break;
      case 'import':
        setStep('done');
        break;
      case 'done':
        onComplete(workspace);
        break;
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      // Can't go back to name step after workspace is created
      if (STEPS[prevIndex] === 'name' && workspace) return;
      setStep(STEPS[prevIndex]);
      setError(null);
    }
  };

  const nextLabel = () => {
    switch (step) {
      case 'name': return loading ? 'Creating...' : 'Create Workspace';
      case 'channels': return loading ? 'Creating channels...' : 'Next';
      case 'invite': return 'Next';
      case 'import': return 'Next';
      case 'done': return 'Go to Workspace';
      default: return 'Next';
    }
  };

  const content = (
    <div className="modal-backdrop" style={{ zIndex: 10000 }} onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="modal-content" style={{ maxWidth: '40rem', width: '100%', maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--color-modal-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
              Create Your Workspace
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Step {currentStepIndex + 1} of {STEPS.length} &mdash; {STEP_LABELS[step]}
            </span>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '4px', padding: '12px 24px', borderBottom: '1px solid var(--color-modal-border)' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{
              flex: 1, height: '3px', borderRadius: '2px',
              backgroundColor: i <= currentStepIndex ? 'var(--color-primary)' : 'var(--color-bg-tertiary)'
            }} />
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {error && (
            <div style={{ backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#ef4444', fontSize: '14px' }}>
              {error}
            </div>
          )}
          {renderStep()}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid var(--color-modal-border)' }}>
          <div>
            {currentStepIndex > 0 && step !== 'done' && !(currentStepIndex === 1 && workspace) && (
              <button onClick={handleBack} className="btn btn-secondary">
                Back
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(step === 'invite' || step === 'import') && (
              <button
                onClick={() => setStep(STEPS[currentStepIndex + 1])}
                className="btn btn-secondary"
              >
                Skip
              </button>
            )}
            <button
              onClick={handleNext}
              className="btn btn-primary"
              disabled={!canGoNext() || loading}
            >
              {nextLabel()}
            </button>
          </div>
        </div>
      </div>

      {/* Slack Import sub-wizard */}
      {showSlackImport && workspace && (
        <SlackImportWizard
          workspace={workspace}
          onClose={() => {
            setShowSlackImport(false);
            setSlackImported(true);
          }}
        />
      )}
    </div>
  );

  return createPortal(content, document.body);
}
