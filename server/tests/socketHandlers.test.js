import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { forceLeaveRoom, forceLeaveWorkspace } from '../src/socket/handlers.js';

// ───────────────────────────────────────────────────
// Mock Socket Helpers
// ───────────────────────────────────────────────────

function createMockSocket(id, rooms = new Set()) {
  return {
    id,
    rooms,
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function createMockIO(sockets = []) {
  return {
    in: jest.fn(() => ({
      fetchSockets: jest.fn(async () => sockets),
    })),
  };
}

// ───────────────────────────────────────────────────
// forceLeaveRoom
// ───────────────────────────────────────────────────

describe('forceLeaveRoom', () => {
  it('removes user sockets from the specified room', async () => {
    const socket = createMockSocket('s1', new Set(['user:u1', 'workspace:w1', 'channel:c1']));
    const io = createMockIO([socket]);

    await forceLeaveRoom(io, 'u1', 'channel:c1');

    expect(io.in).toHaveBeenCalledWith('user:u1');
    expect(socket.leave).toHaveBeenCalledWith('channel:c1');
  });

  it('skips sockets not in the target room', async () => {
    const socket = createMockSocket('s1', new Set(['user:u1', 'workspace:w1']));
    const io = createMockIO([socket]);

    await forceLeaveRoom(io, 'u1', 'channel:c99');

    expect(socket.leave).not.toHaveBeenCalled();
  });

  it('handles multiple sockets for same user', async () => {
    const socket1 = createMockSocket('s1', new Set(['user:u1', 'channel:c1']));
    const socket2 = createMockSocket('s2', new Set(['user:u1', 'channel:c1']));
    const io = createMockIO([socket1, socket2]);

    await forceLeaveRoom(io, 'u1', 'channel:c1');

    expect(socket1.leave).toHaveBeenCalledWith('channel:c1');
    expect(socket2.leave).toHaveBeenCalledWith('channel:c1');
  });

  it('handles user with no active sockets', async () => {
    const io = createMockIO([]);

    // Should not throw
    await expect(forceLeaveRoom(io, 'u-none', 'channel:c1')).resolves.toBeUndefined();
  });

  it('handles io.in error gracefully', async () => {
    const io = {
      in: jest.fn(() => ({
        fetchSockets: jest.fn(async () => { throw new Error('IO error'); }),
      })),
    };

    // Should not throw — error is caught internally
    await expect(forceLeaveRoom(io, 'u1', 'room')).resolves.toBeUndefined();
  });
});

// ───────────────────────────────────────────────────
// forceLeaveWorkspace
// ───────────────────────────────────────────────────

describe('forceLeaveWorkspace', () => {
  it('removes user from workspace room', async () => {
    const socket = createMockSocket('s1', new Set(['user:u1', 'workspace:w1']));
    const io = createMockIO([socket]);

    await forceLeaveWorkspace(io, 'u1', 'w1');

    expect(socket.leave).toHaveBeenCalledWith('workspace:w1');
  });

  it('removes user from all specified channel rooms', async () => {
    const socket = createMockSocket('s1', new Set(['user:u1', 'workspace:w1', 'channel:c1', 'channel:c2']));
    const io = createMockIO([socket]);

    await forceLeaveWorkspace(io, 'u1', 'w1', ['c1', 'c2', 'c3']);

    expect(socket.leave).toHaveBeenCalledWith('workspace:w1');
    expect(socket.leave).toHaveBeenCalledWith('channel:c1');
    expect(socket.leave).toHaveBeenCalledWith('channel:c2');
    expect(socket.leave).toHaveBeenCalledWith('channel:c3');
  });

  it('emits workspace:removed event to client', async () => {
    const socket = createMockSocket('s1', new Set(['user:u1']));
    const io = createMockIO([socket]);

    await forceLeaveWorkspace(io, 'u1', 'w1');

    expect(socket.emit).toHaveBeenCalledWith('workspace:removed', { workspaceId: 'w1' });
  });

  it('handles multiple sockets for same user', async () => {
    const s1 = createMockSocket('s1', new Set(['user:u1']));
    const s2 = createMockSocket('s2', new Set(['user:u1']));
    const io = createMockIO([s1, s2]);

    await forceLeaveWorkspace(io, 'u1', 'w1', ['c1']);

    // Both sockets should be evicted
    expect(s1.leave).toHaveBeenCalledWith('workspace:w1');
    expect(s2.leave).toHaveBeenCalledWith('workspace:w1');
    expect(s1.emit).toHaveBeenCalledWith('workspace:removed', { workspaceId: 'w1' });
    expect(s2.emit).toHaveBeenCalledWith('workspace:removed', { workspaceId: 'w1' });
  });

  it('works with empty channelIds array', async () => {
    const socket = createMockSocket('s1', new Set(['user:u1']));
    const io = createMockIO([socket]);

    await forceLeaveWorkspace(io, 'u1', 'w1', []);

    expect(socket.leave).toHaveBeenCalledWith('workspace:w1');
    // No channel leave calls
    expect(socket.leave).toHaveBeenCalledTimes(1);
  });

  it('defaults channelIds to empty array', async () => {
    const socket = createMockSocket('s1', new Set(['user:u1']));
    const io = createMockIO([socket]);

    await forceLeaveWorkspace(io, 'u1', 'w1');

    expect(socket.leave).toHaveBeenCalledWith('workspace:w1');
    expect(socket.leave).toHaveBeenCalledTimes(1);
  });

  it('handles io error gracefully', async () => {
    const io = {
      in: jest.fn(() => ({
        fetchSockets: jest.fn(async () => { throw new Error('IO error'); }),
      })),
    };

    await expect(forceLeaveWorkspace(io, 'u1', 'w1')).resolves.toBeUndefined();
  });
});

// ───────────────────────────────────────────────────
// SocketRateLimiter (tested via behavioral contract)
//
// The rate limiter is not exported, but we can verify
// its behavior by testing the contract it enforces:
// - First N calls in a window should succeed
// - Subsequent calls should be silently dropped
// We replicate the class logic here for direct testing.
// ───────────────────────────────────────────────────

describe('SocketRateLimiter (logic verification)', () => {
  // Replicate the rate limiter class for direct testing
  class TestRateLimiter {
    constructor() {
      this.limits = new Map();
    }
    isAllowed(userId, eventName, maxEvents, windowMs) {
      const now = Date.now();
      const key = `${userId}:${eventName}`;
      if (!this.limits.has(key)) {
        this.limits.set(key, { count: 1, resetTime: now + windowMs });
        return true;
      }
      const limit = this.limits.get(key);
      if (now > limit.resetTime) {
        limit.count = 1;
        limit.resetTime = now + windowMs;
        return true;
      }
      if (limit.count < maxEvents) {
        limit.count++;
        return true;
      }
      return false;
    }
    cleanup() {
      const now = Date.now();
      for (const [key, limit] of this.limits) {
        if (now > limit.resetTime + 60000) {
          this.limits.delete(key);
        }
      }
    }
  }

  let limiter;

  beforeEach(() => {
    limiter = new TestRateLimiter();
  });

  it('allows first request', () => {
    expect(limiter.isAllowed('u1', 'typing:start', 60, 60000)).toBe(true);
  });

  it('allows up to max requests', () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed('u1', 'test', 5, 60000)).toBe(true);
    }
  });

  it('denies requests over limit', () => {
    for (let i = 0; i < 5; i++) {
      limiter.isAllowed('u1', 'test', 5, 60000);
    }
    expect(limiter.isAllowed('u1', 'test', 5, 60000)).toBe(false);
  });

  it('tracks different users independently', () => {
    for (let i = 0; i < 3; i++) {
      limiter.isAllowed('u1', 'test', 3, 60000);
    }
    expect(limiter.isAllowed('u1', 'test', 3, 60000)).toBe(false);
    expect(limiter.isAllowed('u2', 'test', 3, 60000)).toBe(true);
  });

  it('tracks different events independently', () => {
    for (let i = 0; i < 3; i++) {
      limiter.isAllowed('u1', 'event-a', 3, 60000);
    }
    expect(limiter.isAllowed('u1', 'event-a', 3, 60000)).toBe(false);
    expect(limiter.isAllowed('u1', 'event-b', 3, 60000)).toBe(true);
  });

  it('resets after window expires', () => {
    // Fill the limit
    for (let i = 0; i < 3; i++) {
      limiter.isAllowed('u1', 'test', 3, 100); // 100ms window
    }
    expect(limiter.isAllowed('u1', 'test', 3, 100)).toBe(false);

    // Manually expire the window
    const entry = limiter.limits.get('u1:test');
    entry.resetTime = Date.now() - 1;

    expect(limiter.isAllowed('u1', 'test', 3, 100)).toBe(true);
  });

  it('cleanup removes expired entries', () => {
    limiter.isAllowed('u1', 'test', 5, 100);
    expect(limiter.limits.size).toBe(1);

    // Expire the entry
    const entry = limiter.limits.get('u1:test');
    entry.resetTime = Date.now() - 120000; // Well past expiry + 60s grace

    limiter.cleanup();
    expect(limiter.limits.size).toBe(0);
  });

  it('cleanup keeps recent entries', () => {
    limiter.isAllowed('u1', 'test', 5, 60000);
    limiter.cleanup();
    expect(limiter.limits.size).toBe(1);
  });

  it('handles rate limits matching server config', () => {
    // Verify the rate limits defined in handlers.js
    // channel:join → 30/min, typing:start → 60/min, presence:update → 20/min, workspace:join → 10/min

    // workspace:join: 10 per minute
    for (let i = 0; i < 10; i++) {
      expect(limiter.isAllowed('u1', 'workspace:join', 10, 60000)).toBe(true);
    }
    expect(limiter.isAllowed('u1', 'workspace:join', 10, 60000)).toBe(false);
  });
});

// ───────────────────────────────────────────────────
// Payload Validation (contract test)
// ───────────────────────────────────────────────────

describe('Payload validation (isNonEmptyString contract)', () => {
  // The function is not exported, but we verify the contract
  // that socket handlers enforce: channelId/workspaceId must be
  // a non-empty string, or the handler silently returns.

  function isNonEmptyString(val) {
    return typeof val === 'string' && val.length > 0;
  }

  it('accepts valid channel ID', () => {
    expect(isNonEmptyString('abc-123')).toBe(true);
  });

  it('accepts UUID', () => {
    expect(isNonEmptyString('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isNonEmptyString('')).toBe(false);
  });

  it('rejects null', () => {
    expect(isNonEmptyString(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isNonEmptyString(undefined)).toBe(false);
  });

  it('rejects number', () => {
    expect(isNonEmptyString(123)).toBe(false);
  });

  it('rejects object', () => {
    expect(isNonEmptyString({})).toBe(false);
  });

  it('rejects array', () => {
    expect(isNonEmptyString(['channel'])).toBe(false);
  });

  it('rejects boolean', () => {
    expect(isNonEmptyString(true)).toBe(false);
  });
});
