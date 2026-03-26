import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';

export default function MemberHoverCard({ userId, workspaceId, children, onClick }) {
  const hovercardId = `hovercard-${userId}`;
  const [isHovered, setIsHovered] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const hoverTimeout = useRef(null);
  const leaveTimeout = useRef(null);

  useEffect(() => {
    if (isHovered && !profile && !loading) {
      loadProfile();
    }
  }, [isHovered, profile, loading]);

  useEffect(() => {
    return () => {
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
      if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
    };
  }, []);

  async function loadProfile() {
    setLoading(true);
    try {
      const data = await api.getMemberProfile(workspaceId, userId);
      setProfile(data);
    } catch (err) {
      console.error('Failed to load profile for hover:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleMouseEnter(e) {
    if (leaveTimeout.current) {
      clearTimeout(leaveTimeout.current);
      leaveTimeout.current = null;
    }

    hoverTimeout.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        // Position to the right of the element, but keep within viewport
        const cardWidth = 280;
        let left = rect.right + 8;
        // If would go off right edge, position to the left instead
        if (left + cardWidth > window.innerWidth) {
          left = rect.left - cardWidth - 8;
        }
        // Keep card within viewport vertically
        let top = rect.top;
        if (top + 200 > window.innerHeight) {
          top = window.innerHeight - 220;
        }
        setPosition({ top: Math.max(10, top), left: Math.max(10, left) });
      }
      setIsHovered(true);
    }, 400); // Delay before showing
  }

  function handleMouseLeave() {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }

    leaveTimeout.current = setTimeout(() => {
      setIsHovered(false);
    }, 150);
  }

  function handleCardMouseEnter() {
    if (leaveTimeout.current) {
      clearTimeout(leaveTimeout.current);
      leaveTimeout.current = null;
    }
  }

  function handleCardMouseLeave() {
    leaveTimeout.current = setTimeout(() => {
      setIsHovered(false);
    }, 150);
  }

  const card = isHovered && createPortal(
    <div
      id={hovercardId}
      role="tooltip"
      className="fixed z-[100] bg-[var(--color-bg-secondary)] rounded-lg shadow-xl border border-[var(--color-border)] p-3 min-w-[200px] max-w-[280px]"
      style={{ top: position.top, left: position.left }}
      onMouseEnter={handleCardMouseEnter}
      onMouseLeave={handleCardMouseLeave}
    >
      {loading ? (
        <div className="text-[var(--color-text-muted)] text-sm">Loading...</div>
      ) : profile ? (
        <div>
          {/* Mini profile header */}
          <div className="flex items-center gap-2 mb-2">
            {profile.user.avatarUrl ? (
              <img
                src={profile.user.avatarUrl}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                {profile.user.displayName?.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-medium text-[var(--color-text-primary)] text-sm">{profile.user.displayName}</div>
              <div className="text-xs text-[var(--color-text-muted)]">{profile.role}</div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex gap-3 text-xs text-[var(--color-text-muted)] mb-2 border-t border-[var(--color-border)] pt-2">
            <span>{profile.stats.gigsAttended || 0} gigs</span>
            <span>{profile.stats.rehearsalsAttended || 0} rehearsals</span>
          </div>

          {/* Badges */}
          {profile.achievements.length > 0 ? (
            <div className="border-t border-[var(--color-border)] pt-2">
              <div className="text-xs text-[var(--color-text-muted)] mb-1">Badges</div>
              <div className="flex flex-wrap gap-1">
                {profile.achievements.slice(0, 8).map(a => (
                  <span
                    key={a.id}
                    className="text-lg"
                    title={`${a.name}: ${a.description}`}
                  >
                    {a.icon}
                  </span>
                ))}
                {profile.achievements.length > 8 && (
                  <span className="text-xs text-[var(--color-text-muted)] self-center">
                    +{profile.achievements.length - 8}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-text-muted)]">
              No badges yet
            </div>
          )}

          <div className="text-xs text-[var(--color-text-muted)] mt-2 text-center">
            Click for full profile
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );

  function handleFocus() {
    handleMouseEnter();
  }

  function handleBlur() {
    handleMouseLeave();
  }

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={onClick}
      tabIndex={0}
      role="button"
      aria-describedby={isHovered ? hovercardId : undefined}
      className="block w-full"
    >
      {children}
      {card}
    </div>
  );
}
