import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

/**
 * Reusable context menu component.
 * Portal-rendered with frosted backdrop, auto-positions within viewport.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {{x: number, y: number}} props.position - Screen coordinates
 * @param {function} props.onClose
 * @param {Array<{label: string, icon?: string, onClick: function, variant?: string, show?: boolean}>} props.items
 */
function ContextMenu({ isOpen, position, onClose, items }) {
  const menuRef = useRef(null);
  const [adjustedPos, setAdjustedPos] = useState(position);
  const [activeIndex, setActiveIndex] = useState(-1);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Filter to only visible items (memoized to avoid recreating on every render)
  const visibleItems = useMemo(
    () => items.filter(item => item.show !== false),
    [items]
  );

  // Reset position when it changes to avoid stale flash
  useEffect(() => {
    setAdjustedPos(position);
  }, [position]);

  // Auto-position within viewport after render
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const padding = 8;

    let x = position.x;
    let y = position.y;

    if (x + rect.width > window.innerWidth - padding) {
      x = window.innerWidth - rect.width - padding;
    }
    if (y + rect.height > window.innerHeight - padding) {
      y = window.innerHeight - rect.height - padding;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;

    setAdjustedPos({ x, y });
  }, [isOpen, position]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('context-menu-open');
    return () => document.body.classList.remove('context-menu-open');
  }, [isOpen]);

  // Find next non-divider index in direction
  const findNextIndex = useCallback((current, direction) => {
    const len = visibleItems.length;
    let next = current + direction;
    // Wrap around
    if (next >= len) next = 0;
    if (next < 0) next = len - 1;
    // Skip dividers
    let attempts = 0;
    while (visibleItems[next]?.divider && attempts < len) {
      next += direction;
      if (next >= len) next = 0;
      if (next < 0) next = len - 1;
      attempts++;
    }
    return next;
  }, [visibleItems]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onCloseRef.current();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => findNextIndex(prev, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => findNextIndex(prev, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < visibleItems.length && !visibleItems[activeIndex].divider) {
          visibleItems[activeIndex].onClick();
          onCloseRef.current();
        }
        break;
    }
  }, [isOpen, activeIndex, visibleItems, findNextIndex]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Reset active index when menu opens
  useEffect(() => {
    if (isOpen) setActiveIndex(-1);
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="context-menu-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchEnd={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        ref={menuRef}
        className="context-menu"
        style={{ left: adjustedPos.x, top: adjustedPos.y }}
        role="menu"
      >
        {visibleItems.map((item, index) => {
          if (item.divider) {
            return <div key={`divider-${index}`} className="context-menu-divider" role="separator" />;
          }

          const isDanger = item.variant === 'danger';

          return (
            <button
              key={`${item.label}-${index}`}
              role="menuitem"
              className={`context-menu-item ${isDanger ? 'context-menu-item--danger' : ''} ${index === activeIndex ? 'context-menu-item--active' : ''}`}
              onClick={() => {
                item.onClick();
                onClose();
              }}
            >
              {item.icon && <span className="context-menu-item-icon">{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

export default ContextMenu;
