import { useRef, useCallback, useEffect } from 'react';
import { hapticMedium } from '../services/haptic';

const LONG_PRESS_DELAY = 500;
const MOVE_THRESHOLD = 10;

/**
 * Hook for detecting long-press (touch) and right-click (desktop).
 * Returns event handlers to spread onto any element.
 *
 * @param {Object} options
 * @param {function} options.onLongPress - Called with {x, y} when long-press triggers
 * @param {function} [options.onTap] - Called on normal tap (no long-press)
 * @param {boolean} [options.disabled] - Disable the hook
 */
export default function useLongPress({ onLongPress, onTap, disabled = false } = {}) {
  const timerRef = useRef(null);
  const startPos = useRef({ x: 0, y: 0 });
  const triggeredRef = useRef(false);
  const isTouchRef = useRef(false);

  // Keep callback refs fresh without re-renders
  const onLongPressRef = useRef(onLongPress);
  const onTapRef = useRef(onTap);
  onLongPressRef.current = onLongPress;
  onTapRef.current = onTap;

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => clear, [clear]);

  const onTouchStart = useCallback((e) => {
    if (disabled) return;
    isTouchRef.current = true;
    triggeredRef.current = false;

    const touch = e.touches[0];
    startPos.current = { x: touch.clientX, y: touch.clientY };

    clear();
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      hapticMedium();
      onLongPressRef.current?.({ x: touch.clientX, y: touch.clientY });
    }, LONG_PRESS_DELAY);
  }, [disabled, clear]);

  const onTouchMove = useCallback((e) => {
    if (!timerRef.current) return;

    const touch = e.touches[0];
    const dx = touch.clientX - startPos.current.x;
    const dy = touch.clientY - startPos.current.y;

    if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
      clear();
    }
  }, [clear]);

  const onTouchEnd = useCallback((e) => {
    clear();
    if (triggeredRef.current) {
      // Prevent the tap/click that follows a long-press
      e.preventDefault();
      isTouchRef.current = false;
      return;
    }
    isTouchRef.current = false;
    // Normal tap
    if (!disabled) {
      onTapRef.current?.();
    }
  }, [disabled, clear]);

  const onTouchCancel = useCallback(() => {
    clear();
  }, [clear]);

  const onContextMenu = useCallback((e) => {
    if (disabled) return;
    // Prevent default context menu
    e.preventDefault();
    e.stopPropagation();

    // On touch devices, the long-press handler already fired
    if (isTouchRef.current) {
      isTouchRef.current = false;
      return;
    }

    // Desktop right-click
    onLongPressRef.current?.({ x: e.clientX, y: e.clientY });
  }, [disabled]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onContextMenu,
  };
}
