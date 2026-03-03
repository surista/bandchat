import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';

const STEPS = ['upload', 'users', 'options', 'review', 'progress', 'results'];

const STEP_LABELS = {
  upload: 'Upload',
  users: 'Users',
  options: 'Options',
  review: 'Review',
  progress: 'Importing',
  results: 'Results'
};

export default function WorkspaceImportWizard({ onClose, onComplete }) {
  const { socket } = useSocket();
  const toast = useToast();

  const [step, setStep] = useState('upload');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Parse results
  const [parseResult, setParseResult] = useState(null);

  // User mapping: displayName → bandchatUserId | null
  const [userMapping, setUserMapping] = useState({});

  // Options
  const [options, setOptions] = useState({
    workspaceName: '',
    preserveTimestamps: true,
    importDMs: false,
  });

  // Progress & Results
  const [progress, setProgress] = useState({ stage: '', current: 0, total: 0, detail: '' });
  const [importResult, setImportResult] = useState(null);
  const sessionIdRef = useRef(null);

  // Listen for socket progress events
  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      if (data.sessionId === sessionIdRef.current) {
        setProgress(data);
      }
    };
    socket.on('workspace-import:progress', handler);
    return () => socket.off('workspace-import:progress', handler);
  }, [socket]);

  // Handle file selection
  const handleFile = useCallback((f) => {
    if (!f) return;
    if (!f.name.endsWith('.json')) {
      setError('Please select a JSON file');
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
      const result = await api.parseWorkspaceExport(file);
      setParseResult(result);
      sessionIdRef.current = result.sessionId;

      // Initialize user mapping from auto-matches
      const mapping = {};
      result.memberMapping.forEach(m => {
        if (m.matchedUser) {
          mapping[m.displayName] = m.matchedUser.id;
        }
      });
      setUserMapping(mapping);

      // Set workspace name
      setOptions(prev => ({ ...prev, workspaceName: result.workspaceName || '' }));

      setStep('users');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [file]);

  // Execute import
  const handleImport = useCallback(async () => {
    setStep('progress');
    setProgress({ stage: 'starting', current: 0, total: 0, detail: 'Starting import...' });
    try {
      const result = await api.executeWorkspaceImport({
        sessionId: sessionIdRef.current,
        userMapping,
        options,
      });
      setImportResult(result);
      setStep('results');
    } catch (err) {
      setError(err.message);
      setStep('review');
      toast.error('Import failed: ' + err.message);
    }
  }, [userMapping, options, toast]);

  // Review stats
  const reviewStats = useMemo(() => {
    if (!parseResult) return {};
    const mappedUsers = Object.values(userMapping).filter(Boolean).length;
    return {
      mappedUsers,
      ...parseResult.stats,
    };
  }, [parseResult, userMapping]);

  const currentStepIndex = STEPS.indexOf(step);

  const content = (
    <div className="modal-backdrop" style={{ zIndex: 10000 }} onClick={(e) => { if (e.target === e.currentTarget && step !== 'progress') onClose(); }}>
      <div className="modal-content" style={{ maxWidth: '56rem', width: '100%', maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--color-modal-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Import Workspace</h3>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Step {Math.min(currentStepIndex + 1, 4)} of 4 &mdash; {STEP_LABELS[step]}
            </span>
          </div>
          {step !== 'progress' && (
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
          )}
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '4px', padding: '12px 24px', borderBottom: '1px solid var(--color-modal-border)' }}>
          {STEPS.slice(0, 4).map((s, i) => (
            <div key={s} style={{
              flex: 1, height: '3px', borderRadius: '2px',
              backgroundColor: i <= Math.min(currentStepIndex, 3) ? 'var(--color-primary)' : 'var(--color-bg-tertiary)'
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

          {step === 'upload' && renderUploadStep({ file, loading, dragOver, setDragOver, handleFile, handleUpload, setFile, setError })}
          {step === 'users' && renderUsersStep({ parseResult, userMapping, setUserMapping })}
          {step === 'options' && renderOptionsStep({ options, setOptions, parseResult })}
          {step === 'review' && renderReviewStep({ reviewStats, options })}
          {step === 'progress' && renderProgressStep({ progress })}
          {step === 'results' && renderResultsStep({ importResult, onComplete })}
        </div>

        {/* Footer */}
        {step !== 'progress' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid var(--color-modal-border)' }}>
            <div>
              {currentStepIndex > 0 && currentStepIndex < 4 && (
                <button className="btn btn-secondary" onClick={() => setStep(STEPS[currentStepIndex - 1])}>Back</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {step === 'results' ? (
                <button className="btn btn-primary" onClick={() => {
                  if (importResult?.workspaceId) {
                    onComplete?.(importResult.workspaceId);
                  } else {
                    onClose();
                  }
                }}>
                  {importResult?.workspaceId ? 'Go to Workspace' : 'Done'}
                </button>
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

function renderUploadStep({ file, loading, dragOver, setDragOver, handleFile, handleUpload, setFile, setError }) {
  return (
    <div>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px', fontSize: '14px', lineHeight: '1.5' }}>
        Upload a BandChat workspace export JSON file. You can export your workspace from
        <strong> Settings &rarr; Export Workspace Data</strong>.
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
        onClick={() => document.getElementById('workspace-json-input')?.click()}
      >
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>📥</div>
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
              Drop your workspace export JSON here
            </p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              or click to browse
            </p>
          </div>
        )}
        <input
          id="workspace-json-input"
          type="file"
          accept=".json"
          onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
          style={{ display: 'none' }}
        />
      </div>

      {file && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={() => { setFile(null); setError(null); }}>Clear</button>
          <button className="btn btn-primary" onClick={handleUpload} disabled={loading}>
            {loading ? 'Parsing...' : 'Upload & Parse'}
          </button>
        </div>
      )}

      <div style={{ marginTop: '24px', padding: '14px 16px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>
          This will create a <strong>new workspace</strong> with all the imported data.
          Members will be matched to existing BandChat users by email address.
          Unmatched members&apos; content will show their original display name.
        </p>
      </div>
    </div>
  );
}

function renderUsersStep({ parseResult, userMapping, setUserMapping }) {
  const members = parseResult?.memberMapping || [];
  const bcUsers = parseResult?.bandchatUsers || [];

  return (
    <div>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '12px', fontSize: '14px', lineHeight: '1.5' }}>
        Map exported members to existing BandChat users. Auto-matched users are pre-selected.
        Unmapped members&apos; content will show their original display name.
      </p>

      <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-tertiary)', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Export Member</th>
              <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Email</th>
              <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Role</th>
              <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>BandChat User</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.displayName} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 12px', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {m.displayName}
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary)' }}>
                  {m.email || '\u2014'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                    backgroundColor: m.role === 'ADMIN' ? 'rgba(59,130,246,0.15)' : 'rgba(139,143,163,0.15)',
                    color: m.role === 'ADMIN' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  }}>
                    {m.role}
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <select
                    value={userMapping[m.displayName] || ''}
                    onChange={(e) => setUserMapping(prev => ({ ...prev, [m.displayName]: e.target.value || null }))}
                    style={{
                      backgroundColor: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '13px',
                      width: '100%',
                      maxWidth: '240px'
                    }}
                  >
                    <option value="">&mdash; Skip (use display name) &mdash;</option>
                    {bcUsers.map(bc => (
                      <option key={bc.id} value={bc.id}>{bc.displayName} ({bc.email})</option>
                    ))}
                  </select>
                  {userMapping[m.displayName] && (
                    <span style={{ marginLeft: '6px', color: 'var(--color-primary)' }}>&#10003;</span>
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

function renderOptionsStep({ options, setOptions, parseResult }) {
  const optionItems = [
    { key: 'preserveTimestamps', label: 'Preserve original timestamps', description: 'Messages and other content will keep their original dates from the export.' },
    { key: 'importDMs', label: 'Import direct messages', description: `Import ${parseResult?.stats?.directMessages || 0} direct messages. Both participants must be mapped to BandChat users.` },
  ];

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '6px', fontWeight: 500 }}>
          Workspace Name
        </label>
        <input
          type="text"
          value={options.workspaceName}
          onChange={(e) => setOptions(prev => ({ ...prev, workspaceName: e.target.value }))}
          className="modal-input"
          style={{ margin: 0, width: '100%', maxWidth: '400px' }}
          placeholder="My Band"
        />
      </div>

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
              onChange={() => setOptions(prev => ({ ...prev, [key]: !prev[key] }))}
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

function renderReviewStep({ reviewStats, options }) {
  const stats = [
    { label: 'Users mapped', value: reviewStats.mappedUsers, icon: '👥' },
    { label: 'Channels', value: reviewStats.channels, icon: '💬' },
    { label: 'Messages', value: reviewStats.messages + (options.importDMs ? (reviewStats.directMessages || 0) : 0), icon: '📨' },
    { label: 'Songs', value: reviewStats.songs, icon: '🎵' },
    { label: 'Setlists', value: reviewStats.setlists, icon: '📋' },
    { label: 'Gigs', value: reviewStats.gigs, icon: '🎸' },
  ];

  return (
    <div>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '12px', fontSize: '14px', lineHeight: '1.5' }}>
        Review your import configuration. A new workspace <strong>&ldquo;{options.workspaceName}&rdquo;</strong> will be created.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        {stats.map(({ label, value, icon }) => (
          <div key={label} style={{
            backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', padding: '16px',
            textAlign: 'center', border: '1px solid var(--color-border)'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>{icon}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{(value || 0).toLocaleString()}</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{label}</div>
          </div>
        ))}
      </div>

      {(reviewStats.bandMembers > 0 || reviewStats.contacts > 0 || reviewStats.announcements > 0 || reviewStats.polls > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', marginTop: '12px' }}>
          {reviewStats.bandMembers > 0 && <SmallStat label="Band Members" value={reviewStats.bandMembers} />}
          {reviewStats.contacts > 0 && <SmallStat label="Contacts" value={reviewStats.contacts} />}
          {reviewStats.announcements > 0 && <SmallStat label="Announcements" value={reviewStats.announcements} />}
          {reviewStats.polls > 0 && <SmallStat label="Polls" value={reviewStats.polls} />}
          {reviewStats.timeline > 0 && <SmallStat label="Timeline" value={reviewStats.timeline} />}
          {reviewStats.recordings > 0 && <SmallStat label="Recordings" value={reviewStats.recordings} />}
          {reviewStats.medleys > 0 && <SmallStat label="Medleys" value={reviewStats.medleys} />}
          {reviewStats.hasKitty && <SmallStat label="Band Kitty" value="Yes" />}
        </div>
      )}

      <div style={{ marginTop: '20px', padding: '14px 16px', backgroundColor: 'rgba(43,172,118,0.1)', borderRadius: '8px', border: '1px solid rgba(43,172,118,0.3)' }}>
        <p style={{ color: 'var(--color-text-primary)', fontSize: '14px', margin: 0 }}>
          Click <strong>Start Import</strong> to begin. This may take a minute depending on the amount of data.
        </p>
      </div>
    </div>
  );
}

function SmallStat({ label, value }) {
  return (
    <div style={{ backgroundColor: 'var(--color-bg-secondary)', borderRadius: '6px', padding: '8px 10px', textAlign: 'center', border: '1px solid var(--color-border)' }}>
      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{label}</div>
    </div>
  );
}

function renderProgressStep({ progress }) {
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ fontSize: '40px', marginBottom: '16px' }}>
        {progress.stage === 'done' ? '\u2705' : '\u23F3'}
      </div>

      <h3 style={{ color: 'var(--color-text-primary)', fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
        {progress.stage === 'done' ? 'Import Complete!' : 'Importing...'}
      </h3>

      <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
        {progress.detail}
      </p>

      {progress.total > 1 && (
        <>
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
            {progress.current} / {progress.total} &middot; {percent}%
          </p>
        </>
      )}
    </div>
  );
}

function renderResultsStep({ importResult, onComplete }) {
  if (!importResult) return null;

  const stats = [
    { label: 'Members added', value: importResult.membersAdded, icon: '👥' },
    { label: 'Channels created', value: importResult.channelsCreated, icon: '💬' },
    { label: 'Messages imported', value: importResult.messagesImported, icon: '📨' },
    { label: 'Songs imported', value: importResult.songsImported, icon: '🎵' },
    { label: 'Setlists imported', value: importResult.setlistsImported, icon: '📋' },
    { label: 'Gigs imported', value: importResult.gigsImported, icon: '🎸' },
    { label: 'Duration', value: `${importResult.duration}s`, icon: '\u23F1\uFE0F' },
  ];

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎉</div>
        <h3 style={{ color: 'var(--color-text-primary)', fontSize: '20px', fontWeight: 700, margin: 0 }}>
          Import Complete!
        </h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        {stats.filter(s => s.value).map(({ label, value, icon }) => (
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

      {/* Additional import counts */}
      {(importResult.bandMembersImported > 0 || importResult.contactsImported > 0 || importResult.announcementsImported > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', marginBottom: '16px' }}>
          {importResult.bandMembersImported > 0 && <SmallStat label="Band Members" value={importResult.bandMembersImported} />}
          {importResult.contactsImported > 0 && <SmallStat label="Contacts" value={importResult.contactsImported} />}
          {importResult.announcementsImported > 0 && <SmallStat label="Announcements" value={importResult.announcementsImported} />}
          {importResult.pollsImported > 0 && <SmallStat label="Polls" value={importResult.pollsImported} />}
          {importResult.timelineImported > 0 && <SmallStat label="Timeline" value={importResult.timelineImported} />}
          {importResult.recordingsImported > 0 && <SmallStat label="Recordings" value={importResult.recordingsImported} />}
          {importResult.medleysImported > 0 && <SmallStat label="Medleys" value={importResult.medleysImported} />}
        </div>
      )}

      {importResult.errors?.length > 0 && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '14px', marginTop: '12px' }}>
          <p style={{ color: '#ef4444', fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>
            {importResult.errors.length} error{importResult.errors.length !== 1 ? 's' : ''} during import:
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            {importResult.errors.slice(0, 10).map((err, i) => (
              <li key={i}>{err.type}: {err.channel || err.title || err.name || err.question} - {err.error}</li>
            ))}
            {importResult.errors.length > 10 && <li>...and {importResult.errors.length - 10} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
