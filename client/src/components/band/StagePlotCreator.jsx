import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../services/api';
import '../../../styles/stagePlot.css';

// ─── SVG icon templates ───
// Colors brightened for dark mode visibility while keeping realistic silhouette feel
const SVG_TEMPLATES = {
  vocals: `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="28" y="8" width="8" height="20" rx="4" fill="#e74c3c"/><path d="M22 18v6a10 10 0 0 0 20 0v-6" fill="none" stroke="#e74c3c" stroke-width="2.5"/><line x1="32" y1="34" x2="32" y2="46" stroke="#e74c3c" stroke-width="2.5"/><line x1="24" y1="46" x2="40" y2="46" stroke="#e74c3c" stroke-width="2.5"/><line x1="32" y1="46" x2="32" y2="56" stroke="#aaa" stroke-width="2"/><circle cx="32" cy="58" r="3" fill="#aaa"/></svg>`,
  'mic-stand': `<svg viewBox="0 0 64 64" width="48" height="48"><circle cx="22" cy="10" r="5" fill="none" stroke="#e74c3c" stroke-width="2"/><line x1="27" y1="10" x2="42" y2="10" stroke="#aaa" stroke-width="2"/><line x1="32" y1="10" x2="32" y2="54" stroke="#aaa" stroke-width="2"/><line x1="22" y1="54" x2="42" y2="54" stroke="#aaa" stroke-width="2.5"/><circle cx="32" cy="54" r="2" fill="#aaa"/></svg>`,
  'electric-guitar': `<img src="/guitar_01.png" width="48" height="48" style="object-fit:contain" alt="Electric Guitar" />`,
  'acoustic-guitar': `<img src="/ac_guitar_01.png" width="48" height="48" style="object-fit:contain" alt="Acoustic Guitar" />`,
  'guitar-combo': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="14" y="14" width="36" height="40" rx="4" fill="#6b4f30"/><rect x="17" y="17" width="30" height="18" rx="2" fill="#4a3620"/><circle cx="32" cy="26" r="7" fill="none" stroke="#8b6940" stroke-width="1.5"/><circle cx="32" cy="26" r="3" fill="none" stroke="#8b6940" stroke-width="1"/><circle cx="22" cy="44" r="1.5" fill="#e67e22"/><circle cx="28" cy="44" r="1.5" fill="#e67e22"/><circle cx="34" cy="44" r="1.5" fill="#e67e22"/><rect x="38" y="42" width="6" height="4" rx="1" fill="#e67e22"/><text x="32" y="10" text-anchor="middle" font-size="7" fill="#e67e22" font-weight="bold">COMBO</text></svg>`,
  'guitar-212': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="10" y="14" width="44" height="40" rx="4" fill="#4a6a85"/><rect x="13" y="17" width="38" height="22" rx="2" fill="#2d4a60"/><circle cx="24" cy="28" r="7" fill="none" stroke="#7a9ab0" stroke-width="1.5"/><circle cx="40" cy="28" r="7" fill="none" stroke="#7a9ab0" stroke-width="1.5"/><circle cx="18" cy="48" r="1.5" fill="#e67e22"/><circle cx="24" cy="48" r="1.5" fill="#e67e22"/><circle cx="30" cy="48" r="1.5" fill="#e67e22"/><circle cx="36" cy="48" r="1.5" fill="#e67e22"/><circle cx="42" cy="48" r="1.5" fill="#e67e22"/><text x="32" y="10" text-anchor="middle" font-size="7" fill="#e67e22" font-weight="bold">GTR 2x12</text></svg>`,
  'guitar-halfstack': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="12" y="6" width="40" height="14" rx="3" fill="#4a6a85"/><circle cx="20" cy="13" r="1.5" fill="#e67e22"/><circle cx="26" cy="13" r="1.5" fill="#e67e22"/><circle cx="32" cy="13" r="1.5" fill="#e67e22"/><rect x="38" y="10" width="10" height="5" rx="1" fill="#2d4a60"/><rect x="10" y="22" width="44" height="36" rx="4" fill="#4a6a85"/><rect x="13" y="25" width="38" height="28" rx="2" fill="#2d4a60"/><circle cx="24" cy="33" r="6" fill="none" stroke="#7a9ab0" stroke-width="1.5"/><circle cx="40" cy="33" r="6" fill="none" stroke="#7a9ab0" stroke-width="1.5"/><circle cx="24" cy="47" r="6" fill="none" stroke="#7a9ab0" stroke-width="1.5"/><circle cx="40" cy="47" r="6" fill="none" stroke="#7a9ab0" stroke-width="1.5"/></svg>`,
  'guitar-fullstack': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="14" y="2" width="36" height="10" rx="2" fill="#4a6a85"/><circle cx="22" cy="7" r="1.2" fill="#e67e22"/><circle cx="27" cy="7" r="1.2" fill="#e67e22"/><circle cx="32" cy="7" r="1.2" fill="#e67e22"/><rect x="36" y="5" width="8" height="4" rx="1" fill="#2d4a60"/><rect x="12" y="13" width="40" height="24" rx="3" fill="#4a6a85"/><rect x="14" y="15" width="36" height="20" rx="2" fill="#2d4a60"/><circle cx="24" cy="21" r="4.5" fill="none" stroke="#7a9ab0" stroke-width="1.2"/><circle cx="40" cy="21" r="4.5" fill="none" stroke="#7a9ab0" stroke-width="1.2"/><circle cx="24" cy="31" r="4.5" fill="none" stroke="#7a9ab0" stroke-width="1.2"/><circle cx="40" cy="31" r="4.5" fill="none" stroke="#7a9ab0" stroke-width="1.2"/><rect x="12" y="38" width="40" height="24" rx="3" fill="#4a6a85"/><rect x="14" y="40" width="36" height="20" rx="2" fill="#2d4a60"/><circle cx="24" cy="46" r="4.5" fill="none" stroke="#7a9ab0" stroke-width="1.2"/><circle cx="40" cy="46" r="4.5" fill="none" stroke="#7a9ab0" stroke-width="1.2"/><circle cx="24" cy="56" r="4.5" fill="none" stroke="#7a9ab0" stroke-width="1.2"/><circle cx="40" cy="56" r="4.5" fill="none" stroke="#7a9ab0" stroke-width="1.2"/></svg>`,
  'guitar-stand': `<svg viewBox="0 0 64 64" width="48" height="48"><line x1="32" y1="8" x2="32" y2="48" stroke="#aaa" stroke-width="2.5"/><line x1="32" y1="48" x2="18" y2="58" stroke="#aaa" stroke-width="2"/><line x1="32" y1="48" x2="46" y2="58" stroke="#aaa" stroke-width="2"/><line x1="26" y1="18" x2="38" y2="18" stroke="#aaa" stroke-width="2"/><path d="M28 12 Q32 8 36 12" fill="none" stroke="#aaa" stroke-width="2"/><circle cx="18" cy="58" r="2" fill="#888"/><circle cx="46" cy="58" r="2" fill="#888"/></svg>`,
  'bass-guitar': `<img src="/bass_01.png" width="48" height="48" style="object-fit:contain" alt="Bass Guitar" />`,
  'bass-combo': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="12" y="14" width="40" height="40" rx="4" fill="#2d4a60"/><rect x="15" y="17" width="34" height="20" rx="2" fill="#1e3548"/><circle cx="32" cy="27" r="8" fill="none" stroke="#4a7a9a" stroke-width="1.5"/><circle cx="32" cy="27" r="4" fill="none" stroke="#4a7a9a" stroke-width="1"/><circle cx="20" cy="46" r="1.5" fill="#3498db"/><circle cx="26" cy="46" r="1.5" fill="#3498db"/><circle cx="32" cy="46" r="1.5" fill="#3498db"/><rect x="36" y="44" width="8" height="4" rx="1" fill="#3498db"/><text x="32" y="10" text-anchor="middle" font-size="7" fill="#3498db" font-weight="bold">COMBO</text></svg>`,
  'bass-115': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="10" y="12" width="44" height="44" rx="4" fill="#2d4a60"/><rect x="13" y="15" width="38" height="36" rx="2" fill="#1e3548"/><circle cx="32" cy="33" r="14" fill="none" stroke="#4a7a9a" stroke-width="2"/><circle cx="32" cy="33" r="7" fill="none" stroke="#4a7a9a" stroke-width="1"/><circle cx="32" cy="33" r="2" fill="#4a7a9a"/><text x="32" y="9" text-anchor="middle" font-size="7" fill="#3498db" font-weight="bold">1x15</text></svg>`,
  'bass-410': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="10" y="10" width="44" height="46" rx="4" fill="#2d4a60"/><rect x="13" y="13" width="38" height="38" rx="2" fill="#1e3548"/><circle cx="24" cy="24" r="6.5" fill="none" stroke="#4a7a9a" stroke-width="1.5"/><circle cx="40" cy="24" r="6.5" fill="none" stroke="#4a7a9a" stroke-width="1.5"/><circle cx="24" cy="40" r="6.5" fill="none" stroke="#4a7a9a" stroke-width="1.5"/><circle cx="40" cy="40" r="6.5" fill="none" stroke="#4a7a9a" stroke-width="1.5"/><text x="32" y="7" text-anchor="middle" font-size="7" fill="#3498db" font-weight="bold">4x10</text></svg>`,
  'bass-stack': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="14" y="4" width="36" height="12" rx="2" fill="#2d4a60"/><circle cx="22" cy="10" r="1.5" fill="#3498db"/><circle cx="28" cy="10" r="1.5" fill="#3498db"/><rect x="34" y="7" width="10" height="5" rx="1" fill="#1e3548"/><rect x="12" y="18" width="40" height="42" rx="3" fill="#2d4a60"/><rect x="14" y="20" width="36" height="38" rx="2" fill="#1e3548"/><circle cx="24" cy="30" r="6" fill="none" stroke="#4a7a9a" stroke-width="1.5"/><circle cx="40" cy="30" r="6" fill="none" stroke="#4a7a9a" stroke-width="1.5"/><circle cx="24" cy="46" r="6" fill="none" stroke="#4a7a9a" stroke-width="1.5"/><circle cx="40" cy="46" r="6" fill="none" stroke="#4a7a9a" stroke-width="1.5"/></svg>`,
  keyboard: `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="8" y="28" width="48" height="20" rx="3" fill="#4a6a85"/><rect x="12" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="18" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="24" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="30" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="36" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="42" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="48" y="32" width="4" height="12" rx="1" fill="#ecf0f1"/><rect x="15" y="32" width="3" height="7" rx="0.5" fill="#2d4a60"/><rect x="21" y="32" width="3" height="7" rx="0.5" fill="#2d4a60"/><rect x="33" y="32" width="3" height="7" rx="0.5" fill="#2d4a60"/><rect x="39" y="32" width="3" height="7" rx="0.5" fill="#2d4a60"/><rect x="45" y="32" width="3" height="7" rx="0.5" fill="#2d4a60"/><text x="32" y="24" text-anchor="middle" font-size="8" fill="#9b59b6" font-weight="bold">KEYS</text></svg>`,
  'keyboard-stand': `<svg viewBox="0 0 64 64" width="48" height="48"><line x1="16" y1="22" x2="48" y2="22" stroke="#9b59b6" stroke-width="3" stroke-linecap="round"/><line x1="18" y1="22" x2="32" y2="54" stroke="#aaa" stroke-width="2"/><line x1="46" y1="22" x2="32" y2="54" stroke="#aaa" stroke-width="2"/><line x1="22" y1="54" x2="42" y2="54" stroke="#aaa" stroke-width="2"/><line x1="20" y1="38" x2="44" y2="38" stroke="#aaa" stroke-width="1.5"/></svg>`,
  drums: `<svg viewBox="0 0 64 64" width="48" height="48"><ellipse cx="32" cy="40" r="12" ry="8" fill="none" stroke="#e74c3c" stroke-width="2"/><ellipse cx="18" cy="28" r="7" ry="5" fill="none" stroke="#f39c12" stroke-width="1.5"/><ellipse cx="46" cy="28" r="7" ry="5" fill="none" stroke="#f39c12" stroke-width="1.5"/><ellipse cx="32" cy="18" r="8" ry="5" fill="none" stroke="#e67e22" stroke-width="1.5"/><circle cx="12" cy="16" r="5" fill="none" stroke="#c0392b" stroke-width="1.5"/><circle cx="52" cy="16" r="5" fill="none" stroke="#c0392b" stroke-width="1.5"/><ellipse cx="22" cy="52" r="6" ry="3" fill="none" stroke="#95a5a6" stroke-width="1.5"/><ellipse cx="42" cy="52" r="6" ry="3" fill="none" stroke="#95a5a6" stroke-width="1.5"/></svg>`,
  piano: `<svg viewBox="0 0 64 64" width="48" height="48"><path d="M16 52 Q8 40 10 24 Q12 12 32 8 Q52 12 54 24 Q56 40 48 52 Z" fill="#3a3a3a" stroke="#666" stroke-width="1.5"/><path d="M20 48 Q14 38 16 26 Q18 18 32 14 Q46 18 48 26 Q50 38 44 48 Z" fill="#4a4a4a"/><rect x="22" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1"/><rect x="26" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1"/><rect x="30" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1"/><rect x="34" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1"/><rect x="38" y="38" width="3" height="8" rx="0.5" fill="#ecf0f1"/><line x1="16" y1="52" x2="12" y2="58" stroke="#666" stroke-width="2"/><line x1="48" y1="52" x2="52" y2="58" stroke="#666" stroke-width="2"/><line x1="32" y1="52" x2="32" y2="58" stroke="#666" stroke-width="2"/></svg>`,
  'monitor-wedge': `<svg viewBox="0 0 64 64" width="48" height="48"><path d="M10 44 L14 24 L50 24 L54 44 Z" fill="#555" stroke="#777" stroke-width="1.5"/><rect x="18" y="28" width="28" height="12" rx="2" fill="#333"/><ellipse cx="32" cy="34" r="4" ry="3" fill="none" stroke="#888" stroke-width="1"/><text x="32" y="54" text-anchor="middle" font-size="7" fill="#2ecc71" font-weight="bold">MON</text></svg>`,
  'di-box': `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="16" y="20" width="32" height="24" rx="3" fill="#444"/><rect x="18" y="22" width="28" height="20" rx="2" fill="#333"/><circle cx="26" cy="32" r="4" fill="none" stroke="#e67e22" stroke-width="1.5"/><circle cx="38" cy="32" r="4" fill="none" stroke="#e67e22" stroke-width="1.5"/><text x="32" y="54" text-anchor="middle" font-size="7" fill="#e67e22" font-weight="bold">DI</text></svg>`,
  pedalboard: `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="8" y="22" width="48" height="24" rx="4" fill="#333" stroke="#555" stroke-width="1"/><rect x="12" y="26" width="10" height="16" rx="2" fill="#2c3e50"/><rect x="27" y="26" width="10" height="16" rx="2" fill="#2c3e50"/><rect x="42" y="26" width="10" height="16" rx="2" fill="#2c3e50"/><circle cx="17" cy="30" r="2" fill="#e74c3c"/><circle cx="32" cy="30" r="2" fill="#2ecc71"/><circle cx="47" cy="30" r="2" fill="#3498db"/><rect x="14" y="36" width="6" height="4" rx="1" fill="#aaa"/><rect x="29" y="36" width="6" height="4" rx="1" fill="#aaa"/><rect x="44" y="36" width="6" height="4" rx="1" fill="#aaa"/></svg>`,
  text: `<svg viewBox="0 0 64 64" width="48" height="48"><rect x="8" y="16" width="48" height="32" rx="4" fill="none" stroke="#9b59b6" stroke-width="2" stroke-dasharray="4 2"/><text x="32" y="37" text-anchor="middle" font-size="14" fill="#9b59b6" font-weight="bold">Aa</text></svg>`,
};

const LABEL_MAP = {
  vocals: 'Vocals', 'mic-stand': 'Mic Stand',
  'electric-guitar': 'Electric Gtr', 'acoustic-guitar': 'Acoustic Gtr',
  'guitar-combo': 'Gtr Combo', 'guitar-212': 'Gtr 2x12',
  'guitar-halfstack': 'Gtr Half', 'guitar-fullstack': 'Gtr Full',
  'guitar-stand': 'Guitar Stand',
  'bass-guitar': 'Bass Guitar',
  'bass-combo': 'Bass Combo', 'bass-115': 'Bass 1x15', 'bass-410': 'Bass 4x10',
  'bass-stack': 'Bass Stack',
  keyboard: 'Keys', 'keyboard-stand': 'Keys Stand', piano: 'Piano',
  drums: 'Drums',
  'monitor-wedge': 'Monitor', 'di-box': 'DI Box', pedalboard: 'Pedalboard',
  text: 'Text Label',
};

const PALETTE_SECTIONS = [
  { label: 'Vocals', items: ['vocals', 'mic-stand'] },
  { label: 'Guitar', items: ['electric-guitar', 'acoustic-guitar', 'guitar-combo', 'guitar-212', 'guitar-halfstack', 'guitar-fullstack', 'guitar-stand'] },
  { label: 'Bass', items: ['bass-guitar', 'bass-combo', 'bass-115', 'bass-410', 'bass-stack'] },
  { label: 'Keys / Piano', items: ['keyboard', 'keyboard-stand', 'piano'] },
  { label: 'Drums', items: ['drums'] },
  { label: 'Monitors / PA', items: ['monitor-wedge', 'di-box', 'pedalboard'] },
  { label: 'Other', items: ['text'] },
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
  const [collapsedSections, setCollapsedSections] = useState({});

  const toggleSection = (label) => {
    setCollapsedSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

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
      const newItem = { type: d.type, x, y, id: Date.now() + Math.random() };
      if (d.type === 'text') newItem.text = 'Label';
      setItems(prev => [...prev, newItem]);
    }
    dragRef.current = { type: null, item: null, offsetX: 0, offsetY: 0 };
  };

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const updateItemText = (idx, text) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, text } : it));
  };

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
      <div ref={paletteRef} className="sp-palette bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Instruments</h3>
        {PALETTE_SECTIONS.map(section => (
          <div key={section.label}>
            <div
              className="sp-palette-section sp-palette-section-toggle text-[var(--color-text-muted)] border-t border-[var(--color-border)]"
              onClick={() => toggleSection(section.label)}
            >
              <span className={`sp-section-chevron ${collapsedSections[section.label] ? 'collapsed' : ''}`}>&#9662;</span>
              {section.label}
            </div>
            {!collapsedSections[section.label] && section.items.map(type => (
              <div
                key={type}
                className="sp-palette-item border border-[var(--color-border)] hover:border-purple-500 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)]"
                draggable
                onDragStart={(e) => onPaletteDragStart(e, type)}
              >
                <span dangerouslySetInnerHTML={{ __html: SVG_TEMPLATES[type] }} />
                <span className="text-[var(--color-text-secondary)]">{LABEL_MAP[type]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Palette resize handle */}
      <div className="sp-palette-resize bg-[var(--color-border)] hover:bg-purple-500" onMouseDown={onPalResizeStart} />

      {/* Stage area */}
      <div className="sp-stage-area">
        {/* Info bar */}
        <div className="sp-info-bar">
          <div className="sp-info-field">
            <label className="text-[var(--color-text-muted)]">Band</label>
            <input
              type="text"
              value={bandName}
              onChange={(e) => setBandName(e.target.value)}
              placeholder="Band Name"
              className="bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border)] focus:border-purple-500"
            />
          </div>
          <div className="sp-info-field">
            <label className="text-[var(--color-text-muted)]">Event</label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Event / Venue"
              className="bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border)] focus:border-purple-500"
            />
          </div>
          <div className="sp-info-field">
            <label className="text-[var(--color-text-muted)]">Date</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border)] focus:border-purple-500"
            />
          </div>
        </div>

        <div className="sp-stage-label text-[var(--color-text-muted)]">Back of Stage</div>

        {/* Stage canvas */}
        <div ref={wrapperRef} className="sp-stage-wrapper">
          <div
            ref={stageRef}
            className={`sp-stage border-2 bg-[var(--color-bg-secondary)] ${dragOver ? 'drag-over border-purple-500' : 'border-[var(--color-border)]'}`}
            style={{ width: stageW, height: stageH }}
            onDragOver={onStageDragOver}
            onDragLeave={onStageDragLeave}
            onDrop={onStageDrop}
          >
            {items.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[var(--color-text-muted)] text-sm border-2 border-dashed border-[var(--color-border)] rounded-lg px-6 py-3">
                  Drag instruments here
                </span>
              </div>
            )}
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`sp-stage-item ${item.type === 'text' ? 'sp-stage-text' : ''}`}
                style={{ left: item.x, top: item.y }}
                draggable
                onDragStart={(e) => onItemDragStart(e, idx)}
                onDragEnd={onItemDragEnd}
              >
                {item.type === 'text' ? (
                  <input
                    className="sp-text-input"
                    value={item.text || ''}
                    onChange={(e) => updateItemText(idx, e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    draggable={false}
                    placeholder="Type here..."
                  />
                ) : (
                  <>
                    <span dangerouslySetInnerHTML={{ __html: SVG_TEMPLATES[item.type] }} />
                    <span className="sp-item-label bg-black/60 text-white">{LABEL_MAP[item.type]}</span>
                  </>
                )}
                <button className="sp-delete-btn bg-red-500" onClick={() => removeItem(idx)}>&times;</button>
              </div>
            ))}
          </div>

          {/* Resize handles */}
          <div className="sp-resize-handle sp-resize-r" onMouseDown={(e) => onResizeStart(e, 'r')} />
          <div className="sp-resize-handle sp-resize-b" onMouseDown={(e) => onResizeStart(e, 'b')} />
          <div className="sp-resize-handle sp-resize-br" onMouseDown={(e) => onResizeStart(e, 'br')} />
        </div>

        <div className="sp-stage-label text-[var(--color-text-muted)]">Front of Stage (Audience)</div>
        <div className="text-xs text-[var(--color-text-muted)] mt-1">{stageW} &times; {stageH}</div>
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

  // Print/PDF export
  const handlePrint = () => {
    if (!activePlotData) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const data = activePlotData;
    const plotTitle = plots.find(p => p.id === activePlotId)?.title || 'Stage Plot';
    const bandName = data.bandName || '';
    const eventName = data.eventName || '';
    const eventDate = data.eventDate || '';
    const sw = data.stageWidth || 900;
    const sh = data.stageHeight || 500;
    const items = data.items || [];

    const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Render items as absolutely positioned elements
    const itemsHtml = items.map(item => {
      if (item.type === 'text') {
        return `<div style="position:absolute;left:${item.x}px;top:${item.y}px;font-size:12px;font-weight:500;color:#333;background:rgba(200,200,200,0.3);border:1px dashed #999;border-radius:3px;padding:2px 6px;white-space:nowrap">${escHtml(item.text || '')}</div>`;
      }
      const svg = SVG_TEMPLATES[item.type] || '';
      const label = LABEL_MAP[item.type] || item.type;
      return `<div style="position:absolute;left:${item.x}px;top:${item.y}px;display:flex;flex-direction:column;align-items:center;gap:2px">${svg}<span style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;background:rgba(0,0,0,0.6);color:#fff;padding:1px 4px;border-radius:2px;white-space:nowrap">${escHtml(label)}</span></div>`;
    }).join('');

    const isLandscape = sw > sh;
    const headerParts = [bandName, eventName, eventDate].filter(Boolean);

    const html = `<!DOCTYPE html><html><head><title>${escHtml(plotTitle)}</title><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      @page { ${isLandscape ? 'size:landscape;' : ''} margin:12mm; }
      body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding:20px; }
      .header { text-align:center; margin-bottom:16px; padding-bottom:12px; border-bottom:2px solid #222; }
      .plot-title { font-size:24px; font-weight:800; letter-spacing:1px; text-transform:uppercase; }
      .plot-meta { font-size:14px; color:#666; margin-top:4px; }
      .stage-container { display:flex; flex-direction:column; align-items:center; }
      .front-label { font-size:11px; text-transform:uppercase; letter-spacing:2px; color:#999; margin-bottom:6px; }
      .stage { position:relative; border:2px solid #333; border-radius:6px; background:#f8f8f8; background-image:linear-gradient(#ddd 1px,transparent 1px),linear-gradient(90deg,#ddd 1px,transparent 1px); background-size:40px 40px; overflow:hidden; }
      .back-label { font-size:11px; text-transform:uppercase; letter-spacing:2px; color:#999; margin-top:6px; }
      .dimensions { font-size:10px; color:#bbb; margin-top:4px; }
    </style></head><body>
      <div class="header">
        <div class="plot-title">${escHtml(plotTitle)}</div>
        ${headerParts.length ? `<div class="plot-meta">${headerParts.map(escHtml).join(' &middot; ')}</div>` : ''}
      </div>
      <div class="stage-container">
        <div class="back-label">Back of Stage</div>
        <div class="stage" style="width:${sw}px;height:${sh}px">${itemsHtml}</div>
        <div class="front-label">Front of Stage / Audience</div>
        <div class="dimensions">${sw} &times; ${sh}</div>
      </div>
      <script>window.onload=function(){window.print();}<\/script>
    </body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  // ── Editor view ──
  if (activePlotId && activePlotData) {
    const activePlot = plots.find(p => p.id === activePlotId);
    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <button
            onClick={() => { setActivePlotId(null); setActivePlotData(null); }}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors text-sm"
          >
            &larr; Back
          </button>
          <input
            className="bg-transparent border-none text-sm font-medium text-[var(--color-text-primary)] focus:outline-none flex-1 min-w-0"
            value={activePlot?.title || ''}
            onChange={(e) => {
              const title = e.target.value;
              setPlots(prev => prev.map(p => p.id === activePlotId ? { ...p, title } : p));
              clearTimeout(renamePlot._timer);
              renamePlot._timer = setTimeout(() => renamePlot(activePlotId, title), 600);
            }}
          />
          <span className="text-xs text-[var(--color-text-muted)]">Auto-saved</span>
          <button
            onClick={handlePrint}
            className="px-3 py-1 rounded text-xs bg-orange-600 hover:bg-orange-500 text-white transition-colors"
            title="Print or save as PDF"
          >
            Print / PDF
          </button>
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
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Stage Plots</h2>
        <button
          onClick={createPlot}
          disabled={creating}
          className="btn bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2"
        >
          {creating ? 'Creating...' : '+ New Stage Plot'}
        </button>
      </div>

      {loading ? (
        <div className="text-[var(--color-text-muted)] text-sm">Loading...</div>
      ) : plots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-4">🎤</div>
          <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
            No stage plots yet
          </h3>
          <p className="text-[var(--color-text-muted)] max-w-sm mb-4">
            Create stage plots to share with sound engineers and venues. Drag and drop instruments to lay out your setup.
          </p>
          <button
            onClick={createPlot}
            disabled={creating}
            className="btn bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2"
          >
            + Create Stage Plot
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {plots.map(plot => (
            <div
              key={plot.id}
              className="sp-list-item flex items-center gap-3 px-4 py-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] cursor-pointer transition-colors"
              onClick={() => openPlot(plot.id)}
            >
              <div className="text-2xl">🎤</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-[var(--color-text-primary)] truncate">{plot.title}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {plot.createdBy?.displayName && `by ${plot.createdBy.displayName} · `}
                  {new Date(plot.updatedAt).toLocaleDateString()}
                  {plot.gig && ` · ${plot.gig.title}`}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); duplicatePlot(plot.id); }}
                  className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  title="Duplicate"
                >
                  📋
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm('Delete this stage plot?')) deletePlot(plot.id); }}
                  className="p-1.5 text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
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
