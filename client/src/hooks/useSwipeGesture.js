import { useRef, useEffect, useCallback } from 'react';

/**
 * Custom hook for detecting horizontal swipe gestures on mobile.
 *
 * Options:
 *   onSwipeLeft  - callback fired on a valid left swipe
 *   onSwipeRight - callback fired on a valid right swipe
 *   edgeOnly     - when true, only triggers when the touch starts within 30px of either screen edge
 *
 * Thresholds:
 *   - Direction lock: |deltaX| must exceed |deltaY| * 1.5 before committing
 *   - Minimum distance: 50px horizontal travel
 *   - Minimum velocity: 0.3 px/ms
 */
export default function useSwipeGesture({ onSwipeLeft, onSwipeRight, edgeOnly = false } = {}) {
  const ref = useRef(null);
  const touchState = useRef(null);

  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);

  // Keep callback refs up to date without re-registering listeners
  useEffect(() => {
    onSwipeLeftRef.current = onSwipeLeft;
    onSwipeRightRef.current = onSwipeRight;
  }, [onSwipeLeft, onSwipeRight]);

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];

    // If edgeOnly, reject touches that don't start near a screen edge
    if (edgeOnly) {
      const x = touch.clientX;
      const screenWidth = window.innerWidth;
      if (x > 30 && x < screenWidth - 30) {
        touchState.current = null;
        return;
      }
    }

    touchState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      locked: false, // true once we've committed to a horizontal swipe
    };
  }, [edgeOnly]);

  const handleTouchMove = useCallback((e) => {
    if (!touchState.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - touchState.current.startX;
    const deltaY = touch.clientY - touchState.current.startY;

    // Once we lock to horizontal, prevent vertical scrolling
    if (touchState.current.locked) {
      e.preventDefault();
      return;
    }

    // Check direction lock: commit to horizontal only when ratio is met
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (absDeltaX > 10 || absDeltaY > 10) {
      if (absDeltaX > absDeltaY * 1.5) {
        touchState.current.locked = true;
        e.preventDefault();
      } else {
        // Vertical dominant -- abandon gesture
        touchState.current = null;
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!touchState.current || !touchState.current.locked) {
      touchState.current = null;
      return;
    }

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchState.current.startX;
    const duration = Date.now() - touchState.current.startTime;

    touchState.current = null;

    const absDeltaX = Math.abs(deltaX);

    // Must travel at least 50px
    if (absDeltaX < 50) return;

    // Must meet velocity threshold (0.3 px/ms)
    if (duration === 0 || absDeltaX / duration < 0.3) return;

    if (deltaX > 0 && onSwipeRightRef.current) {
      onSwipeRightRef.current();
    } else if (deltaX < 0 && onSwipeLeftRef.current) {
      onSwipeLeftRef.current();
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Use { passive: false } so we can call preventDefault in touchmove
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return ref;
}
