import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

/**
 * Workspace switcher dropdown component.
 * Shows all user's workspaces with quick-switch navigation.
 *
 * @param {Object} props
 * @param {Object} props.currentWorkspace - The currently active workspace
 * @param {Array} props.allWorkspaces - All workspaces the user belongs to
 * @param {function} props.onSwitch - Callback when switching workspaces (optional, defaults to navigate)
 */
function WorkspaceSwitcher({ currentWorkspace, allWorkspaces: initialWorkspaces = [] }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [freshWorkspaces, setFreshWorkspaces] = useState(null);

  // Use fresh data if available, otherwise fall back to initial prop
  const workspaces = freshWorkspaces || initialWorkspaces;

  // Filter out current workspace and sort by name
  const otherWorkspaces = workspaces
    .filter(ws => ws.id !== currentWorkspace?.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Position menu below trigger and refresh unread counts
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
      // Fetch fresh unread counts every time the switcher opens
      api.getWorkspaces().then(setFreshWorkspaces).catch(() => {});
    }
  }, [isOpen]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('context-menu-open');
    return () => document.body.classList.remove('context-menu-open');
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return;

    const totalItems = otherWorkspaces.length + 1; // +1 for "All Workspaces"

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < otherWorkspaces.length) {
          handleSelectWorkspace(otherWorkspaces[activeIndex]);
        } else if (activeIndex === otherWorkspaces.length) {
          handleGoToAllWorkspaces();
        }
        break;
    }
  }, [isOpen, activeIndex, otherWorkspaces]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Reset active index when menu opens
  useEffect(() => {
    if (isOpen) setActiveIndex(-1);
  }, [isOpen]);

  const handleSelectWorkspace = (workspace) => {
    setIsOpen(false);
    navigate(`/workspace/${workspace.id}`);
  };

  const handleGoToAllWorkspaces = () => {
    setIsOpen(false);
    navigate('/');
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full hover:bg-slack-hover rounded p-1 transition-colors group"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <div className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center overflow-hidden bg-white/20">
          {currentWorkspace?.avatarUrl ? (
            <img src={currentWorkspace.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white font-bold text-sm">
              {currentWorkspace?.name?.charAt(0).toUpperCase() || '?'}
            </span>
          )}
        </div>
        <span className="text-white font-bold text-lg truncate flex-1 text-left">
          {currentWorkspace?.name || 'Workspace'}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 group-hover:text-white transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu (Portal) */}
      {isOpen && createPortal(
        <div
          className="workspace-switcher-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div
            ref={menuRef}
            className="workspace-switcher-menu"
            style={{ top: menuPosition.top, left: menuPosition.left }}
            role="menu"
          >
            {/* Current Workspace (highlighted) */}
            <div className="workspace-switcher-current">
              <div className="workspace-switcher-item workspace-switcher-item--current">
                <div className="w-9 h-9 rounded-md flex-shrink-0 flex items-center justify-center overflow-hidden bg-white/20">
                  {currentWorkspace?.avatarUrl ? (
                    <img src={currentWorkspace.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white font-bold">
                      {currentWorkspace?.name?.charAt(0).toUpperCase() || '?'}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{currentWorkspace?.name}</div>
                  <div className="text-xs text-gray-400">Current workspace</div>
                </div>
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>

            {/* Other Workspaces */}
            {otherWorkspaces.length > 0 && (
              <div className="workspace-switcher-list">
                {otherWorkspaces.map((workspace, index) => (
                  <button
                    key={workspace.id}
                    role="menuitem"
                    className={`workspace-switcher-item ${activeIndex === index ? 'workspace-switcher-item--active' : ''}`}
                    onClick={() => handleSelectWorkspace(workspace)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <div className="w-9 h-9 rounded-md flex-shrink-0 flex items-center justify-center overflow-hidden bg-white/20">
                      {workspace.avatarUrl ? (
                        <img src={workspace.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-bold">
                          {workspace.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{workspace.name}</div>
                      <div className="text-xs text-gray-400">
                        {workspace._count?.members || 0} member{workspace._count?.members !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {workspace.unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center flex-shrink-0">
                        {workspace.unreadCount > 99 ? '99+' : workspace.unreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Footer: All Workspaces */}
            <div className="workspace-switcher-footer">
              <button
                role="menuitem"
                className={`workspace-switcher-item workspace-switcher-item--footer ${activeIndex === otherWorkspaces.length ? 'workspace-switcher-item--active' : ''}`}
                onClick={handleGoToAllWorkspaces}
                onMouseEnter={() => setActiveIndex(otherWorkspaces.length)}
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <span className="text-gray-300">All Workspaces</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default WorkspaceSwitcher;
