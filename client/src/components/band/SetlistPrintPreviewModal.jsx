import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import { useToast } from '../../context/ToastContext';
import { buildSetlistHtml, printSetlist, exportSetlistAsWord, MIN_FONT_SIZE, MAX_FONT_SIZE } from '../../utils/setlistExport';

/**
 * Live preview of the Print/Word export with a +/- font-size stepper.
 * The auto-fit size (setlistExport's own page-fit solve) is read straight off
 * the generated HTML's data-auto-font attribute rather than recomputed here,
 * so this stays a thin wrapper — buildSetlistHtml is the only place that
 * knows the sizing math.
 */
function SetlistPrintPreviewModal({ setlist, exportOpts, onClose }) {
  const toast = useToast();
  const [fontSize, setFontSize] = useState(null); // null = use auto-fit

  const html = useMemo(
    () => buildSetlistHtml(setlist, { ...exportOpts, autoPrint: false, fontSizeOverride: fontSize }),
    [setlist, exportOpts, fontSize]
  );

  const { autoFont, orientation } = useMemo(() => {
    const m = html.match(/data-auto-font="(\d+)"[^>]*data-orientation="(\w+)"/);
    return { autoFont: m ? Number(m[1]) : MIN_FONT_SIZE, orientation: m ? m[2] : 'portrait' };
  }, [html]);

  const displaySize = fontSize ?? autoFont;
  const isAuto = fontSize == null;

  const adjust = (delta) => {
    setFontSize(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, displaySize + delta)));
  };

  const handlePrint = () => {
    const result = printSetlist(setlist, { ...exportOpts, fontSizeOverride: fontSize });
    if (!result.ok && result.error === 'popup-blocked') {
      toast.warning('Please allow popups for this site to print the setlist');
      return;
    }
    onClose();
  };

  const handleExportWord = () => {
    exportSetlistAsWord(setlist, { ...exportOpts, fontSizeOverride: fontSize });
    onClose();
  };

  // Page aspect ratio (height/width) expressed as a padding-top percentage —
  // driven entirely by the box's own width, so it renders correctly with no
  // dependency on an ancestor having a definite height. `.modal-content` only
  // sets max-height (it shrinks to fit content), so a height-percentage or
  // CSS `aspect-ratio` on the iframe itself had nothing definite to resolve
  // against and collapsed to the browser's ~300x150 default iframe box —
  // that was the "no preview" bug. This technique sidesteps that entirely.
  const pagePaddingTopPct = orientation === 'landscape' ? (8.5 / 11) * 100 : (11 / 8.5) * 100;

  return (
    <Modal isOpen={true} onClose={onClose} title="Preview & Print" maxWidth="max-w-3xl" className="w-full max-h-modal overflow-y-auto">
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <span className="text-sm text-[var(--color-text-muted)]">Text size</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => adjust(-1)}
              disabled={displaySize <= MIN_FONT_SIZE}
              className="w-8 h-8 flex items-center justify-center text-lg font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-30 rounded touch-manipulation"
              aria-label="Smaller text"
            >
              −
            </button>
            <span className="min-w-[4.5rem] text-center text-sm font-medium text-[var(--color-text-primary)]">
              {displaySize}pt{isAuto ? ' (auto)' : ''}
            </span>
            <button
              onClick={() => adjust(1)}
              disabled={displaySize >= MAX_FONT_SIZE}
              className="w-8 h-8 flex items-center justify-center text-lg font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-30 rounded touch-manipulation"
              aria-label="Bigger text"
            >
              +
            </button>
          </div>
          {!isAuto && (
            <button
              onClick={() => setFontSize(null)}
              className="text-sm text-cyan-500 hover:text-cyan-400"
            >
              Reset to fit page
            </button>
          )}
        </div>

        <div className="flex justify-center bg-[var(--color-bg-tertiary)] rounded-lg p-4">
          <div
            className="relative w-full bg-white rounded shadow-lg overflow-hidden"
            style={{ maxWidth: orientation === 'landscape' ? 720 : 480 }}
          >
            <div style={{ paddingTop: `${pagePaddingTopPct}%` }} />
            <iframe
              key={orientation}
              srcDoc={html}
              title="Setlist preview"
              sandbox=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        </div>

        <p className="text-xs text-center text-[var(--color-text-muted)]">
          Bigger text may push a long setlist onto a second page — check the preview above.
        </p>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
          <button onClick={onClose} className="btn bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] text-sm">
            Cancel
          </button>
          <button onClick={handleExportWord} className="btn bg-indigo-600 hover:bg-indigo-500 text-white text-sm" title="Download as a Word document">
            Export Word
          </button>
          <button onClick={handlePrint} className="btn bg-orange-600 hover:bg-orange-500 text-white text-sm" title="Open the print dialog (save as PDF)">
            Print
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default SetlistPrintPreviewModal;
