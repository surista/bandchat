import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

export default function ImageLightbox({ images: imagesProp, initialIndex = 0, src, alt, onClose }) {
  // Backward compatibility: convert legacy single-image props to array
  const images = useMemo(() => {
    if (imagesProp && imagesProp.length > 0) return imagesProp;
    if (src) return [{ src, alt }];
    return [];
  }, [imagesProp, src, alt]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);

  // Refs for touch tracking (avoid re-renders during gestures)
  const touchStartRef = useRef(null);
  const pinchStartDistRef = useRef(null);
  const pinchStartScaleRef = useRef(null);
  const lastTapRef = useRef(0);
  const panStartRef = useRef({ x: 0, y: 0 });
  const currentTranslateRef = useRef({ x: 0, y: 0 });
  const imageRef = useRef(null);
  const isGestureActiveRef = useRef(false);
  const gestureTypeRef = useRef(null); // 'pinch' | 'swipe-x' | 'swipe-y' | 'pan'

  const isMultiple = images.length > 1;
  const currentImage = images[currentIndex] || {};

  // Reset transform state when switching images
  const resetTransform = useCallback(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    currentTranslateRef.current = { x: 0, y: 0 };
  }, []);

  const goToNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      resetTransform();
      setCurrentIndex(i => i + 1);
    }
  }, [currentIndex, images.length, resetTransform]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      resetTransform();
      setCurrentIndex(i => i - 1);
    }
  }, [currentIndex, resetTransform]);

  // Keyboard handler
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight' && isMultiple) goToNext();
    if (e.key === 'ArrowLeft' && isMultiple) goToPrev();
  }, [onClose, isMultiple, goToNext, goToPrev]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  // Compute distance between two touch points
  const getTouchDistance = (t1, t2) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Touch start
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      // Pinch start
      gestureTypeRef.current = 'pinch';
      isGestureActiveRef.current = true;
      pinchStartDistRef.current = getTouchDistance(e.touches[0], e.touches[1]);
      pinchStartScaleRef.current = scale;
    } else if (e.touches.length === 1) {
      // Single touch start
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      panStartRef.current = { x: translateX, y: translateY };
      currentTranslateRef.current = { x: translateX, y: translateY };
      isGestureActiveRef.current = false;
      gestureTypeRef.current = null;

      // Double-tap detection
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        // Double tap: toggle zoom
        e.preventDefault();
        if (scale > 1) {
          resetTransform();
          setScale(1);
        } else {
          setScale(2.5);
        }
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;
    }
  }, [scale, translateX, translateY, resetTransform]);

  // Touch move
  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && pinchStartDistRef.current != null) {
      // Pinch zoom
      e.preventDefault();
      const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
      const ratio = currentDist / pinchStartDistRef.current;
      const newScale = Math.min(5, Math.max(1, pinchStartScaleRef.current * ratio));
      setScale(newScale);

      // Reset translate if zooming back to 1x
      if (newScale <= 1) {
        setTranslateX(0);
        setTranslateY(0);
        currentTranslateRef.current = { x: 0, y: 0 };
      }
      return;
    }

    if (e.touches.length === 1 && touchStartRef.current) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;

      // Determine gesture type on first significant movement
      if (!gestureTypeRef.current && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
        isGestureActiveRef.current = true;
        if (scale > 1) {
          gestureTypeRef.current = 'pan';
        } else if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0) {
          gestureTypeRef.current = 'swipe-y';
        } else {
          gestureTypeRef.current = 'swipe-x';
        }
      }

      if (gestureTypeRef.current === 'pan') {
        // Pan while zoomed
        e.preventDefault();
        const newX = panStartRef.current.x + deltaX;
        const newY = panStartRef.current.y + deltaY;
        setTranslateX(newX);
        setTranslateY(newY);
        currentTranslateRef.current = { x: newX, y: newY };
      } else if (gestureTypeRef.current === 'swipe-x') {
        // Horizontal swipe preview (visual feedback)
        e.preventDefault();
        setTranslateX(deltaX * 0.5);
      } else if (gestureTypeRef.current === 'swipe-y') {
        // Vertical swipe preview (visual feedback for dismiss)
        e.preventDefault();
        const progress = Math.min(Math.abs(deltaY) / 200, 1);
        setTranslateY(deltaY);
        // Dim the backdrop as user swipes down
        if (imageRef.current) {
          imageRef.current.style.opacity = 1 - progress * 0.4;
        }
      }
    }
  }, [scale]);

  // Touch end
  const handleTouchEnd = useCallback((e) => {
    // Reset pinch state
    if (e.touches.length < 2) {
      pinchStartDistRef.current = null;
      pinchStartScaleRef.current = null;
    }

    if (e.touches.length === 0 && touchStartRef.current) {
      const gestureType = gestureTypeRef.current;

      if (gestureType === 'swipe-y') {
        // Swipe down to dismiss
        if (translateY > 100) {
          onClose();
          return;
        }
        // Snap back
        setTranslateY(0);
        if (imageRef.current) {
          imageRef.current.style.opacity = 1;
        }
      } else if (gestureType === 'swipe-x' && isMultiple) {
        // Swipe left/right to navigate
        if (translateX < -50) {
          goToNext();
        } else if (translateX > 50) {
          goToPrev();
        } else {
          setTranslateX(0);
        }
      } else if (gestureType === 'swipe-x') {
        // Single image, snap back
        setTranslateX(0);
      }

      // Clean up
      touchStartRef.current = null;
      isGestureActiveRef.current = false;
      gestureTypeRef.current = null;
    }
  }, [translateX, translateY, isMultiple, goToNext, goToPrev, onClose]);

  // Backdrop click handler (close if clicking outside image)
  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const imageTransform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;

  if (images.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-10"
        aria-label="Close"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Image counter */}
      {isMultiple && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium z-10 bg-black/40 px-3 py-1 rounded-full">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Previous button */}
      {isMultiple && currentIndex > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); goToPrev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 bg-black/30 hover:bg-black/50 rounded-full p-2"
          aria-label="Previous image"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Next button */}
      {isMultiple && currentIndex < images.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goToNext(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 bg-black/30 hover:bg-black/50 rounded-full p-2"
          aria-label="Next image"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Image */}
      <img
        ref={imageRef}
        src={currentImage.src}
        alt={currentImage.alt || 'Image preview'}
        className="lightbox-image max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        style={{ transform: imageTransform }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        draggable={false}
      />

      {/* Filename / alt text */}
      {currentImage.alt && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm max-w-[80vw] truncate">
          {currentImage.alt}
        </div>
      )}
    </div>,
    document.body
  );
}
