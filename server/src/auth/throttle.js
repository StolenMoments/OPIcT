export function createLoginThrottle({ maxFailures = 5, windowMs = 15 * 60 * 1000, lockoutMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map();

  function get(client, now) {
    const current = attempts.get(client);
    if (!current || now - current.windowStartedAt >= windowMs) {
      const fresh = { failures: 0, windowStartedAt: now, lockedUntil: 0 };
      attempts.set(client, fresh);
      return fresh;
    }
    return current;
  }

  return {
    check(client, now = Date.now()) {
      const state = get(client, now);
      const retryAfterMs = Math.max(0, state.lockedUntil - now);
      return { locked: retryAfterMs > 0, retryAfterMs };
    },
    recordFailure(client, now = Date.now()) {
      const state = get(client, now);
      state.failures += 1;
      if (state.failures >= maxFailures) state.lockedUntil = now + lockoutMs;
    },
    recordSuccess(client) {
      attempts.delete(client);
    },
  };
}
