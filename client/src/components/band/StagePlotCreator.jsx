import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../services/api';
import '../../../styles/stagePlot.css';

// ─── SVG icon templates ───
const SVG_TEMPLATES = {
  vocals: `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="28" y="8" width="8" height="20" rx="4" fill="#e74c3c"/><path d="M22 18v6a10 10 0 0 0 20 0v-6" fill="none" stroke="#e74c3c" stroke-width="2.5"/><line x1="32" y1="34" x2="32" y2="46" stroke="#e74c3c" stroke-width="2.5"/><line x1="24" y1="46" x2="40" y2="46" stroke="#e74c3c" stroke-width="2.5"/><line x1="32" y1="46" x2="32" y2="56" stroke="#888" stroke-width="2"/><circle cx="32" cy="58" r="3" fill="#888"/></svg>`,
  'guitar-combo': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="14" y="14" width="36" height="40" rx="4" fill="#3e2c1a"/><rect x="17" y="17" width="30" height="18" rx="2" fill="#2a1e12"/><circle cx="32" cy="26" r="7" fill="none" stroke="#6b4f30" stroke-width="1.5"/><circle cx="32" cy="26" r="3" fill="none" stroke="#6b4f30" stroke-width="1"/><circle cx="22" cy="44" r="1.5" fill="#e67e22"/><circle cx="28" cy="44" r="1.5" fill="#e67e22"/><circle cx="34" cy="44" r="1.5" fill="#e67e22"/><rect x="38" y="42" width="6" height="4" rx="1" fill="#e67e22"/><text x="32" y="10" text-anchor="middle" font-size="7" fill="#e67e22" font-weight="bold">COMBO</text></svg>`,
  'guitar-212': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="10" y="14" width="44" height="40" rx="4" fill="#2c3e50"/><rect x="13" y="17" width="38" height="22" rx="2" fill="#1a252f"/><circle cx="24" cy="28" r="7" fill="none" stroke="#555" stroke-width="1.5"/><circle cx="40" cy="28" r="7" fill="none" stroke="#555" stroke-width="1.5"/><circle cx="18" cy="48" r="1.5" fill="#e67e22"/><circle cx="24" cy="48" r="1.5" fill="#e67e22"/><circle cx="30" cy="48" r="1.5" fill="#e67e22"/><circle cx="36" cy="48" r="1.5" fill="#e67e22"/><circle cx="42" cy="48" r="1.5" fill="#e67e22"/><text x="32" y="10" text-anchor="middle" font-size="7" fill="#e67e22" font-weight="bold">GTR 2x12</text></svg>`,
  'guitar-halfstack': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="12" y="6" width="40" height="14" rx="3" fill="#2c3e50"/><circle cx="20" cy="13" r="1.5" fill="#e67e22"/><circle cx="26" cy="13" r="1.5" fill="#e67e22"/><circle cx="32" cy="13" r="1.5" fill="#e67e22"/><rect x="38" y="10" width="10" height="5" rx="1" fill="#1a252f"/><rect x="10" y="22" width="44" height="36" rx="4" fill="#2c3e50"/><rect x="13" y="25" width="38" height="28" rx="2" fill="#1a252f"/><circle cx="24" cy="33" r="6" fill="none" stroke="#555" stroke-width="1.5"/><circle cx="40" cy="33" r="6" fill="none" stroke="#555" stroke-width="1.5"/><circle cx="24" cy="47" r="6" fill="none" stroke="#555" stroke-width="1.5"/><circle cx="40" cy="47" r="6" fill="none" stroke="#555" stroke-width="1.5"/></svg>`,
  'guitar-fullstack': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="14" y="2" width="36" height="10" rx="2" fill="#2c3e50"/><circle cx="22" cy="7" r="1.2" fill="#e67e22"/><circle cx="27" cy="7" r="1.2" fill="#e67e22"/><circle cx="32" cy="7" r="1.2" fill="#e67e22"/><rect x="36" y="5" width="8" height="4" rx="1" fill="#1a252f"/><rect x="12" y="13" width="40" height="24" rx="3" fill="#2c3e50"/><rect x="14" y="15" width="36" height="20" rx="2" fill="#1a252f"/><circle cx="24" cy="21" r="4.5" fill="none" stroke="#555" stroke-width="1.2"/><circle cx="40" cy="21" r="4.5" fill="none" stroke="#555" stroke-width="1.2"/><circle cx="24" cy="31" r="4.5" fill="none" stroke="#555" stroke-width="1.2"/><circle cx="40" cy="31" r="4.5" fill="none" stroke="#555" stroke-width="1.2"/><rect x="12" y="38" width="40" height="24" rx="3" fill="#2c3e50"/><rect x="14" y="40" width="36" height="20" rx="2" fill="#1a252f"/><circle cx="24" cy="46" r="4.5" fill="none" stroke="#555" stroke-width="1.2"/><circle cx="40" cy="46" r="4.5" fill="none" stroke="#555" stroke-width="1.2"/><circle cx="24" cy="56" r="4.5" fill="none" stroke="#555" stroke-width="1.2"/><circle cx="40" cy="56" r="4.5" fill="none" stroke="#555" stroke-width="1.2"/></svg>`,
  'bass-combo': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="12" y="14" width="40" height="40" rx="4" fill="#1a2a3a"/><rect x="15" y="17" width="34" height="20" rx="2" fill="#0f1a26"/><circle cx="32" cy="27" r="8" fill="none" stroke="#2a4a6a" stroke-width="1.5"/><circle cx="32" cy="27" r="4" fill="none" stroke="#2a4a6a" stroke-width="1"/><circle cx="20" cy="46" r="1.5" fill="#3498db"/><circle cx="26" cy="46" r="1.5" fill="#3498db"/><circle cx="32" cy="46" r="1.5" fill="#3498db"/><rect x="36" y="44" width="8" height="4" rx="1" fill="#3498db"/><text x="32" y="10" text-anchor="middle" font-size="7" fill="#3498db" font-weight="bold">COMBO</text></svg>`,
  'bass-115': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="10" y="12" width="44" height="44" rx="4" fill="#1a2a3a"/><rect x="13" y="15" width="38" height="36" rx="2" fill="#0f1a26"/><circle cx="32" cy="33" r="14" fill="none" stroke="#2a4a6a" stroke-width="2"/><circle cx="32" cy="33" r="7" fill="none" stroke="#2a4a6a" stroke-width="1"/><circle cx="32" cy="33" r="2" fill="#2a4a6a"/><text x="32" y="9" text-anchor="middle" font-size="7" fill="#3498db" font-weight="bold">1x15</text></svg>`,
  'bass-410': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="10" y="10" width="44" height="46" rx="4" fill="#1a2a3a"/><rect x="13" y="13" width="38" height="38" rx="2" fill="#0f1a26"/><circle cx="24" cy="24" r="6.5" fill="none" stroke="#2a4a6a" stroke-width="1.5"/><circle cx="40" cy="24" r="6.5" fill="none" stroke="#2a4a6a" stroke-width="1.5"/><circle cx="24" cy="40" r="6.5" fill="none" stroke="#2a4a6a" stroke-width="1.5"/><circle cx="40" cy="40" r="6.5" fill="none" stroke="#2a4a6a" stroke-width="1.5"/><text x="32" y="7" text-anchor="middle" font-size="7" fill="#3498db" font-weight="bold">4x10</text></svg>`,
  'bass-stack': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="14" y="4" width="36" height="12" rx="2" fill="#1a2a3a"/><circle cx="22" cy="10" r="1.5" fill="#3498db"/><circle cx="28" cy="10" r="1.5" fill="#3498db"/><rect x="34" y="7" width="10" height="5" rx="1" fill="#0f1a26"/><rect x="12" y="18" width="40" height="42" rx="3" fill="#1a2a3a"/><rect x="14" y="20" width="36" height="38" rx="2" fill="#0f1a26"/><circle cx="24" cy="30" r="6" fill="none" stroke="#2a4a6a" stroke-width="1.5"/><circle cx="40" cy="30" r="6" fill="none" stroke="#2a4a6a" stroke-width="1.5"/><circle cx="24" cy="46" r="6" fill="none" stroke="#2a4a6a" stroke-width="1.5"/><circle cx="40" cy="46" r="6" fill="none" stroke="#2a4a6a" stroke-width="1.5"/></svg>`,
  keyboard: `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="8" y="28" width="48" height="20" rx="3" fill="#2c3e50"/><rect x="12" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="18" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="24" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="30" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="36" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="42" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="48" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="15" y="32" width="3" height="7" rx="0.5" fill="#2c3e50"/><rect x="21" y="32" width="3" height="7" rx="0.5" fill="#2c3e50"/><rect x="33" y="32" width="3" height="7" rx="0.5" fill="#2c3e50"/><rect x="39" y="32" width="3" height="7" rx="0.5" fill="#2c3e50"/><rect x="45" y="32" width="3" height="7" rx="0.5" fill="#2c3e50"/><text x="32" y="24" text-anchor="middle" font-size="8" fill="#9b59b6" font-weight="bold">KEYS</text></svg>`,
  drums: `<svg viewBox="0 0 64 64" width="48" height="48"><ellipse cx="32" cy="40" r="12" ry="8" fill="none" stroke="#e74c3c" stroke-width="2"/><ellipse cx="18" cy="28" r="7" ry="5" fill="none" stroke="#f39c12" stroke-width="1.5"/><ellipse cx="46" cy="28" r="7" ry="5" fill="none" stroke="#f39c12" stroke-width="1.5"/><ellipse cx="32" cy="18" r="8" ry="5" fill="none" stroke="#e67e22" stroke-width="1.5"/><circle cx="12" cy="16" r="5" fill="none" stroke="#c0392b" stroke-width="1.5"/><circle cx="52" cy="16" r="5" fill="none" stroke="#c0392b" stroke-width="1.5"/><ellipse cx="22" cy="52" r="6" ry="3" fill="none" stroke="#95a5a6" stroke-width="1.5"/><ellipse cx="42" cy="52" r="6" ry="3" fill="none" stroke="#95a5a6" stroke-width="1.5"/></svg>`,
  piano: `<svg viewBox="0 0 64 64" width="48" height="48"><path d="M16 52 Q8 40 10 24 Q12 12 32 8 Q52 12 54 24 Q56 40 48 52 Z" fill="#1a1a1a" stroke="#333" stroke-width="1.5"/><path d="M20 48 Q14 38 16 26 Q18 18 32 14 Q46 18 48 26 Q50 38 44 48 Z" fill="#2c2c2c"/><rect x="22" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1"/><rect x="26" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1"/><rect x="30" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1"/><rect x="34" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1"/><rect x="38" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1"/><line x1="16" y1="52" x2="12" y2="58" stroke="#333" stroke-width="2"/><line x1="48" y1="52" x2="52" y2="58" stroke="#333" stroke-width="2"/><line x1="32" y1="52" x2="32" y2="58" stroke="#333" stroke-width="2"/></svg>`,
};

const LABEL_MAP = {
  vocals: 'Vocals', 'guitar-combo': 'Gtr Combo', 'guitar-212': 'Gtr 2x12',
  'guitar-halfstack': 'Gtr Half', 'guitar-fullstack': 'Gtr Full',
  'bass-combo': 'Bass Combo', 'bass-115': 'Bass 1x15', 'bass-410': 'Bass 4x10',
  'bass-stack': 'Bass Stack', keyboard: 'Keys', drums: 'Drums', piano: 'Piano',
};

const PALETTE_SECTIONS = [
  { label: 'Vocals', items: ['vocals'] },
  { label: 'Guitar', items: ['guitar-combo', 'guitar-212', 'guitar-halfstack', 'guitar-fullstack'] },
  { label: 'Bass', items: ['bass-combo', 'bass-115', 'bass-410', 'bass-stack'] },
  { label: 'Keys / Piano', items: ['keyboard', 'piano'] },
  { label: 'Drums', items: ['drums'] },
];

const MIN_STAGE_W = 300;
const MIN_STAGE_H = 200;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ─── Stage Editor (the canvas) ───
function StageEditor({ plotData, onChange, onSave }) {
  const stageRef = useRef(null);
  const wrapperRef = useRef(null);
  const paletteRef = useRef(null);
  const [items, setItems] = useState(plotData.items || []);
  const [stageW, setStageW] = useState(plotData.stageWidth || 900);
  const [stageH, setStageH] = useState(plotData.stageHeight || 500);
  const [bandName, setBandName] = useState(plotData.bandName || '');
  const [eventName, setEventName] = useState(plotData.eventName || '');
  const [eventDate, setEventDate] = useState(plotData.eventDate || '');
  const dragRef = useRef({ type: null, item: null, offsetX: 0, offsetY: 0 });
  const resizeRef = useRef(null);
  const palResizeRef = useRef(null);
  const saveTimerRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // Auto-save with debounce
  const scheduleAutoSave = useCallback((data) => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onChange(data);
      onSave(data);
    }, 1000);
  }, [onChange, onSave]);

  const currentData = useCallback(() => ({
    items, stageWidth: stageW, stageHeight: stageH,
    bandName, eventName, eventDate,
  }), [items, stageW, stageH, bandName, eventName, eventDate]);

  useEffect(() => {
    scheduleAutoSave(currentData());
  }, [items, stageW, stageH, bandName, eventName, eventDate]);

  // ── Palette drag start ──
  const onPaletteDragStart = (e, type) => {
    dragRef.current = { type, item: null, offsetX: 0, offsetY: 0 };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', type);
  };

  // ── Stage item drag start ──
  const onItemDragStart = (e, idx) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    dragRef.current = { type: null, item: idx, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => { el.style.opacity = '0.4'; });
  };

  const onItemDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    dragRef.current = { type: null, item: null, offsetX: 0, offsetY: 0 };
    setDragOver(false);
  };

  // ── Stage drop ──
  const onStageDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onStageDragLeave = (e) => {
    if (!stageRef.current.contains(e.relatedTarget)) setDragOver(false);
  };

  const onStageDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const rect = stageRef.current.getBoundingClientRect();
    const d = dragRef.current;

    if (d.item !== null) {
      const x = clamp(e.clientX - rect.left - d.offsetX, 0, rect.width - 48);
      const y = clamp(e.clientY - rect.top - d.offsetY, 0, rect.height - 60);
      setItems(prev => prev.map((it, i) => i === d.item ? { ...it, x, y } : it));
    } else if (d.type) {
      const x = clamp(e.clientX - rect.left - 24, 0, rect.width - 48);
      const y = clamp(e.clientY - rect.top - 24, 0, rect.height - 60);
      setItems(prev => [...prev, { type: d.type, x, y, id: Date.now() + Math.random() }]);
    }
    dragRef.current = { type: null, item: null, offsetX: 0, offsetY: 0 };
  };

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  // ── Stage resize ──
  const onResizeStart = (e, dir) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { dir, startX: e.clientX, startY: e.clientY, startW: stageW, startH: stageH };
    document.body.classList.add('sp-resizing');
    const cursor = dir === 'r' ? 'ew-resize' : dir === 'b' ? 'ns-resize' : 'nwse-resize';
    document.body.style.cursor = cursor;
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
  };

  const onResizeMove = useCallback((e) => {
    const r = resizeRef.current;
    if (!r) return;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;
    if (r.dir === 'r' || r.dir === 'br') setStageW(Math.max(MIN_STAGE_W, r.startW + dx));
    if (r.dir === 'b' || r.dir === 'br') setStageH(Math.max(MIN_STAGE_H, r.startH + dy));
  }, []);

  const onResizeEnd = useCallback(() => {
    resizeRef.current = null;
    document.body.classList.remove('sp-resizing');
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
  }, [onResizeMove]);

  // ── Palette resize ──
  const onPalResizeStart = (e) => {
    e.preventDefault();
    palResizeRef.current = { startX: e.clientX, startW: paletteRef.current.offsetWidth };
    document.body.classList.add('sp-resizing');
    document.body.style.cursor = 'ew-resize';
    document.addEventListener('mousemove', onPalResizeMove);
    document.addEventListener('mouseup', onPalResizeEnd);
  };

  const onPalResizeMove = useCallback((e) => {
    const r = palResizeRef.current;
    if (!r || !paletteRef.current) return;
    const w = clamp(r.startW + (e.clientX - r.startX), 100, 400);
    paletteRef.current.style.width = w + 'px';
  }, []);

  const onPalResizeEnd = useCallback(() => {
    palResizeRef.current = null;
    document.body.classList.remove('sp-resizing');
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onPalResizeMove);
    document.removeEventListener('mouseup', onPalResizeEnd);
  }, [onPalResizeMove]);

  return (
    <div className="sp-container">
      {/* Palette sidebar */}
      <div ref={paletteRef} className="sp-palette bg-[var(--bg-surface)] border-r border-[var(--border)]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Instruments</h3>
        {PALETTE_SECTIONS.map(section => (
          <div key={section.label}>
            <div className="sp-palette-section text-gray-500 border-t border-[var(--border)]">{section.label}</div>
            {section.items.map(type => (
              <div
                key={type}
                className="sp-palette-item border border-[var(--border)] hover:border-purple-500 bg-[var(--bg-primary)] hover:bg-[var(--bg-surface)]"
                draggable
                onDragStart={(e) => onPaletteDragStart(e, type)}
              >
                <span dangerouslySetInnerHTML={{ __html: SVG_TEMPLATES[type] }} />
                <span className="text-gray-400">{LABEL_MAP[type]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Palette resize handle */}
      <div className="sp-palette-resize bg-[var(--border)] hover:bg-purple-500" onMouseDown={onPalResizeStart} />

      {/* Stage area */}
      <div className="sp-stage-area">
        {/* Info bar */}
        <div className="sp-info-bar">
          <div className="sp-info-field">
            <label className="text-gray-500">Band</label>
            <input
              type="text"
              value={bandName}
              onChange={(e) => setBandName(e.target.value)}
              placeholder="Band Name"
              className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] focus:border-purple-500"
            />
          </div>
          <div className="sp-info-field">
            <label className="text-gray-500">Event</label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Event / Venue"
              className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] focus:border-purple-500"
            />
          </div>
          <div className="sp-info-field">
            <label className="text-gray-500">Date</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] focus:border-purple-500"
            />
          </div>
        </div>

        <div className="sp-stage-label text-gray-500">Front of Stage (Audience)</div>

        {/* Stage canvas */}
        <div ref={wrapperRef} className="sp-stage-wrapper">
          <div
            ref={stageRef}
            className={`sp-stage border-2 border-[var(--border)] bg-[var(--bg-primary)] ${dragOver ? 'drag-over border-purple-500' : ''}`}
            style={{ width: stageW, height: stageH }}
            onDragOver={onStageDragOver}
            onDragLeave={onStageDragLeave}
            onDrop={onStageDrop}
          >
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="sp-stage-item"
                style={{ left: item.x, top: item.y }}
                draggable
                onDragStart={(e) => onItemDragStart(e, idx)}
                onDragEnd={onItemDragEnd}
              >
                <span dangerouslySetInnerHTML={{ __html: SVG_TEMPLATES[item.type] }} />
                <span className="sp-item-label bg-black/50 text-gray-300">{LABEL_MAP[item.type]}</span>
                <button className="sp-delete-btn bg-red-500" onClick={() => removeItem(idx)}>&times;</button>
              </div>
            ))}
          </div>

          {/* Resize handles */}
          <div className="sp-resize-handle sp-resize-r" onMouseDown={(e) => onResizeStart(e, 'r')} />
          <div className="sp-resize-handle sp-resize-b" onMouseDown={(e) => onResizeStart(e, 'b')} />
          <div className="sp-resize-handle sp-resize-br" onMouseDown={(e) => onResizeStart(e, 'br')} />
        </div>

        <div className="sp-stage-label text-gray-500">Back of Stage</div>
        <div className="text-xs text-gray-600 mt-1">{stageW} &times; {stageH}</div>
      </div>
    </div>
  );
}

// ─── Main component (list + editor) ───
export default function StagePlotCreator({ workspaceId }) {
  const [plots, setPlots] = useState([]);
  const [activePlotId, setActivePlotId] = useState(null);
  const [activePlotData, setActivePlotData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Fetch all plots
  useEffect(() => {
    let mounted = true;
    api.getStagePlots(workspaceId).then(data => {
      if (mounted) {
        setPlots(data);
        setLoading(false);
      }
    }).catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [workspaceId]);

  const openPlot = async (id) => {
    try {
      const plot = await api.getStagePlot(id);
      setActivePlotId(id);
      setActivePlotData(plot.data || { items: [], stageWidth: 900, stageHeight: 500 });
    } catch {
      // handle error silently
    }
  };

  const createPlot = async () => {
    setCreating(true);
    try {
      const plot = await api.createStagePlot(workspaceId, { title: 'New Stage Plot' });
      setPlots(prev => [plot, ...prev]);
      setActivePlotId(plot.id);
      setActivePlotData(plot.data);
    } catch {
      // handle error silently
    }
    setCreating(false);
  };

  const savePlot = async (data) => {
    if (!activePlotId) return;
    try {
      await api.updateStagePlot(activePlotId, { data });
    } catch {
      // handle error silently
    }
  };

  const deletePlot = async (id) => {
    try {
      await api.deleteStagePlot(id);
      setPlots(prev => prev.filter(p => p.id !== id));
      if (activePlotId === id) {
        setActivePlotId(null);
        setActivePlotData(null);
      }
    } catch {
      // handle error silently
    }
  };

  const duplicatePlot = async (id) => {
    try {
      const plot = await api.duplicateStagePlot(id);
      setPlots(prev => [plot, ...prev]);
    } catch {
      // handle error silently
    }
  };

  const renamePlot = async (id, title) => {
    try {
      const updated = await api.updateStagePlot(id, { title });
      setPlots(prev => prev.map(p => p.id === id ? { ...p, title: updated.title } : p));
    } catch {
      // handle error silently
    }
  };

  // ── Editor view ──
  if (activePlotId && activePlotData) {
    const activePlot = plots.find(p => p.id === activePlotId);
    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-surface)]">
          <button
            onClick={() => { setActivePlotId(null); setActivePlotData(null); }}
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            &larr; Back
          </button>
          <input
            className="bg-transparent border-none text-sm font-medium text-[var(--text-primary)] focus:outline-none flex-1 min-w-0"
            value={activePlot?.title || ''}
            onChange={(e) => {
              const title = e.target.value;
              setPlots(prev => prev.map(p => p.id === activePlotId ? { ...p, title } : p));
              clearTimeout(renamePlot._timer);
              renamePlot._timer = setTimeout(() => renamePlot(activePlotId, title), 600);
            }}
          />
          <span className="text-xs text-gray-500">Auto-saved</span>
        </div>

        {/* Stage editor */}
        <div className="flex-1 overflow-hidden">
          <StageEditor
            plotData={activePlotData}
            onChange={setActivePlotData}
            onSave={savePlot}
          />
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Stage Plots</h2>
        <button
          onClick={createPlot}
          disabled={creating}
          className="btn btn-primary text-sm px-4 py-2"
        >
          {creating ? 'Creating...' : '+ New Stage Plot'}
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading...</div>
      ) : plots.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🎸</div>
          <p className="text-gray-400 mb-1">No stage plots yet</p>
          <p className="text-gray-500 text-sm">Create your first stage plot to share with sound engineers and venues.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {plots.map(plot => (
            <div
              key={plot.id}
              className="sp-list-item flex items-center gap-3 px-4 py-3 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-surface)] cursor-pointer"
              onClick={() => openPlot(plot.id)}
            >
              <div className="text-2xl">🎤</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-[var(--text-primary)] truncate">{plot.title}</div>
                <div className="text-xs text-gray-500">
                  {plot.createdBy?.displayName && `by ${plot.createdBy.displayName} · `}
                  {new Date(plot.updatedAt).toLocaleDateString()}
                  {plot.gig && ` · ${plot.gig.title}`}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); duplicatePlot(plot.id); }}
                  className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
                  title="Duplicate"
                >
                  📋
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm('Delete this stage plot?')) deletePlot(plot.id); }}
                  className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
