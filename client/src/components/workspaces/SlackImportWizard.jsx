import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';

const STEPS = ['upload', 'users', 'channels', 'options', 'review', 'progress', 'results'];
const UPDATE_STEPS = ['upload', 'updateProgress', 'updateResults'];

const STEP_LABELS = {
  upload: 'Upload',
  users: 'Users',
  channels: 'Channels',
  options: 'Options',
  review: 'Review',
  progress: 'Importing',
  results: 'Results',
  updateProgress: 'Downloading Files',
  updateResults: 'Results'
};

export default function SlackImportWizard({ workspace, onClose }) {
  const { socket } = useSocket();
  const toast = useToast();

  const [step, setStep] = useState('upload');
  const [mode, setMode] = useState('full'); // 'full' or 'update-files'
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Parse results
  const [parseResult, setParseResult] = useState(null);

  // User mapping: slackId → bandchatUserId | null
  const [userMapping, setUserMapping] = useState({});
  const [showBots, setShowBots] = useState(false);

  // Channel selection: channelName → { import: bool, type: 'channel'|'gig' }
  const [channelSelection, setChannelSelection] = useState({});
  const [channelSearch, setChannelSearch] = useState('');

  // Options
  const [options, setOptions] = useState({
    importBotMessages: false,
    importSystemMessages: false,
    preserveTimestamps: true,
    createGigs: true
  });

  // Progress & Results
  const [progress, setProgress] = useState({ stage: '', current: 0, total: 0, detail: '' });
  const [fileProgress, setFileProgress] = useState({ current: 0, total: 0, detail: '' });
  const [importResult, setImportResult] = useState(null);
  const [fileResult, setFileResult] = useState(null);
  const importSessionIdRef = useRef(null);

  // Listen for socket progress events
  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      if (data.importSessionId === importSessionIdRef.current) {
        setProgress(data);
      }
    };
    socket.on('slack-import:progress', handler);
    return () => socket.off('slack-import:progress', handler);
  }, [socket]);

  // Listen for file update progress events
  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      setFileProgress(data);
    };
    socket.on('slack-import:file-progress', handler);
    return () => socket.off('slack-import:file-progress', handler);
  }, [socket]);

  // Handle file selection (drop or click)
  const handleFile = useCallback((f) => {
    if (!f) return;
    if (!f.name.endsWith('.zip')) {
      setError('Please select a ZIP file');
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  // Upload & parse
  const handleUpload = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.parseSlackExport(workspace.id, file);
      setParseResult(result);
      importSessionIdRef.current = result.importSessionId;

      // Initialize user mapping from auto-matches
      const mapping = {};
      result.slackUsers.forEach(su => {
        if (su.matchedBandChatUser && !su.isBot) {
          mapping[su.slackId] = su.matchedBandChatUser.id;
        }
      });
      setUserMapping(mapping);

      // Initialize channel selection (all non-archived imported, gig channels typed as 'gig')
      const selection = {};
      result.slackChannels.forEach(sc => {
        selection[sc.name] = {
          import: !sc.isArchived,
          type: sc.isGigChannel ? 'gig' : 'channel'
        };
      });
      setChannelSelection(selection);

      setStep('users');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [file, workspace.id]);

  // Execute import
  const handleImport = useCallback(async () => {
    setStep('progress');
    setProgress({ stage: 'starting', current: 0, total: 0, detail: 'Starting import...' });
    try {
      const result = await api.importSlackData(workspace.id, {
        importSessionId: importSessionIdRef.current,
        userMapping,
        channelSelection,
        options
      });
      setImportResult(result);
      setStep('results');
    } catch (err) {
      setError(err.message);
      setStep('review');
      toast.error('Import failed: ' + err.message);
    }
  }, [workspace.id, userMapping, channelSelection, options, toast]);

  // Execute file update only
  const handleUpdateFiles = useCallback(async () => {
    if (!file) return;
    setMode('update-files');
    setStep('updateProgress');
    setFileProgress({ current: 0, total: 0, detail: 'Parsing export...' });
    setError(null);
    try {
      const result = await api.updateSlackFiles(workspace.id, file);
      setFileResult(result);
      setStep('updateResults');
    } catch (err) {
      setError(err.message);
      setStep('upload');
      toast.error('File update failed: ' + err.message);
    }
  }, [file, workspace.id, toast]);

  // Filtered users for display
  const displayUsers = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.slackUsers.filter(u => {
      if (!showBots && u.isBot) return false;
      if (u.isDeleted) return false;
      return true;
    });
  }, [parseResult, showBots]);

  // Filtered channels for display
  const displayChannels = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.slackChannels.filter(c => {
      if (channelSearch && !c.name.toLowerCase().includes(channelSearch.toLowerCase())) return false;
      return true;
    });
  }, [parseResult, channelSearch]);

  // Review stats
  const reviewStats = useMemo(() => {
    if (!parseResult) return {};
    const mappedUsers = Object.values(userMapping).filter(Boolean).length;
    const channelsToImport = Object.entries(channelSelection).filter(([, v]) => v.import);
    const gigChannels = channelsToImport.filter(([, v]) => v.type === 'gig');
    const totalMsgFiles = channelsToImport.reduce((sum, [name]) => {
      const ch = parseResult.slackChannels.find(c => c.name === name);
      return sum + (ch?.messageFileCount || 0);
    }, 0);
    return { mappedUsers, channelsToImport: channelsToImport.length, gigChannels: gigChannels.length, totalMsgFiles };
  }, [parseResult, userMapping, channelSelection]);

  const currentStepIndex = STEPS.indexOf(step);

  const content = (
    <div className="modal-backdrop" style={{ zIndex: 10000 }} onClick={(e) => { if (e.target === e.currentTarget && step !== 'progress') onClose(); }}>
      <div className="modal-content" style={{ maxWidth: '56rem', width: '100%', maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--color-modal-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Import from Slack</h3>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Step {Math.min(currentStepIndex + 1, 5)} of 5 &mdash; {STEP_LABELS[step]}
            </span>
          </div>
          {step !== 'progress' && (
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
          )}
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '4px', padding: '12px 24px', borderBottom: '1px solid var(--color-modal-border)' }}>
          {STEPS.slice(0, 5).map((s, i) => (
            <div key={s} style={{
              flex: 1, height: '3px', borderRadius: '2px',
              backgroundColor: i <= Math.min(currentStepIndex, 4) ? 'var(--color-primary)' : 'var(--color-bg-tertiary)'
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

          {step === 'upload' && renderUploadStep({ file, loading, dragOver, setDragOver, handleFile, handleUpload, handleUpdateFiles, setFile, setError })}
          {step === 'users' && renderUsersStep({ displayUsers, parseResult, userMapping, setUserMapping, showBots, setShowBots })}
          {step === 'channels' && renderChannelsStep({ displayChannels, channelSelection, setChannelSelection, channelSearch, setChannelSearch })}
          {step === 'options' && renderOptionsStep({ options, setOptions })}
          {step === 'review' && renderReviewStep({ reviewStats, parseResult })}
          {step === 'progress' && renderProgressStep({ progress })}
          {step === 'results' && renderResultsStep({ importResult })}
          {step === 'updateProgress' && renderUpdateProgressStep({ fileProgress })}
          {step === 'updateResults' && renderUpdateResultsStep({ fileResult })}
        </div>

        {/* Footer */}
        {step !== 'progress' && step !== 'updateProgress' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid var(--color-modal-border)' }}>
            <div>
              {currentStepIndex > 0 && currentStepIndex < 5 && mode === 'full' && (
                <button className="btn btn-secondary" onClick={() => setStep(STEPS[currentStepIndex - 1])}>Back</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {step === 'results' || step === 'updateResults' ? (
                <button className="btn btn-primary" onClick={onClose}>Done</button>
              ) : step === 'review' ? (
                <button className="btn btn-primary" onClick={handleImport} disabled={loading}>Start Import</button>
              ) : step !== 'upload' && (
                <button className="btn btn-primary" onClick={() => setStep(STEPS[currentStepIndex + 1])}>Next</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

// --- Step renderers ---

function renderUploadStep({ file, loading, dragOver, setDragOver, handleFile, handleUpload, handleUpdateFiles, setFile, setError }) {
  return (
    <div>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px', fontSize: '14px', lineHeight: '1.5' }}>
        Upload your Slack workspace export ZIP file. You can export your Slack workspace from
        <strong> Slack Settings &rarr; Import/Export &rarr; Export</strong>.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        style={{
          border: `2px dashed ${dragOver ? 'var(--color-primary)' : 'var(--color-border)'}`,
          borderRadius: '12px',
          padding: '48px 24px',
          textAlign: 'center',
          backgroundColor: dragOver ? 'rgba(43,172,118,0.05)' : 'var(--color-bg-secondary)',
          transition: 'all 0.15s',
          cursor: 'pointer'
        }}
        onClick={() => document.getElementById('slack-zip-input')?.click()}
      >
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>📦</div>
        {file ? (
          <div>
            <p style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: '16px' }}>{file.name}</p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: '16px' }}>
              Drop your Slack export ZIP here
            </p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              or click to browse
            </p>
          </div>
        )}
        <input
          id="slack-zip-input"
          type="file"
          accept=".zip"
          onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
          style={{ display: 'none' }}
        />
      </div>

      {file && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
            <button className="btn btn-secondary" onClick={() => { setFile(null); setError(null); }}>Clear</button>
            <button className="btn btn-primary" onClick={handleUpload} disabled={loading}>
              {loading ? 'Parsing...' : 'Full Import →'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', marginTop: '8px' }}>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '12px', textAlign: 'center' }}>
              Already imported? Download files from a previous import:
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                className="btn btn-secondary"
                onClick={handleUpdateFiles}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>📷</span> Update Files Only
              </button>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '8px', textAlign: 'center' }}>
              Downloads images/files from Slack and attaches them to existing messages.
              <br />Does not create channels, users, or gigs.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function renderUsersStep({ displayUsers, parseResult, userMapping, setUserMapping, showBots, setShowBots }) {
  const bcUsers = parseResult?.bandchatUsers || [];

  return (
    <div>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '12px', fontSize: '14px', lineHeight: '1.5' }}>
        Map Slack users to BandChat users. Auto-matched users are pre-selected. Unmapped users&apos; messages will show their Slack name.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        <input type="checkbox" checked={showBots} onChange={(e) => setShowBots(e.target.checked)} />
        Show bots ({parseResult?.stats?.totalBots || 0})
      </label>

      <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-tertiary)', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Slack User</th>
              <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Email</th>
              <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>BandChat User</th>
            </tr>
          </thead>
          <tbody>
            {displayUsers.map(su => (
              <tr key={su.slackId} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {su.avatarUrl ? (
                    <img src={su.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: 'var(--color-bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      {(su.realName || '?')[0]}
                    </div>
                  )}
                  <span style={{ color: 'var(--color-text-primary)' }}>
                    {su.realName}
                    {su.isBot && <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-tertiary)', padding: '1px 6px', borderRadius: '4px' }}>BOT</span>}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary)' }}>{su.email || '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  <select
                    value={userMapping[su.slackId] || ''}
                    onChange={(e) => setUserMapping(prev => ({ ...prev, [su.slackId]: e.target.value || null }))}
                    style={{
                      backgroundColor: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '13px',
                      width: '100%',
                      maxWidth: '220px'
                    }}
                  >
                    <option value="">— Skip (use Slack name) —</option>
                    {bcUsers.map(bc => (
                      <option key={bc.id} value={bc.id}>{bc.displayName} ({bc.email})</option>
                    ))}
                  </select>
                  {userMapping[su.slackId] && (
                    <span style={{ marginLeft: '6px', color: 'var(--color-primary)' }}>✓</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderChannelsStep({ displayChannels, channelSelection, setChannelSelection, channelSearch, setChannelSearch }) {
  const importCount = Object.values(channelSelection).filter(v => v.import).length;
  const totalCount = Object.keys(channelSelection).length;

  return (
    <div>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '12px', fontSize: '14px', lineHeight: '1.5' }}>
        Select which channels to import. Channels with date-prefixed names (e.g. <code>2024-01-06-muddys</code>) are auto-detected as gigs.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search channels..."
          value={channelSearch}
          onChange={(e) => setChannelSearch(e.target.value)}
          className="modal-input"
          style={{ flex: 1, margin: 0 }}
        />
        <button className="btn btn-secondary" style={{ fontSize: '13px', whiteSpace: 'nowrap' }}
          onClick={() => setChannelSelection(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(k => { updated[k] = { ...updated[k], import: true }; });
            return updated;
          })}
        >Select All</button>
        <button className="btn btn-secondary" style={{ fontSize: '13px', whiteSpace: 'nowrap' }}
          onClick={() => setChannelSelection(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(k => { updated[k] = { ...updated[k], import: false }; });
            return updated;
          })}
        >Deselect All</button>
      </div>

      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
        {importCount} of {totalCount} channels selected
      </p>

      <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', maxHeight: '400px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-tertiary)', textAlign: 'left', position: 'sticky', top: 0 }}>
              <th style={{ padding: '10px 12px', width: '40px' }}></th>
              <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Channel</th>
              <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontWeight: 600, width: '80px', textAlign: 'center' }}>Messages</th>
              <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontWeight: 600, width: '120px' }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {displayChannels.map(ch => {
              const sel = channelSelection[ch.name] || { import: false, type: 'channel' };
              return (
                <tr key={ch.slackId} style={{ borderTop: '1px solid var(--color-border)', opacity: sel.import ? 1 : 0.5 }}>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={sel.import}
                      onChange={(e) => setChannelSelection(prev => ({
                        ...prev,
                        [ch.name]: { ...prev[ch.name], import: e.target.checked }
                      }))}
                    />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>#{ch.name}</span>
                    {ch.isGigChannel && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', backgroundColor: 'rgba(43,172,118,0.15)', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>GIG</span>
                    )}
                    {ch.isArchived && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '2px 8px', borderRadius: '4px' }}>archived</span>
                    )}
                    {ch.purpose && (
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ch.purpose}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    {ch.messageFileCount}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <select
                      value={sel.type}
                      onChange={(e) => setChannelSelection(prev => ({
                        ...prev,
                        [ch.name]: { ...prev[ch.name], type: e.target.value }
                      }))}
                      disabled={!sel.import}
                      style={{
                        backgroundColor: 'var(--color-bg-tertiary)',
                        color: 'var(--color-text-primary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '13px'
                      }}
                    >
                      <option value="channel">Channel</option>
                      <option value="gig">Gig</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderOptionsStep({ options, setOptions }) {
  const toggleOption = (key) => setOptions(prev => ({ ...prev, [key]: !prev[key] }));

  const optionItems = [
    { key: 'preserveTimestamps', label: 'Preserve original timestamps', description: 'Messages will show their original Slack dates instead of the import date.' },
    { key: 'createGigs', label: 'Create gig records for gig channels', description: 'Automatically create Gig entries for channels detected as gigs (date-prefixed names).' },
    { key: 'importSystemMessages', label: 'Import system messages', description: 'Include join/leave, topic change, and other system messages.' },
    { key: 'importBotMessages', label: 'Import bot messages', description: 'Include messages from Slack bots (e.g. Simple Poll, Google Calendar).' }
  ];

  return (
    <div>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px', fontSize: '14px', lineHeight: '1.5' }}>
        Configure how the import should be handled.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {optionItems.map(({ key, label, description }) => (
          <label key={key} style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer',
            padding: '14px 16px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px',
            border: '1px solid var(--color-border)'
          }}>
            <input
              type="checkbox"
              checked={options[key]}
              onChange={() => toggleOption(key)}
              style={{ marginTop: '2px' }}
            />
            <div>
              <div style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontSize: '14px' }}>{label}</div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '2px' }}>{description}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function renderReviewStep({ reviewStats, parseResult }) {
  return (
    <div>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px', fontSize: '14px', lineHeight: '1.5' }}>
        Review your import configuration. Click <strong>Start Import</strong> to begin.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {[
          { label: 'Users mapped', value: reviewStats.mappedUsers, icon: '👥' },
          { label: 'Channels to import', value: reviewStats.channelsToImport, icon: '💬' },
          { label: 'Gig channels', value: reviewStats.gigChannels, icon: '🎸' },
          { label: 'Message date files', value: reviewStats.totalMsgFiles, icon: '📄' }
        ].map(({ label, value, icon }) => (
          <div key={label} style={{
            backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', padding: '16px',
            border: '1px solid var(--color-border)'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>{icon}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '20px', padding: '14px 16px', backgroundColor: 'rgba(43,172,118,0.1)', borderRadius: '8px', border: '1px solid rgba(43,172,118,0.3)' }}>
        <p style={{ color: 'var(--color-text-primary)', fontSize: '14px', margin: 0 }}>
          This may take a minute depending on the amount of data. You can watch the progress in real-time.
        </p>
      </div>
    </div>
  );
}

function renderProgressStep({ progress }) {
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ fontSize: '40px', marginBottom: '16px' }}>
        {progress.stage === 'done' ? '✅' : '⏳'}
      </div>

      <h3 style={{ color: 'var(--color-text-primary)', fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
        {progress.stage === 'done' ? 'Import Complete!' : 'Importing...'}
      </h3>

      <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
        {progress.detail}
      </p>

      {/* Progress bar */}
      <div style={{
        width: '100%', maxWidth: '400px', margin: '0 auto', height: '8px',
        backgroundColor: 'var(--color-bg-tertiary)', borderRadius: '4px', overflow: 'hidden'
      }}>
        <div style={{
          width: `${percent}%`, height: '100%', backgroundColor: 'var(--color-primary)',
          borderRadius: '4px', transition: 'width 0.3s ease'
        }} />
      </div>

      <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '8px' }}>
        {progress.current} / {progress.total} channels &middot; {percent}%
      </p>
    </div>
  );
}

function renderResultsStep({ importResult }) {
  if (!importResult) return null;

  const stats = [
    { label: 'Channels created', value: importResult.channelsCreated, icon: '💬' },
    { label: 'Messages imported', value: importResult.messagesImported, icon: '📨' },
    { label: 'Thread replies', value: importResult.threadsImported, icon: '🧵' },
    { label: 'Reactions imported', value: importResult.reactionsImported, icon: '😀' },
    { label: 'Gigs created', value: importResult.gigsCreated, icon: '🎸' },
    { label: 'Duration', value: `${importResult.duration}s`, icon: '⏱️' }
  ];

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎉</div>
        <h3 style={{ color: 'var(--color-text-primary)', fontSize: '20px', fontWeight: 700, margin: 0 }}>
          Import Complete!
        </h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        {stats.map(({ label, value, icon }) => (
          <div key={label} style={{
            backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', padding: '14px',
            textAlign: 'center', border: '1px solid var(--color-border)'
          }}>
            <div style={{ fontSize: '18px' }}>{icon}</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{label}</div>
          </div>
        ))}
      </div>

      {importResult.errors?.length > 0 && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '14px', marginTop: '12px' }}>
          <p style={{ color: '#ef4444', fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>
            {importResult.errors.length} error{importResult.errors.length !== 1 ? 's' : ''} during import:
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            {importResult.errors.slice(0, 10).map((err, i) => (
              <li key={i}>{err.channel}: {err.error}</li>
            ))}
            {importResult.errors.length > 10 && <li>...and {importResult.errors.length - 10} more</li>}
          </ul>
        </div>
      )}

      <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '16px', textAlign: 'center' }}>
        Refresh the page to see your imported channels in the sidebar.
      </p>
    </div>
  );
}

function renderUpdateProgressStep({ fileProgress }) {
  const percent = fileProgress.total > 0 ? Math.round((fileProgress.current / fileProgress.total) * 100) : 0;

  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ fontSize: '40px', marginBottom: '16px' }}>📥</div>

      <h3 style={{ color: 'var(--color-text-primary)', fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
        Downloading Files from Slack...
      </h3>

      <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
        {fileProgress.detail}
      </p>

      {/* Progress bar */}
      <div style={{
        width: '100%', maxWidth: '400px', margin: '0 auto', height: '8px',
        backgroundColor: 'var(--color-bg-tertiary)', borderRadius: '4px', overflow: 'hidden'
      }}>
        <div style={{
          width: `${percent}%`, height: '100%', backgroundColor: 'var(--color-primary)',
          borderRadius: '4px', transition: 'width 0.3s ease'
        }} />
      </div>

      <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '8px' }}>
        {fileProgress.current} / {fileProgress.total} messages &middot; {percent}%
      </p>

      <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: '16px' }}>
        This may take a while depending on how many files need to be downloaded.
      </p>
    </div>
  );
}

function renderUpdateResultsStep({ fileResult }) {
  if (!fileResult) return null;

  const stats = [
    { label: 'Messages matched', value: fileResult.messagesMatched, icon: '✅' },
    { label: 'Messages not found', value: fileResult.messagesNotFound, icon: '❓' },
    { label: 'Files downloaded', value: fileResult.filesDownloaded, icon: '📥' },
    { label: 'Files skipped', value: fileResult.filesSkipped, icon: '⏭️' },
    { label: 'Files failed', value: fileResult.filesFailed, icon: '❌' },
    { label: 'Attachments created', value: fileResult.attachmentsCreated, icon: '📎' }
  ];

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>📷</div>
        <h3 style={{ color: 'var(--color-text-primary)', fontSize: '20px', fontWeight: 700, margin: 0 }}>
          File Update Complete!
        </h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginTop: '4px' }}>
          Completed in {fileResult.duration}s
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        {stats.map(({ label, value, icon }) => (
          <div key={label} style={{
            backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', padding: '14px',
            textAlign: 'center', border: '1px solid var(--color-border)'
          }}>
            <div style={{ fontSize: '18px' }}>{icon}</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{label}</div>
          </div>
        ))}
      </div>

      {fileResult.errors?.length > 0 && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '14px', marginTop: '12px' }}>
          <p style={{ color: '#ef4444', fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>
            {fileResult.errors.length} error{fileResult.errors.length !== 1 ? 's' : ''} during download:
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            {fileResult.errors.slice(0, 10).map((err, i) => (
              <li key={i}>{err.file}: {err.error}</li>
            ))}
            {fileResult.errors.length > 10 && <li>...and {fileResult.errors.length - 10} more</li>}
          </ul>
        </div>
      )}

      <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '16px', textAlign: 'center' }}>
        Refresh the page to see the updated messages with images.
      </p>
    </div>
  );
}
