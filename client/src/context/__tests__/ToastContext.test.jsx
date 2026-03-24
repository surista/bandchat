import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from '../ToastContext';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderToastHook() {
  return renderHook(() => useToast(), { wrapper: ToastProvider });
}

// ───────────────────────────────────────────────────
// Toast Basics
// ───────────────────────────────────────────────────

describe('ToastProvider', () => {
  it('provides toast function', () => {
    const { result } = renderToastHook();
    expect(typeof result.current).toBe('function');
  });

  it('has success, error, warning, info methods', () => {
    const { result } = renderToastHook();
    expect(typeof result.current.success).toBe('function');
    expect(typeof result.current.error).toBe('function');
    expect(typeof result.current.warning).toBe('function');
    expect(typeof result.current.info).toBe('function');
  });
});

// ───────────────────────────────────────────────────
// Adding Toasts
// ───────────────────────────────────────────────────

describe('Adding toasts', () => {
  it('toast() renders info toast', () => {
    const { result } = renderToastHook();

    act(() => {
      result.current('Hello world');
    });

    expect(document.querySelector('.toast--info')).not.toBeNull();
    expect(document.querySelector('.toast-message').textContent).toBe('Hello world');
  });

  it('toast.success() renders success toast', () => {
    const { result } = renderToastHook();

    act(() => {
      result.current.success('Saved!');
    });

    expect(document.querySelector('.toast--success')).not.toBeNull();
  });

  it('toast.error() renders error toast', () => {
    const { result } = renderToastHook();

    act(() => {
      result.current.error('Something failed');
    });

    expect(document.querySelector('.toast--error')).not.toBeNull();
  });

  it('toast.warning() renders warning toast', () => {
    const { result } = renderToastHook();

    act(() => {
      result.current.warning('Watch out');
    });

    expect(document.querySelector('.toast--warning')).not.toBeNull();
  });

  it('returns toast ID', () => {
    const { result } = renderToastHook();

    let id;
    act(() => {
      id = result.current('Test');
    });

    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('multiple toasts render simultaneously', () => {
    const { result } = renderToastHook();

    act(() => {
      result.current('First');
      result.current('Second');
      result.current('Third');
    });

    const toasts = document.querySelectorAll('.toast');
    expect(toasts.length).toBe(3);
  });
});

// ───────────────────────────────────────────────────
// Auto-Dismiss
// ───────────────────────────────────────────────────

describe('Auto-dismiss', () => {
  it('info toast auto-dismisses after 4 seconds', () => {
    const { result } = renderToastHook();

    act(() => {
      result.current('Auto dismiss');
    });

    expect(document.querySelector('.toast')).not.toBeNull();

    // After 4s, toast should start exiting
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    // After exit animation (200ms), toast should be gone
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(document.querySelector('.toast')).toBeNull();
  });

  it('error toast auto-dismisses after 6 seconds', () => {
    const { result } = renderToastHook();

    act(() => {
      result.current.error('Error msg');
    });

    // Still visible at 4s
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(document.querySelector('.toast--error')).not.toBeNull();

    // After 6s total + 200ms exit animation
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(document.querySelector('.toast--error')).toBeNull();
  });
});

// ───────────────────────────────────────────────────
// Manual Dismiss
// ───────────────────────────────────────────────────

describe('Manual dismiss', () => {
  it('clicking close button removes toast', () => {
    const { result } = renderToastHook();

    act(() => {
      result.current('Dismissible');
    });

    const closeBtn = document.querySelector('.toast-close');
    expect(closeBtn).not.toBeNull();

    act(() => {
      closeBtn.click();
    });

    // After exit animation
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(document.querySelector('.toast')).toBeNull();
  });
});

// ───────────────────────────────────────────────────
// Accessibility
// ───────────────────────────────────────────────────

describe('Accessibility', () => {
  it('toast container has aria-live="polite"', () => {
    renderToastHook();
    const container = document.querySelector('.toast-container');
    expect(container.getAttribute('aria-live')).toBe('polite');
  });

  it('each toast has role="status"', () => {
    const { result } = renderToastHook();

    act(() => {
      result.current('Accessible toast');
    });

    const toast = document.querySelector('.toast');
    expect(toast.getAttribute('role')).toBe('status');
  });

  it('close button has aria-label="Dismiss"', () => {
    const { result } = renderToastHook();

    act(() => {
      result.current('Test');
    });

    const btn = document.querySelector('.toast-close');
    expect(btn.getAttribute('aria-label')).toBe('Dismiss');
  });
});

// ───────────────────────────────────────────────────
// Icons
// ───────────────────────────────────────────────────

describe('Toast icons', () => {
  it('success toast shows checkmark', () => {
    const { result } = renderToastHook();

    act(() => { result.current.success('OK'); });

    const icon = document.querySelector('.toast--success .toast-icon');
    expect(icon.textContent).toContain('✓');
  });

  it('error toast shows X', () => {
    const { result } = renderToastHook();

    act(() => { result.current.error('Fail'); });

    const icon = document.querySelector('.toast--error .toast-icon');
    expect(icon.textContent).toContain('✕');
  });

  it('warning toast shows exclamation', () => {
    const { result } = renderToastHook();

    act(() => { result.current.warning('Warn'); });

    const icon = document.querySelector('.toast--warning .toast-icon');
    expect(icon.textContent).toContain('!');
  });

  it('info toast shows info symbol', () => {
    const { result } = renderToastHook();

    act(() => { result.current.info('Info'); });

    const icon = document.querySelector('.toast--info .toast-icon');
    expect(icon.textContent).toContain('ℹ');
  });
});

// ───────────────────────────────────────────────────
// useToast without provider
// ───────────────────────────────────────────────────

describe('useToast without provider', () => {
  it('throws error outside provider', () => {
    expect(() => {
      renderHook(() => useToast());
    }).toThrow('useToast must be used within ToastProvider');
  });
});
